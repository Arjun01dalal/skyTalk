// SignalProtocolStore backed by IndexedDB.
// Private keys live ONLY here (in the browser) — never sent to the server.
import type { StorageType, Direction, KeyPairType, SessionRecordType } from "@privacyresearch/libsignal-protocol-typescript";
import { openE2eeDb, idbGet, idbPut, idbDelete } from "./db";

type StoredValue = KeyPairType<ArrayBuffer> | SessionRecordType | ArrayBuffer | number | string | undefined;

export class IndexedDbSignalStore implements StorageType {
  private db: IDBDatabase | null = null;
  private cache = new Map<string, StoredValue>();

  constructor(private readonly userId: number) {}

  async open(): Promise<void> {
    if (!this.db) this.db = await openE2eeDb(this.userId);
  }

  private need(): IDBDatabase {
    if (!this.db) throw new Error("E2EE store not opened");
    return this.db;
  }

  async get(key: string): Promise<StoredValue> {
    if (this.cache.has(key)) return this.cache.get(key);
    const v = await idbGet<StoredValue>(this.need(), "signal", key);
    this.cache.set(key, v);
    return v;
  }

  async put(key: string, value: StoredValue): Promise<void> {
    this.cache.set(key, value);
    await idbPut(this.need(), "signal", key, value);
  }

  async remove(key: string): Promise<void> {
    this.cache.delete(key);
    await idbDelete(this.need(), "signal", key);
  }

  // ---- StorageType interface -------------------------------------------

  async getIdentityKeyPair(): Promise<KeyPairType<ArrayBuffer> | undefined> {
    return (await this.get("identityKey")) as KeyPairType<ArrayBuffer> | undefined;
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return (await this.get("registrationId")) as number | undefined;
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, _direction: Direction): Promise<boolean> {
    if (!identifier) throw new Error("Missing identifier");
    const trusted = (await this.get(`identity:${identifier}`)) as ArrayBuffer | undefined;
    if (!trusted) return true; // trust on first use
    return bufEq(identityKey, trusted);
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer, _nonblockingApproval?: boolean): Promise<boolean> {
    const name = encodedAddress.split(".")[0]!;
    const existing = (await this.get(`identity:${name}`)) as ArrayBuffer | undefined;
    await this.put(`identity:${name}`, publicKey);
    return !!existing && !bufEq(existing, publicKey);
  }

  async loadIdentityKey(identifier: string): Promise<ArrayBuffer | undefined> {
    return (await this.get(`identity:${identifier}`)) as ArrayBuffer | undefined;
  }

  async loadPreKey(keyId: number | string): Promise<KeyPairType<ArrayBuffer> | undefined> {
    return (await this.get(`prekey:${keyId}`)) as KeyPairType<ArrayBuffer> | undefined;
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType<ArrayBuffer>): Promise<void> {
    await this.put(`prekey:${keyId}`, keyPair);
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await this.remove(`prekey:${keyId}`);
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType<ArrayBuffer> | undefined> {
    return (await this.get(`signed-prekey:${keyId}`)) as KeyPairType<ArrayBuffer> | undefined;
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType<ArrayBuffer>): Promise<void> {
    await this.put(`signed-prekey:${keyId}`, keyPair);
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await this.remove(`signed-prekey:${keyId}`);
  }

  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    return (await this.get(`session:${encodedAddress}`)) as SessionRecordType | undefined;
  }

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    await this.put(`session:${encodedAddress}`, record);
  }

  async hasSession(encodedAddress: string): Promise<boolean> {
    return !!(await this.loadSession(encodedAddress));
  }
}

function bufEq(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
