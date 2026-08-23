import { createHmac, randomBytes } from "node:crypto";

// 4-hour TTL covers a full business call without requiring credential renewal.
// The browser's RTCPeerConnection uses the credential only during allocation
// and allocation refresh; once a relay connection is established the credential
// TTL does not affect media flow, but coturn validates it on Refresh requests.
const TURN_CREDENTIAL_TTL_SECONDS = 4 * 60 * 60;

export type TurnIceServer = {
  urls: string[];
  username: string;
  credential: string;
  credentialType: "password";
};

function configuredTurnUrls(): string[] {
  return (process.env["TURN_URLS"] ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

export type StunIceServer = {
  urls: string[];
};

/**
 * Public STUN fallback used when TURN is not yet configured.
 * This preserves basic peer-to-peer call functionality; relayed audio on
 * restrictive networks only works once a coturn service is provisioned and
 * TURN_URLS + TURN_SHARED_SECRET are set.
 */
export function getStunFallbackIceServer(): StunIceServer {
  return {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  };
}

export function issueTurnIceServer(userId: number): TurnIceServer | null {
  const urls = configuredTurnUrls();
  const sharedSecret = process.env["TURN_SHARED_SECRET"];
  if (!sharedSecret || urls.length === 0) return null;

  if (urls.some((url) => !/^turns?:/i.test(url))) {
    throw new Error("TURN_URLS must contain only turn: or turns: relay URLs.");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:${userId}:${randomBytes(6).toString("hex")}`;
  const credential = createHmac("sha1", sharedSecret)
    .update(username)
    .digest("base64");

  return { urls, username, credential, credentialType: "password" };
}
