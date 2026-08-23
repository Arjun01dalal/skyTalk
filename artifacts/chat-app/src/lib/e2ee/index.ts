// End-to-end encryption for staff direct & group chats (Signal protocol,
// pairwise fan-out: each message is encrypted separately for every member).
//
// - Private keys never leave this browser (IndexedDB).
// - The server stores only public key bundles and ciphertext envelopes.
// - Double Ratchet ciphertext can only be decrypted ONCE, so every decrypted
//   payload is written to a local plaintext cache; a new browser/device shows
//   "Encrypted message — not available on this device" for old messages.
import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type MessageType,
} from "@privacyresearch/libsignal-protocol-typescript";
import { customFetch } from "@workspace/api-client-react";
import { IndexedDbSignalStore } from "./store";
import { idbGet, idbPut, idbGetAllEntries } from "./db";

const DEVICE_ID = 1; // one logical device per user
const PREKEY_BATCH = 50;
const PREKEY_LOW_WATER = 20;

// Decrypted message payload (what actually travels inside the ciphertext).
export interface E2eePayload {
  text?: string;
  attachment?: {
    url: string;
    name: string;
    type: string; // original mime type
    size: number;
    key: string; // AES-256-GCM key, base64
    iv: string; // 12-byte IV, base64
  };
}

export interface EnvelopeIn {
  type: number;
  body: string; // base64 ciphertext
}

interface BundleOut {
  userId: number;
  registrationId: number;
  identityKey: string;
  signedPrekeyId: number;
  signedPrekeyPub: string;
  signedPrekeySignature: string;
  preKeyId: number | null;
  preKeyPub: string | null;
}

// ---- base64 <-> ArrayBuffer helpers ---------------------------------------

export function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// libsignal returns ciphertext as a "binary string"; envelopes travel as base64.
function binStrToB64(s: string): string {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bufToB64(bytes.buffer);
}

function b64ToBinStr(b64: string): string {
  return atob(b64);
}

// ---- manager ---------------------------------------------------------------

class E2eeManager {
  private store: IndexedDbSignalStore | null = null;
  private db: IDBDatabase | null = null;
  private userId = 0;
  private ready: Promise<void> | null = null;
  private decryptQueue: Promise<unknown> = Promise.resolve();
  private plaintextMem = new Map<number, E2eePayload | null>();

  /** Idempotent per-login initialization: keys generated & published. */
  init(userId: number): Promise<void> {
    if (this.userId === userId && this.ready) return this.ready;
    this.userId = userId;
    this.store = new IndexedDbSignalStore(userId);
    this.plaintextMem.clear();
    this.ready = this.doInit().catch((err) => {
      // Leave `ready` rejected; callers fall back to plaintext sending.
      console.error("E2EE init failed", err);
      throw err;
    });
    return this.ready;
  }

  isReady(): boolean {
    return !!this.store;
  }

  /**
   * Resolves true once init() has completed, false if init failed or was
   * never started within the grace period. Lets UI code that mounted BEFORE
   * init() was called (child effects run before parent effects) wait instead
   * of permanently marking messages "unavailable".
   */
  async whenReady(graceMs = 8000): Promise<boolean> {
    const deadline = Date.now() + graceMs;
    while (!this.ready && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!this.ready) return false;
    try {
      await this.ready;
      return true;
    } catch {
      return false;
    }
  }

