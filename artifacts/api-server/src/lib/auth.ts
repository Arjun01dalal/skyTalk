import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable, refreshTokensTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

const SESSION_SECRET = process.env["SESSION_SECRET"];
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

const ACCESS_SECRET = `${SESSION_SECRET}.access`;
export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const REFRESH_COOKIE_NAME = "refresh_token";

export interface AccessTokenPayload {
  sub: number;
  role: "admin" | "agent" | "user";
}

export function signAccessToken(user: Pick<User, "id" | "role">): string {
  return jwt.sign({ role: user.role }, ACCESS_SECRET, {
    subject: String(user.id),
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    if (!decoded.sub) return null;
    return { sub: Number(decoded.sub), role: decoded["role"] };
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(48).toString("hex");
  await db.insert(refreshTokensTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

export async function consumeRefreshToken(
  token: string,
): Promise<User | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, tokenHash));
  if (!row) return null;
  // Rotate: delete the used token
  await db
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.id, row.id));
  if (row.expiresAt.getTime() < Date.now()) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, row.userId));
  if (!user || !user.isActive) return null;
  return user;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, hashToken(token)));
}

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenPayload;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.auth = payload;

  // Staff accounts still on the default starter password may not use the API
  // until they change it — the frontend redirect alone would be bypassable
  // with a raw token. End-users ("user" role) are exempt, so they never pay
  // the extra lookup.
  if (payload.role !== "user" && !PASSWORD_CHANGE_ALLOWED_PATHS.has(req.path)) {
    db.select({ mustChangePassword: usersTable.mustChangePassword })
      .from(usersTable)
      .where(eq(usersTable.id, payload.sub))
      .then(([row]) => {
        if (row?.mustChangePassword) {
          res.status(403).json({
            error: "Password change required",
            code: "password_change_required",
          });
          return;
        }
        next();
      })
      .catch(next);
    return;
  }

  next();
}

// Endpoints a must-change-password staff account may still reach.
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  "/auth/change-password",
  "/auth/me",
  "/auth/logout",
]);

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    empCode: user.empCode ?? null,
    mobile: user.mobile ?? null,
    avatarUrl: user.avatarUrl ?? null,
    isActive: user.isActive,
    isOnline: user.isOnline,
    mustChangePassword: user.mustChangePassword,
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}
