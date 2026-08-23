// Passphrase-protected export/import of the local E2EE plaintext cache.
//
// Signal's decrypt-once constraint means old encrypted messages can only be
// read on the device that first decrypted them. This module lets a staff user
// carry that history to a new browser: the plaintext cache is serialized,
// encrypted client-side with a key derived from a user-chosen passphrase
// (PBKDF2-SHA256 → AES-256-GCM), and downloaded as a file. The server never
// sees the backup — it keeps storing only ciphertext and public keys.
import { e2ee, bufToB64, b64ToBuf } from "./index";

const FORMAT = "skytalk-e2ee-backup";
const VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  data: string; // base64 AES-256-GCM ciphertext of BackupPayload JSON
}

interface BackupPayload {
  userId: number;
  exportedAt: string;
  entries: [number, string][]; // messageId -> payload JSON
}

async function deriveKey(passphrase: string, salt: ArrayBuffer, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Build an encrypted backup of this device's decrypted-message cache. */
export async function createHistoryBackup(passphrase: string): Promise<{ blob: Blob; count: number; filename: string }> {
  const entries = await e2ee.exportPlaintextEntries();
  const payload: BackupPayload = {
    userId: e2ee.getUserId(),
    exportedAt: new Date().toISOString(),
    entries,
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt.buffer, PBKDF2_ITERATIONS);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: bufToB64(salt.buffer),
    iv: bufToB64(iv.buffer),
    data: bufToB64(cipher),
  };
  const date = new Date().toISOString().slice(0, 10);
  return {
    blob: new Blob([JSON.stringify(file)], { type: "application/json" }),
    count: entries.length,
    filename: `skytalk-chat-history-${date}.e2ee-backup.json`,
  };
}

/**
 * Decrypt a backup file and merge it into this device's plaintext cache.
 * Throws with a user-readable message on bad file / wrong passphrase /
 * wrong account.
 */
export async function restoreHistoryBackup(fileText: string, passphrase: string): Promise<{ imported: number; total: number }> {
  let file: BackupFile;
  try {
    file = JSON.parse(fileText) as BackupFile;
  } catch {
    throw new Error("This is not a valid backup file.");
  }
  if (file.format !== FORMAT || file.kdf !== "PBKDF2-SHA256" || !file.salt || !file.iv || !file.data) {
    throw new Error("This is not a valid backup file.");
  }
  if (file.version !== VERSION) {
    throw new Error("This backup was created by a newer version of the app.");
  }
  const iterations = Number(file.iterations);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5_000_000) {
    throw new Error("This is not a valid backup file.");
  }
  const key = await deriveKey(passphrase, b64ToBuf(file.salt), iterations);
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(file.iv)) },
      key,
      b64ToBuf(file.data),
    );
  } catch {
    throw new Error("Wrong passphrase (or the file is corrupted).");
  }
  const payload = JSON.parse(new TextDecoder().decode(plainBuf)) as BackupPayload;
  if (payload.userId !== e2ee.getUserId()) {
    throw new Error("This backup belongs to a different account.");
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error("This is not a valid backup file.");
  }
  const imported = await e2ee.importPlaintextEntries(payload.entries);
  return { imported, total: payload.entries.length };
}