  private async doInit(): Promise<void> {
    const store = this.store!;
    await store.open();
    this.db = (store as unknown as { db: IDBDatabase }).db ?? null;

    let identity = await store.getIdentityKeyPair();
    let registrationId = await store.getLocalRegistrationId();
    const fresh = !identity || registrationId == null;
    if (!identity || registrationId == null) {
      identity = await KeyHelper.generateIdentityKeyPair();
      registrationId = KeyHelper.generateRegistrationId();
      await store.put("identityKey", identity);
      await store.put("registrationId", registrationId);
    }

    // Server-side status: (re)publish if never published, if the server has a
    // different identity (another browser overwrote it — this browser takes
    // over), or if one-time prekeys run low.
    const status = await customFetch<{
      published: boolean;
      identityKey: string | null;
      oneTimePrekeyCount: number;
    }>("/api/e2ee/keys", { method: "GET" });
    const myIdentityB64 = bufToB64(identity.pubKey);
    const needPublish =
      fresh || !status.published || status.identityKey !== myIdentityB64;
    const needPrekeys = needPublish || status.oneTimePrekeyCount < PREKEY_LOW_WATER;
    if (!needPublish && !needPrekeys) return;

    // Signed prekey: reuse the stored one if present, else create it.
    let signedPreKeyId = (await store.get("signedPreKeyId")) as number | undefined;
    let signed: Awaited<ReturnType<typeof KeyHelper.generateSignedPreKey>>;
    const existingSigned = signedPreKeyId != null ? await store.loadSignedPreKey(signedPreKeyId) : undefined;
    if (signedPreKeyId != null && existingSigned) {
      const sig = (await store.get(`signed-prekey-sig:${signedPreKeyId}`)) as ArrayBuffer | undefined;
      if (sig) {
        signed = { keyId: signedPreKeyId, keyPair: existingSigned, signature: sig };
      } else {
        signed = await KeyHelper.generateSignedPreKey(identity, signedPreKeyId);
        await store.storeSignedPreKey(signed.keyId, signed.keyPair);
        await store.put(`signed-prekey-sig:${signed.keyId}`, signed.signature);
      }
    } else {
      signedPreKeyId = Math.floor(Math.random() * 0xffffff) + 1;
      signed = await KeyHelper.generateSignedPreKey(identity, signedPreKeyId);
      await store.put("signedPreKeyId", signedPreKeyId);
      await store.storeSignedPreKey(signed.keyId, signed.keyPair);
      await store.put(`signed-prekey-sig:${signed.keyId}`, signed.signature);
    }

    // Fresh batch of one-time prekeys.
    const nextIdRaw = (await store.get("nextPreKeyId")) as number | undefined;
    let nextId = nextIdRaw ?? Math.floor(Math.random() * 0xffff) * 100 + 1;
    const oneTime: { keyId: number; pubKey: string }[] = [];
    if (needPrekeys) {
      for (let i = 0; i < PREKEY_BATCH; i++) {
        const pk = await KeyHelper.generatePreKey(nextId);
        await store.storePreKey(pk.keyId, pk.keyPair);
        oneTime.push({ keyId: pk.keyId, pubKey: bufToB64(pk.keyPair.pubKey) });
        nextId++;
      }
      await store.put("nextPreKeyId", nextId);
    }

    await customFetch("/api/e2ee/keys", {
      method: "POST",
      body: JSON.stringify({
        registrationId,
        identityKey: myIdentityB64,
        signedPrekeyId: signed.keyId,
        signedPrekeyPub: bufToB64(signed.keyPair.pubKey),
        signedPrekeySignature: bufToB64(signed.signature),
        oneTimePrekeys: oneTime,
      }),
    });
  }

  private addr(userId: number): SignalProtocolAddress {
    return new SignalProtocolAddress(String(userId), DEVICE_ID);
  }

  /**
   * Make sure we have a Signal session with each recipient.
   * Returns the ids we could NOT establish a session with (no published keys).
   */
  async ensureSessions(userIds: number[]): Promise<number[]> {
    await this.ready;
    const store = this.store!;
    const missing: number[] = [];
    const need: number[] = [];
    for (const id of userIds) {
      if (await store.hasSession(this.addr(id).toString())) continue;
      need.push(id);
    }
    if (!need.length) return missing;
    const bundles = await customFetch<BundleOut[]>(
      `/api/e2ee/bundles?userIds=${need.join(",")}`,
      { method: "GET" },
    );
    const byUser = new Map(bundles.map((b) => [b.userId, b]));
    for (const id of need) {
      const b = byUser.get(id);
      if (!b) {
        missing.push(id);
        continue;
      }
      const device: DeviceType = {
        identityKey: b64ToBuf(b.identityKey),
        signedPreKey: {
          keyId: b.signedPrekeyId,
          publicKey: b64ToBuf(b.signedPrekeyPub),
          signature: b64ToBuf(b.signedPrekeySignature),
        },
        registrationId: b.registrationId,
        ...(b.preKeyId != null && b.preKeyPub
          ? { preKey: { keyId: b.preKeyId, publicKey: b64ToBuf(b.preKeyPub) } }
          : {}),
      };
      const builder = new SessionBuilder(store, this.addr(id));
      await builder.processPreKey(device);
    }
    return missing;
  }

  /** Encrypt a payload separately for each recipient (pairwise fan-out). */
  async encryptFor(
    recipientIds: number[],
    payload: E2eePayload,
  ): Promise<{ userId: number; type: number; body: string }[]> {
    await this.ready;
    const store = this.store!;
    const data = new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer;
    const out: { userId: number; type: number; body: string }[] = [];
    for (const id of recipientIds) {
      const cipher = new SessionCipher(store, this.addr(id));
      const msg: MessageType = await cipher.encrypt(data);
      out.push({ userId: id, type: msg.type, body: binStrToB64(msg.body ?? "") });
    }
    return out;
  }

