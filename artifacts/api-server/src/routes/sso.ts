import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { broadcast } from "../lib/socket";
import { getAiSettings } from "../lib/ai";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, usersTable, conversationsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import {
  issueRefreshToken,
  refreshCookieOptions,
  serializeUser,
  signAccessToken,
  REFRESH_COOKIE_NAME,
} from "../lib/auth";

const router: IRouter = Router();

const EXTERNAL_BASE_URL =
  process.env["EXTERNAL_API_BASE_URL"] || "https://laxminarayan.live/api";

interface ExternalUser {
  _id?: string;
  id?: string;
  name?: string;
  fullName?: string;
  email?: string;
  empCode?: string;
  emp_code?: string;
}

interface ExternalResult {
  user: ExternalUser | null;
  debug: { url: string; status?: number; body?: string; error?: string };
}

async function fetchExternalUser(
  userId: string,
  authHeader: string,
): Promise<ExternalResult> {
  const url = `${EXTERNAL_BASE_URL}/User/getUser`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader,
        // WAF allow-rule key (see DOMAIN_API_KEY secret).
        ...(process.env.DOMAIN_API_KEY
          ? { "X-API-Key": process.env.DOMAIN_API_KEY }
          : {}),
      },
      body: JSON.stringify({ _id: userId }),
    });
    const raw = await resp.text();
    if (!resp.ok) {
      return { user: null, debug: { url, status: resp.status, body: raw.slice(0, 500) } };
    }
    let data: any = {};
    try {
      data = JSON.parse(raw);
    } catch {
      return { user: null, debug: { url, status: resp.status, body: raw.slice(0, 500), error: "Response was not JSON" } };
    }
    // API shape: { status, payload: {...} }
    const user = (data?.payload ?? data?.data ?? data) as ExternalUser;
    return { user, debug: { url, status: resp.status } };
  } catch (e: any) {
    return { user: null, debug: { url, error: e?.message || "fetch failed" } };
  }
}

/**
 * SSO login for end-users launched from the host application.
 * Body: { userId: string }
 * Header: Authorization: Bearer <host app token> (forwarded to getUser)
 */
router.post("/auth/sso", async (req, res) => {
  const userId = String(req.body?.userId ?? "").trim();
  const authHeader = req.headers.authorization;

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  if (!authHeader) {
    res.status(401).json({ error: "Authorization header is required" });
    return;
  }

  const { user: fetched, debug } = await fetchExternalUser(userId, authHeader);
  logger.info({ ssoUpstream: debug, userId }, "SSO getUser upstream result");

  let ext = fetched;
  const hasUsableUser =
    ext && (ext._id || ext.id || ext.email || ext.empCode || ext.emp_code);

  // TEST FALLBACK (mock mode): the host API currently blocks this
  // server's IP, so allow launching with a synthetic user for UI testing.
  // Once the WAF allow-rule is live, set EXTERNAL_API_MOCK=false and only
  // real getUser responses will be accepted.
  const testFallbackEnabled = process.env["EXTERNAL_API_MOCK"] !== "false";
  if (!hasUsableUser && testFallbackEnabled) {
    const empFromQuery = String(
      (req.query["empCode"] as string) ?? req.body?.empCode ?? "",
    ).trim();
    const nameFromQuery = String(
      (req.query["name"] as string) ?? req.body?.name ?? "",
    ).trim();
    ext = {
      _id: userId,
      name: nameFromQuery || `Test User ${userId.slice(-4)}`,
      empCode: empFromQuery || "020",
    };
    logger.warn(
      { userId, empCode: ext.empCode },
      "SSO using TEST fallback user (host API unreachable)",
    );
  }

  if (!ext || (!ext._id && !ext.id && !ext.email && !ext.empCode && !ext.emp_code)) {
    res.status(502).json({
      error: "Could not fetch user details from the host application",
      upstreamStatus: debug.status ?? null,
      upstreamBody: debug.body ?? debug.error ?? null,
    });
    return;
  }

  const externalId = String(ext._id ?? ext.id ?? userId);
  const name = (ext.name ?? ext.fullName ?? "User").trim() || "User";
  const empCode = (ext.empCode ?? ext.emp_code ?? "").trim() || null;
  const email =
    (ext.email ?? `${externalId}@sso.local`).trim().toLowerCase();

  // Upsert local user by externalId
  let isNewUser = false;
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.externalId, externalId));

  if (!user) {
    const randomPassword = crypto.randomBytes(24).toString("hex");
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    [user] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        passwordHash,
        role: "user",
        externalId,
        empCode,
      })
      .returning();
    isNewUser = true;
  } else {
    // Respect an admin's decision to deactivate an account — never auto-reactivate.
    if (!user.isActive) {
      res.status(403).json({ error: "This account has been deactivated" });
      return;
    }
    // Keep profile fresh (without touching isActive)
    [user] = await db
      .update(usersTable)
      .set({ name, empCode })
      .where(eq(usersTable.id, user.id))
      .returning();
  }

  if (!user) {
    res.status(500).json({ error: "Failed to provision user" });
    return;
  }

  // Assign the agent whose empCode matches this user's empCode
  let assignedAgentId: number | null = null;
  if (empCode) {
    const [agent] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.empCode, empCode),
          eq(usersTable.role, "agent"),
          eq(usersTable.isActive, true),
        ),
      )
      .orderBy(asc(usersTable.id))
      .limit(1);
    if (agent) {
      assignedAgentId = agent.id;
      // Ensure a conversation exists between the user and the assigned agent
      const [a, b] =
        user.id < agent.id ? [user.id, agent.id] : [agent.id, user.id];
      const [existing] = await db
        .select({ id: conversationsTable.id, type: conversationsTable.type })
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.userAId, a),
            eq(conversationsTable.userBId, b),
          ),
        );
      if (!existing) {
        // New SSO users start in AI-first mode when the assistant is enabled.
        const settings = await getAiSettings();
        await db
          .insert(conversationsTable)
          .values({
            userAId: a,
            userBId: b,
            type: "caller",
            mode: settings.aiEnabled ? "ai" : "human",
          });
      } else if (existing.type !== "caller") {
        // The pair already chatted directly; the SSO link upgrades the
        // conversation to a caller-assigned support chat.
        await db
          .update(conversationsTable)
          .set({ type: "caller", updatedAt: new Date() })
          .where(eq(conversationsTable.id, existing.id));
      }
    }
  }

  // Now that the user exists AND their agent assignment/conversation are in
  // place, tell connected admins/agents the directory changed so their
  // dashboards (and the agent's conversation list) refresh without a reload.
  if (isNewUser) {
    broadcast("users:changed", { userId: user.id });
  }

  const refreshToken = await issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.json({
    accessToken: signAccessToken(user),
    user: serializeUser(user),
    assignedAgentId,
  });
});

export default router;
