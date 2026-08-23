import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { and, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { CreateUserBody, UpdateUserBody } from "@workspace/api-zod";
import {
  type AuthenticatedRequest,
  requireAdmin,
  requireAuth,
  serializeUser,
} from "../lib/auth";
import { broadcast } from "../lib/socket";

const router: IRouter = Router();

// Role visibility: admin sees everyone; agent sees admins + users; user sees admins + agents.
const VISIBLE_ROLES: Record<string, ("admin" | "agent" | "user")[]> = {
  admin: ["admin", "agent", "user"],
  agent: ["admin", "user"],
  user: ["admin", "agent"],
};

router.get("/users", requireAuth, async (req: AuthenticatedRequest, res) => {
  const roles = VISIBLE_ROLES[req.auth!.role] ?? [];
  const users = await db
    .select()
    .from(usersTable)
    .where(
      and(
        inArray(usersTable.role, roles),
        ne(usersTable.id, req.auth!.sub),
        eq(usersTable.isActive, true),
      ),
    )
    .orderBy(usersTable.name);
  res.json(users.map(serializeUser));
});

// Search registered users by name, email, mobile number or employee code —
// used before starting a direct chat or adding members to a group.
// staffOnly=true restricts results to admins/agents (group membership rule).
router.get("/users/search", requireAuth, async (req: AuthenticatedRequest, res) => {
  const q = String(req.query["q"] ?? "").trim();
  const staffOnly = String(req.query["staffOnly"] ?? "") === "true";
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const pattern = `%${q}%`;
  const users = await db
    .select()
    .from(usersTable)
    .where(
      and(
        or(
          ilike(usersTable.name, pattern),
          ilike(usersTable.email, pattern),
          ilike(usersTable.mobile, pattern),
          ilike(usersTable.empCode, pattern),
        ),
        ne(usersTable.id, req.auth!.sub),
        eq(usersTable.isActive, true),
        ...(staffOnly ? [inArray(usersTable.role, ["admin", "agent"])] : []),
      ),
    )
    .orderBy(usersTable.name)
    .limit(20);
  res.json(users.map(serializeUser));
});

router.post(
  "/users",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user data" });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (existing) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }
    // Staff accounts default to a shared starter password and must change it
    // at first login. Plain end-users are exempt from the forced change.
    const DEFAULT_PASSWORD = "12345678";
    const rawPassword = parsed.data.password || DEFAULT_PASSWORD;
    const isStaff = parsed.data.role !== "user";
    const mustChangePassword = isStaff && rawPassword === DEFAULT_PASSWORD;
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const [user] = await db
      .insert(usersTable)
      .values({
        name: parsed.data.name.trim(),
        email,
        passwordHash,
        role: parsed.data.role,
        empCode: parsed.data.empCode?.trim() || null,
        mustChangePassword,
      })
      .returning();
    broadcast("users:changed", { userId: user!.id });
    res.status(201).json(serializeUser(user!));
  },
);

router.patch(
  "/users/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = UpdateUserBody.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates["name"] = parsed.data.name.trim();
    if (parsed.data.role !== undefined) updates["role"] = parsed.data.role;
    if (parsed.data.empCode !== undefined) updates["empCode"] = parsed.data.empCode.trim() || null;
    if (parsed.data.isActive !== undefined) updates["isActive"] = parsed.data.isActive;
    if (parsed.data.password !== undefined) {
      updates["passwordHash"] = await bcrypt.hash(parsed.data.password, 10);
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No changes provided" });
      return;
    }
    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    broadcast("users:changed", { userId: user.id });
    res.json(serializeUser(user));
  },
);

router.delete(
  "/users/:id",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (id === req.auth!.sub) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    broadcast("users:changed", { userId: id });
    res.json({ ok: true });
  },
);

export default router;
