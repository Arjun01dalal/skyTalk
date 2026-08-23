import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  conversationMembersTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  CreateGroupBody,
  UpdateGroupBody,
  AddGroupMemberBody,
} from "@workspace/api-zod";
import { type AuthenticatedRequest, requireAuth } from "../lib/auth";
import { emitToUser } from "../lib/socket";
import {
  serializeConversation,
  getGroupMemberIds,
} from "./conversations";

const router: IRouter = Router();

async function getGroup(id: number) {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, id), eq(conversationsTable.type, "group")));
  return conv ?? null;
}

function canManage(
  conv: { createdById: number | null },
  auth: { sub: number; role: string },
) {
  return auth.role === "admin" || conv.createdById === auth.sub;
}

async function notifyMembers(conversationId: number) {
  for (const uid of await getGroupMemberIds(conversationId)) {
    emitToUser(uid, "conversation:updated", { conversationId });
  }
}

// Create a group. The creator is always a member; additional members must be
// staff (admins/agents) — business rule: groups are internal team groups.
router.post("/groups", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = CreateGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Group name and members are required" });
    return;
  }
  const meId = req.auth!.sub;
  const { title, memberIds, iconUrl } = parsed.data;
  const uniqueIds = [...new Set(memberIds.filter((id) => id !== meId))];
  if (uniqueIds.length === 0) {
    res.status(400).json({ error: "Add at least one member" });
    return;
  }
  const rows = uniqueIds.length
    ? await db
        .select({ id: usersTable.id, role: usersTable.role, isActive: usersTable.isActive })
        .from(usersTable)
        .where(inArray(usersTable.id, uniqueIds))
    : [];
  if (rows.length !== uniqueIds.length || rows.some((u) => !u.isActive)) {
    res.status(400).json({ error: "One or more selected users were not found" });
    return;
  }
  const nonStaff = rows.filter((u) => u.role === "user");
  if (nonStaff.length > 0) {
    res.status(400).json({ error: "Only staff members can be added to groups" });
    return;
  }
  const [conv] = await db
    .insert(conversationsTable)
    .values({
      userAId: meId,
      userBId: null,
      type: "group",
      mode: "human",
      title: title.trim(),
      iconUrl: iconUrl || null,
      createdById: meId,
    })
    .returning();
  await db.insert(conversationMembersTable).values(
    [meId, ...uniqueIds].map((userId) => ({
      conversationId: conv!.id,
      userId,
      addedById: meId,
    })),
  );
  await notifyMembers(conv!.id);
  res.status(201).json(await serializeConversation(conv!, meId));
});

// Update group title / icon (creator or admin).
router.patch("/groups/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params["id"]);
  const parsed = UpdateGroupBody.safeParse(req.body ?? {});
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const conv = await getGroup(id);
  if (!conv) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  if (!canManage(conv, req.auth!)) {
    res.status(403).json({ error: "Only the group creator or an admin can edit this group" });
    return;
  }
  const { title, iconUrl } = parsed.data;
  const [updated] = await db
    .update(conversationsTable)
    .set({
      ...(title !== undefined ? { title: title.trim() } : {}),
      ...(iconUrl !== undefined ? { iconUrl: iconUrl || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, id))
    .returning();
  await notifyMembers(id);
  res.json(await serializeConversation(updated!, req.auth!.sub));
});

// Add a member (creator or admin). Members must be staff.
router.post(
  "/groups/:id/members",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = AddGroupMemberBody.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const conv = await getGroup(id);
    if (!conv) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!canManage(conv, req.auth!)) {
      res.status(403).json({ error: "Only the group creator or an admin can add members" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.userId));
    if (!user || !user.isActive) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.role === "user") {
      res.status(400).json({ error: "Only staff members can be added to groups" });
      return;
    }
    await db
      .insert(conversationMembersTable)
      .values({ conversationId: id, userId: user.id, addedById: req.auth!.sub })
      .onConflictDoNothing();
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));
    await notifyMembers(id);
    res.json(await serializeConversation(conv, req.auth!.sub));
  },
);

// Remove a member: creator/admin can remove anyone; a member can leave.
// The creator cannot be removed (delete the group instead — not offered yet).
router.delete(
  "/groups/:id/members/:userId",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const targetId = Number(req.params["userId"]);
    if (!Number.isInteger(id) || !Number.isInteger(targetId)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const conv = await getGroup(id);
    if (!conv) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const selfLeave = targetId === req.auth!.sub;
    if (!selfLeave && !canManage(conv, req.auth!)) {
      res.status(403).json({ error: "Only the group creator or an admin can remove members" });
      return;
    }
    if (targetId === conv.createdById) {
      res.status(400).json({ error: "The group creator cannot be removed" });
      return;
    }
    // Notify the removed member too (before their membership row is gone).
    const memberIdsBefore = await getGroupMemberIds(id);
    // The target must actually be a member — otherwise a non-member could
    // "leave" any group and trigger updates/notifications (or probe groups).
    if (!memberIdsBefore.includes(targetId)) {
      res.status(404).json({ error: "That user is not a member of this group" });
      return;
    }
    await db
      .delete(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, id),
          eq(conversationMembersTable.userId, targetId),
        ),
      );
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));
    for (const uid of memberIdsBefore) {
      emitToUser(uid, "conversation:updated", { conversationId: id });
    }
    res.json(await serializeConversation(conv, req.auth!.sub));
  },
);

export default router;
