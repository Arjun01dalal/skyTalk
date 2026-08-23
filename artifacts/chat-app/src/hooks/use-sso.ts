import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/auth";

/**
 * Detects an SSO launch from the host application.
 *
 * The host app opens the chat with URL params, e.g.:
 *   /chat-app/?userId=<hostUserId>&token=<hostAppToken>
 *
 * We exchange those for a local chat session via POST /api/auth/sso,
 * store the resulting access token, then strip the params from the URL.
 */
export function useSso() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  // Read params synchronously so we know immediately whether this is an SSO launch.
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">(
    () => {
      const p = new URLSearchParams(window.location.search);
      return (p.get("userId") || p.get("dpId")) && p.get("token")
        ? "pending"
        : "done";
    },
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "pending") return;

    const params = new URLSearchParams(window.location.search);
    // The host app identifies its user via dpId (preferred) or userId.
    const userId = params.get("dpId") || params.get("userId");
    const token = params.get("token");
    const empCode = params.get("empCode"); // optional, used by the test launcher
    const name = params.get("name"); // optional, test launcher only (mock mode)
    if (!userId || !token) {
      setStatus("done");
      return;
    }

    const bearer = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

    // Strip sensitive auth params from the URL immediately, before any network
    // call, so the bearer token never lingers in history/address bar/referer —
    // even if the exchange below fails.
    const clean = new URL(window.location.href);
    clean.searchParams.delete("userId");
    clean.searchParams.delete("dpId");
    clean.searchParams.delete("token");
    clean.searchParams.delete("empCode");
    clean.searchParams.delete("name");
    window.history.replaceState({}, "", clean.toString());

    (async () => {
      try {
        const resp = await fetch("/api/auth/sso", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: bearer,
          },
          credentials: "include",
          body: JSON.stringify({
            userId,
            ...(empCode ? { empCode } : {}),
            ...(name ? { name } : {}),
          }),
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error || "SSO login failed");
        }
        const data = await resp.json();
        setAccessToken(data.accessToken);
        setStatus("done");
      } catch (e: any) {
        setError(e?.message || "SSO login failed");
        setStatus("error");
      }
    })();
  }, [status, setAccessToken]);

  return { ssoStatus: status, ssoError: error };
}
