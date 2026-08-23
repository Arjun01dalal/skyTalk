import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  messagesTable,
  usersTable,
  callsTable,
} from "@workspace/db";
import { desc, eq, or, inArray, max } from "drizzle-orm";
import {
  type AuthenticatedRequest,
  requireAuth,
  requireAdmin,
  serializeUser,
} from "../lib/auth";
import { serializeMessage, senderNameMap, getUserName } from "./conversations";
import { AdminReplyConversationBody } from "@workspace/api-zod";
import { translateText } from "../lib/translate";
import { emitToUser, emitToAdmins, isUserOnline } from "../lib/socket";
import { slaOnStaffReply } from "../lib/sla";

const router: IRouter = Router();

// All conversations in the system, with both participants + last message.
router.get(
  "/admin/conversations",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    // Support monitor covers caller-assigned support chats only — direct
    // chats and groups are private user conversations.
    const convs = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.type, "caller"))
      .orderBy(desc(conversationsTable.updatedAt));

    // Preload all referenced users in one pass.
    const userIds = new Set<number>();
    for (const c of convs) {
      userIds.add(c.userAId);
      if (c.userBId != null) userIds.add(c.userBId);
    }
    const userMap = new Map<number, ReturnType<typeof serializeUser>>();
    if (userIds.size) {
      const users = await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, Array.from(userIds)));
      for (const u of users) userMap.set(u.id, serializeUser(u));
    }

    // Bulk-load the latest message of every conversation in one query.
    const lastByConv = new Map<number, typeof messagesTable.$inferSelect>();
    if (convs.length) {
      // Step 1: one grouped query for the latest message id per conversation.
      const latestIds = await db
        .select({
          conversationId: messagesTable.conversationId,
          maxId: max(messagesTable.id),
        })
        .from(messagesTable)
        .where(inArray(messagesTable.conversationId, convs.map((c) => c.id)))
        .groupBy(messagesTable.conversationId);
      const ids = latestIds.map((r) => r.maxId).filter((v): v is number => v != null);
      // Step 2: fetch just those messages.
      if (ids.length) {
        const msgs = await db.select().from(messagesTable).where(inArray(messagesTable.id, ids));
        for (const m of msgs) lastByConv.set(m.conversationId, m);
      }
    }

    const result = [];
    for (const conv of convs) {
      const userA = userMap.get(conv.userAId);
      const userB = conv.userBId != null ? userMap.get(conv.userBId) : undefined;
      if (!userA || !userB) continue;
      const lastMessage = lastByConv.get(conv.id);
      result.push({
        id: conv.id,
        userA,
        userB,
        lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
        updatedAt: conv.updatedAt.toISOString(),
        language: conv.language,
        adminEscalated: conv.adminEscalated,
        escalationReason: conv.escalationReason,
        selectedCategoryId: conv.selectedCategoryId,
        slaStatus: conv.status,
        openedAt: conv.openedAt ? conv.openedAt.toISOString() : null,
        firstResponseAt: conv.firstResponseAt ? conv.firstResponseAt.toISOString() : null,
        awaitingReplySince: conv.awaitingReplySince ? conv.awaitingReplySince.toISOString() : null,
        resolvedAt: conv.resolvedAt ? conv.resolvedAt.toISOString() : null,
      });
    }
    res.json(result);
  },
);

// Full message history of any conversation (read-only oversight).
router.get(
  "/admin/conversations/:id/messages",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id));
    if (!conv || conv.type !== "caller") {
      // The monitor only covers caller (support) chats — direct and group
      // chats are private and must not be readable through oversight routes.
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(messagesTable.id);
    const names = await senderNameMap(messages);
    res.json(messages.map((m) => serializeMessage(m, m.senderId != null ? names.get(m.senderId) : null)));
  },
);

// Admin replies directly into any conversation (used for admin-escalated chats).
router.post(
  "/admin/conversations/:id/reply",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = AdminReplyConversationBody.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const content = parsed.data.content?.trim();
    const attachmentUrl = parsed.data.attachmentUrl;
    if (!content && !attachmentUrl) {
      res.status(400).json({ error: "Message must have content or an attachment" });
      return;
    }
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id));
    if (!conv || conv.type !== "caller") {
      // Monitor replies are only allowed into caller (support) chats.
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    // Admin writes English; the customer receives it in their language.
    let storedContent = content ?? null;
    let storedContentEn: string | null = null;
    if (content && conv.language !== "en") {
      storedContentEn = content;
      storedContent = await translateText(content, conv.language);
    }
    const meId = req.auth!.sub;
    const delivered =
      isUserOnline(conv.userAId) ||
      (conv.userBId != null && isUserOnline(conv.userBId));
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: id,
        senderId: meId,
        content: storedContent,
        contentEn: storedContentEn,
        attachmentUrl: attachmentUrl ?? null,
        attachmentType: parsed.data.attachmentType ?? null,
        attachmentName: parsed.data.attachmentName ?? null,
        status: delivered ? "delivered" : "sent",
      })
      .returning();
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));
    const payload = serializeMessage(message!, await getUserName(meId));
    emitToUser(conv.userAId, "message:new", payload);
    if (conv.userBId != null) emitToUser(conv.userBId, "message:new", payload);
    emitToAdmins("monitor:activity", {
      kind: "message",
      conversationId: id,
      message: payload,
      at: new Date().toISOString(),
    });
    res.status(201).json(payload);
    void slaOnStaffReply(id);
  },
);

// All calls in the system (newest first).
router.get(
  "/admin/calls",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    const calls = await db
      .select()
      .from(callsTable)
      .orderBy(desc(callsTable.id))
      .limit(200);

    const userIds = new Set<number>();
    for (const c of calls) {
      userIds.add(c.callerId);
      userIds.add(c.calleeId);
    }
    const userMap = new Map<number, ReturnType<typeof serializeUser>>();
    for (const id of Array.from(userIds)) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id));
      if (u) userMap.set(id, serializeUser(u));
    }

    res.json(
      calls
        .filter((c) => userMap.has(c.callerId) && userMap.has(c.calleeId))
        .map((c) => ({
          id: c.id,
          caller: userMap.get(c.callerId),
          callee: userMap.get(c.calleeId),
          status: c.status,
          startedAt: c.startedAt.toISOString(),
          endedAt: c.endedAt ? c.endedAt.toISOString() : null,
          durationSeconds: c.durationSeconds,
        })),
    );
  },
);

export default router;
