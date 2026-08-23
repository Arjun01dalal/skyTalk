import { Router, type IRouter } from "express";
import {
  type AuthenticatedRequest,
  requireAuth,
} from "../lib/auth";
import { externalMocks } from "../lib/external-mocks";

// Staff-only proxy to the customer's own domain API (laxminarayan.live).
// The browser cannot call it directly (no CORS + WAF), so the frontend calls
// this route and the backend forwards server-to-server.
// Base URL is configurable so it can be pointed at a staging host if needed.
const EXTERNAL_API_BASE =
  process.env.EXTERNAL_API_BASE ?? "https://laxminarayan.live/api";

const TIMEOUT_MS = 20_000;

// Only these read-only report endpoints may be proxied. Keeping an explicit
// allowlist (plus GET-only below) prevents the proxy from becoming a broad
// authenticated bridge into the domain API.
const ALLOWED_PATHS = new Set([
  "deposit-list",
  "withdrawal-list",
  "kyc-list",
  "bet-history",
]);

const router: IRouter = Router();

router.get(
  // Express 5 wildcard syntax: named splat param.
  "/external/*splat",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    if (req.auth!.role === "user") {
      res.status(403).json({ error: "Staff only" });
      return;
    }

    // Path after /external/, plus original query string.
    const splat = (req.params as Record<string, string | string[]>).splat;
    const subPath = (Array.isArray(splat) ? splat.join("/") : (splat ?? "")).replace(/\/$/, "");

    if (!ALLOWED_PATHS.has(subPath)) {
      res.status(404).json({
        error: `Unknown report endpoint '${subPath}'. Allowed: ${[...ALLOWED_PATHS].join(", ")}`,
      });
      return;
    }

    // TEMPORARY mock mode (default ON until the domain's WAF is opened).
    // Set EXTERNAL_API_MOCK=false to proxy to the real API.
    if (process.env.EXTERNAL_API_MOCK !== "false") {
      const mock = externalMocks[subPath];
      if (mock) {
        res.json(mock);
        return;
      }
      res.status(404).json({
        error: `No mock for '${subPath}'. Available: ${Object.keys(externalMocks).join(", ")} (or set EXTERNAL_API_MOCK=false to use the real API).`,
      });
      return;
    }
    const qs = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    const target = `${EXTERNAL_API_BASE.replace(/\/$/, "")}/${subPath}${qs}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      // Read-only: GET forwarded without a body.
      const upstream = await fetch(target, {
        method: "GET",
        headers: {
          accept: "application/json",
          // Some WAF setups reject requests without a browser-like UA.
          "user-agent":
            "Mozilla/5.0 (compatible; ChatSpaceSupport/1.0; +server-proxy)",
          // WAF allow-rule key (see DOMAIN_API_KEY secret).
          ...(process.env.DOMAIN_API_KEY
            ? { "X-API-Key": process.env.DOMAIN_API_KEY }
            : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await upstream.text();
      res.status(upstream.status);
      const ct = upstream.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        res.type("application/json").send(text);
      } else {
        // Upstream returned HTML (e.g. WAF block page) — surface a clear error.
        res.type("application/json").send(
          JSON.stringify({
            error: `Upstream returned non-JSON response (status ${upstream.status})`,
            hint:
              upstream.status === 403
                ? "The domain's firewall (AWS WAF/ALB) is blocking this server. Allow /api/* for server-to-server calls."
                : undefined,
          }),
        );
      }
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      res.status(502).json({
        error: aborted
          ? "Upstream API timed out"
          : "Could not reach upstream API",
      });
    }
  },
);

export default router;
