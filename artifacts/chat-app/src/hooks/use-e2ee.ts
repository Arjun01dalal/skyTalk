// React hooks for E2EE message decryption & encrypted attachment display.
import { useEffect, useState } from "react";
import type { Message } from "@workspace/api-client-react";
import { e2ee, decryptFileFromUrl, type E2eePayload, type EnvelopeIn } from "@/lib/e2ee";

export type DecryptState =
  | { kind: "plain" } // not an encrypted message — use msg.content as usual
  | { kind: "pending" }
  | { kind: "unavailable" } // can't be decrypted on this device
  | { kind: "ready"; payload: E2eePayload };

type EncryptedFields = { encrypted?: boolean; envelope?: EnvelopeIn | null };

/** Decrypt an encrypted message (cached after the first decrypt). */
export function useDecryptedMessage(msg: Message): DecryptState {
  const enc = msg as Message & EncryptedFields;
  const isEncrypted = !!enc.encrypted;
  const [state, setState] = useState<DecryptState>(
    isEncrypted ? { kind: "pending" } : { kind: "plain" },
  );

  useEffect(() => {
    if (!isEncrypted) {
      setState({ kind: "plain" });
      return;
    }
    let alive = true;
    (async () => {
      // Wait for E2EE init (keys may still be loading right after page load).
      const ready = await e2ee.whenReady();
      if (!alive) return;
      if (!ready) {
        setState({ kind: "unavailable" });
        return;
      }
      // Plaintext cache first (covers our own sent messages and anything
      // already decrypted — Signal ciphertext can only be decrypted once).
      const cached = await e2ee.getCachedPlaintext(msg.id);
      if (!alive) return;
      if (cached !== undefined) {
        setState(cached === null ? { kind: "unavailable" } : { kind: "ready", payload: cached });
        return;
      }
      if (!enc.envelope || msg.senderId == null) {
        setState({ kind: "unavailable" });
        return;
      }
      const payload = await e2ee.decryptEnvelope(msg.id, msg.senderId, enc.envelope);
      if (!alive) return;
      setState(payload === null ? { kind: "unavailable" } : { kind: "ready", payload });
    })().catch(() => {
      if (alive) setState({ kind: "unavailable" });
    });
    return () => {
      alive = false;
    };
    // envelope identity is stable per message id
  }, [msg.id, isEncrypted]);

  return state;
}

/** Fetch + decrypt an encrypted attachment into a temporary object URL. */
export function useDecryptedAttachment(att: E2eePayload["attachment"] | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!att) {
      setUrl(null);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    decryptFileFromUrl(att.url, att.key, att.iv, att.type)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att?.url]);
  return url;
}
