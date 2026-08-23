import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  ChangePasswordBody,
  RequestOtpBody,
  VerifyOtpBody,
  CompleteOtpSignupBody,
  UpdateProfileBody,
} from "@workspace/api-zod";
import {
  type AuthenticatedRequest,
  consumeRefreshToken,
  issueRefreshToken,
  refreshCookieOptions,
  requireAuth,
  revokeRefreshToken,
  serializeUser,
  signAccessToken,
  REFRESH_COOKIE_NAME,
} from "../lib/auth";
import { broadcast } from "../lib/socket";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Name, email and a password of at least 8 characters are required" });
    return;
  }
  const { name, email, password, mobile } = parsed.data;
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    res.status(400).json({ error: "An account with this email already exists" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "user",
      mobile: mobile?.trim() || null,
    })
    .returning();
  if (!user) {
    res.status(500).json({ error: "Failed to create account" });
    return;
  }
  broadcast("users:changed", { userId: user.id });
  const refreshToken = await issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.status(201).json({ accessToken: signAccessToken(user), user: serializeUser(user) });
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: "This account has been deactivated" });
    return;
  }
  const refreshToken = await issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.json({ accessToken: signAccessToken(user), user: serializeUser(user) });
});

// --- Mobile OTP signup/login -------------------------------------------
// The OTP provider API is not wired up yet; the code is stubbed to "0000".
// When the SMS API is available, send a real code in /auth/otp/request and
// verify it in /auth/otp/verify.
const DEV_OTP = "0000";
// SECURITY: until a real SMS provider is wired up, the stub OTP ("0000")
// must never be usable in production — it would allow account takeover by
// anyone who knows a user's mobile number. Hard-disable the flow in prod.
const OTP_ENABLED = process.env.NODE_ENV !== "production";
function otpDisabled(res: import("express").Response): boolean {
  if (!OTP_ENABLED) {
    res.status(503).json({
      error: "Mobile OTP login is not available yet. Please use email login.",
    });
    return true;
  }
  return false;
}
const SIGNUP_TOKEN_SECRET = `${process.env["SESSION_SECRET"]}.otp-signup`;
const MOBILE_RE = /^\+?[0-9]{7,15}$/;

function normalizeMobile(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, "");
  return MOBILE_RE.test(cleaned) ? cleaned : null;
}

router.post("/auth/otp/request", async (req, res) => {
  if (otpDisabled(res)) return;
  const parsed = RequestOtpBody.safeParse(req.body);
  const mobile = parsed.success ? normalizeMobile(parsed.data.mobile) : null;
  if (!mobile) {
    res.status(400).json({ error: "Enter a valid mobile number" });
    return;
  }
  // TODO: call the SMS provider here once the API is provided.
  res.json({ ok: true });
});

router.post("/auth/otp/verify", async (req, res) => {
  if (otpDisabled(res)) return;
  const parsed = VerifyOtpBody.safeParse(req.body);
  const mobile = parsed.success ? normalizeMobile(parsed.data.mobile) : null;
  if (!parsed.success || !mobile) {
    res.status(400).json({ error: "Mobile number and code are required" });
    return;
  }
  if (parsed.data.otp !== DEV_OTP) {
    res.status(401).json({ error: "Incorrect code. Please try again." });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.mobile, mobile));
  if (user) {
    if (!user.isActive) {
      res.status(401).json({ error: "This account has been deactivated" });
      return;
    }
    const refreshToken = await issueRefreshToken(user.id);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.json({
      status: "existing",
      accessToken: signAccessToken(user),
      user: serializeUser(user),
      signupToken: null,
    });
    return;
  }
  const signupToken = jwt.sign({ mobile, purpose: "otp-signup" }, SIGNUP_TOKEN_SECRET, {
    expiresIn: "20m",
  });
  res.json({ status: "new", accessToken: null, user: null, signupToken });
});

router.post("/auth/otp/signup", async (req, res) => {
  if (otpDisabled(res)) return;
  const parsed = CompleteOtpSignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  let mobile: string;
  try {
    const decoded = jwt.verify(parsed.data.signupToken, SIGNUP_TOKEN_SECRET) as jwt.JwtPayload;
    if (decoded["purpose"] !== "otp-signup" || typeof decoded["mobile"] !== "string") {
      throw new Error("bad token");
    }
    mobile = decoded["mobile"];
  } catch {
    res.status(401).json({ error: "Your verification expired. Please verify your number again." });
    return;
  }
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.mobile, mobile));
  if (existing) {
    res.status(400).json({ error: "An account with this mobile number already exists" });
    return;
  }
  const avatarUrl =
    typeof parsed.data.avatarUrl === "string" && parsed.data.avatarUrl.startsWith("/api/uploads/")
      ? parsed.data.avatarUrl
      : null;
  // OTP accounts have no password; store an unguessable random hash so
  // password login can never succeed for them.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      name: parsed.data.name.trim(),
      email: `${mobile.replace(/^\+/, "")}@mobile.local`,
      passwordHash,
      role: "user",
      mobile,
      avatarUrl,
    })
    .returning();
  if (!user) {
    res.status(500).json({ error: "Failed to create account" });
    return;
  }
  broadcast("users:changed", { userId: user.id });
  const refreshToken = await issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.status(201).json({ accessToken: signAccessToken(user), user: serializeUser(user) });
});

router.patch("/auth/profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile update" });
    return;
  }
  const updates: Partial<{ name: string; avatarUrl: string | null }> = {};
  if (typeof parsed.data.name === "string" && parsed.data.name.trim()) {
    updates.name = parsed.data.name.trim();
  }
  if ("avatarUrl" in parsed.data) {
    updates.avatarUrl =
      typeof parsed.data.avatarUrl === "string" && parsed.data.avatarUrl.startsWith("/api/uploads/")
        ? parsed.data.avatarUrl
        : null;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.auth!.sub))
    .returning();
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  broadcast("users:changed", { userId: user.id });
  res.json(serializeUser(user));
});

router.post("/auth/refresh", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }
  const user = await consumeRefreshToken(token);
  if (!user) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  const refreshToken = await issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.json({ accessToken: signAccessToken(user), user: serializeUser(user) });
});

router.post("/auth/change-password", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.auth!.sub));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    res.status(400).json({ error: "New password must be different from the current one" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.auth!.sub));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(serializeUser(user));
});

export default router;