  /**
   * Decrypt an envelope addressed to me. Serialized through a queue (ratchet
   * state must advance one message at a time) and cached so a message is only
   * ever decrypted once. Returns null when the ciphertext is not decryptable
   * on this device (e.g. it predates this browser's keys).
   */
  async decryptEnvelope(
    messageId: number,
    senderId: number,
    envelope: EnvelopeIn,
  ): Promise<E2eePayload | null> {
    await this.ready;
    const run = this.decryptQueue.then(() => this.doDecrypt(messageId, senderId, envelope));
    // Keep the queue alive even when a decrypt fails.
    this.decryptQueue = run.catch(() => {});
    return run;
  }

  private async doDecrypt(
    messageId: number,
    senderId: number,
    envelope: EnvelopeIn,
  ): Promise<E2eePayload | null> {
    const cached = await this.getCachedPlaintext(messageId);
    if (cached !== undefined) return cached;
    const store = this.store!;
    const cipher = new SessionCipher(store, this.addr(senderId));
    try {
      const body = b64ToBinStr(envelope.body);
      const buf =
        envelope.type === 3
          ? await cipher.decryptPreKeyWhisperMessage(body, "binary")
          : await cipher.decryptWhisperMessage(body, "binary");
      const payload = JSON.parse(new TextDecoder().decode(buf)) as E2eePayload;
      await this.cachePlaintext(messageId, payload);
      return payload;
    } catch (err) {
      console.warn(`E2EE: could not decrypt message ${messageId}`, err);
      // Cache the failure so we don't retry (and corrupt ratchet state) on
      // every render.
      await this.cachePlaintext(messageId, null);
      return null;
    }
  }

  // ---- plaintext cache (decrypt-once constraint) -----------------------

  async getCachedPlaintext(messageId: number): Promise<E2eePayload | null | undefined> {
    if (this.plaintextMem.has(messageId)) return this.plaintextMem.get(messageId);
    if (!this.db) return undefined;
    const v = await idbGet<string>(this.db, "plaintext", messageId);
    if (v === undefined) return undefined;
    const parsed = v === "" ? null : (JSON.parse(v) as E2eePayload);
    this.plaintextMem.set(messageId, parsed);
    return parsed;
  }

  async cachePlaintext(messageId: number, payload: E2eePayload | null): Promise<void> {
    this.plaintextMem.set(messageId, payload);
    if (this.db) {
      await idbPut(this.db, "plaintext", messageId, payload === null ? "" : JSON.stringify(payload));
    }
  }

  // ---- history backup (export/import of the local plaintext cache) -----

  getUserId(): number {
    return this.userId;
  }

  /**
   * All successfully-decrypted messages as [messageId, payloadJson] pairs.
   * Cached decrypt FAILURES ("" markers) are excluded — they are
   * device-specific and worthless on another browser.
   */
  async exportPlaintextEntries(): Promise<[number, string][]> {
    await this.ready;
    if (!this.db) return [];
    const all = await idbGetAllEntries<string>(this.db, "plaintext");
    return all
      .filter(([, v]) => typeof v === "string" && v !== "")
      .map(([k, v]) => [Number(k), v]);
  }

  /**
   * Merge imported plaintext entries into this device's cache. Real payloads
   * always win over cached decrypt failures; existing successful decrypts are
   * kept as-is. Returns the number of entries written.
   */
  async importPlaintextEntries(entries: [number, string][]): Promise<number> {
    await this.ready;
    if (!this.db) throw new Error("E2EE not initialized");
    let written = 0;
    for (const [id, json] of entries) {
      if (!Number.isInteger(id) || typeof json !== "string" || json === "") continue;
      let payload: E2eePayload;
      try {
        payload = JSON.parse(json) as E2eePayload;
      } catch {
        continue;
      }
      const existing = await this.getCachedPlaintext(id);
      if (existing !== undefined && existing !== null) continue; // keep local decrypt
      await this.cachePlaintext(id, payload);
      written++;
    }
    return written;
  }
}

export const e2ee = new E2eeManager();

// ---- encrypted attachments (AES-256-GCM, key travels inside the envelope) --

export async function encryptFile(file: File | Blob): Promise<{
  blob: Blob;
  key: string;
  iv: string;
}> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await file.arrayBuffer();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return {
    blob: new Blob([cipher], { type: "application/octet-stream" }),
    key: bufToB64(rawKey),
    iv: bufToB64(iv.buffer),
  };
}

export async function decryptFileFromUrl(
  url: string,
  keyB64: string,
  ivB64: string,
  mimeType: string,
): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch encrypted attachment (${res.status})`);
  const cipher = await res.arrayBuffer();
  const key = await crypto.subtle.importKey("raw", b64ToBuf(keyB64), { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) },
    key,
    cipher,
  );
  return new Blob([plain], { type: mimeType });
}
