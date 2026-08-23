import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  conversationMembersTable,
  messagesTable,
  messageEnvelopesTable,
  usersTable,
  ticketsTable,
  type Message,
  type Conversation,
} from "@workspace/db";
import { and, desc, eq, or, ne, count, inArray, gt, sql } from "drizzle-orm";
import {
  CreateConversationBody,
  SendMessageBody,
  SelectConversationCategoryBody,
  EscalateConversationBody,
  EscalateConversationToAdminBody,
} from "@workspace/api-zod";
import { translateText, translateDual, SUPPORTED_LANGUAGES } from "../lib/translate";
import { supportCategoriesTable } from "@workspace/db";
import {
  generateAiReply,
  getAiSettings,
  escalateToHuman,
  emitAiTyping,
  sendGreetingTemplate,
} from "../lib/ai";
import {
  type AuthenticatedRequest,
  requireAuth,
  serializeUser,
} from "../lib/auth";
import { emitToUser, emitToAdmins, isUserOnline } from "../lib/socket";
import { notifyAdminsOnTelegram } from "../lib/telegram";
import { slaOnCustomerMessage, slaOnStaffReply } from "../lib/sla";

const router: IRouter = Router();

/** Highest message id already archived into a ticket for this conversation. */
export async function getArchivedUpTo(conversationId: number): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${ticketsTable.toMessageId}), 0)`,
    })
    .from(ticketsTable)
    .where(eq(ticketsTable.conversationId, conversationId));
  return row?.max ?? 0;
}

export function serializeMessage(
  m: Message,
  senderName?: string | null,
  envelope?: { type: number; body: string } | null,
) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: senderName ?? null,
    isAi: m.isAi,
    content: m.content,
    contentEn: m.contentEn,
    encrypted: m.encrypted,
    envelope: envelope ?? null,
    attachmentUrl: m.attachmentUrl,
    attachmentType: m.attachmentType,
    attachmentName: m.attachmentName,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Bulk-resolve user names for the senders of a set of messages. */
export async function senderNameMap(messages: Message[]) {
  const ids = [...new Set(messages.map((m) => m.senderId).filter((v): v is number => v != null))];
  if (!ids.length) return new Map<number, string>();
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function getUserName(id: number): Promise<string | null> {
  const [row] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  return row?.name ?? null;
}

export async function getGroupMemberIds(conversationId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

/** Everyone who should receive socket events for this conversation. */
export async function getRecipientIds(conv: {
  id: number;
  type: string;
  userAId: number;
  userBId: number | null;
}): Promise<number[]> {
  if (conv.type === "group") return getGroupMemberIds(conv.id);
  return conv.userBId != null ? [conv.userAId, conv.userBId] : [conv.userAId];
}

export async function getConversationForUser(conversationId: number, userId: number) {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));
  if (!conv) return null;
  if (conv.type === "group") {
    const [m] = await db
      .select({ id: conversationMembersTable.id })
      .from(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, conversationId),
          eq(conversationMembersTable.userId, userId),
        ),
      );
    return m ? conv : null;
  }
  return conv.userAId === userId || conv.userBId === userId ? conv : null;
}

type UserRow = typeof usersTable.$inferSelect;

/** Optional preloaded data so list endpoints can batch user lookups. */
export type ConversationPreload = {
  usersById: Map<number, UserRow>;
  memberIdsByConv: Map<number, number[]>;
};

/**
 * Batch-load the users (and group member ids) needed to serialize a set of
 * conversations, replacing the per-conversation lookups with two queries.
 */
export async function preloadConversationUsers(
  convs: Conversation[],
  meId: number,
): Promise<ConversationPreload> {
  const groupIds = convs.filter((c) => c.type === "group").map((c) => c.id);
  const memberIdsByConv = new Map<number, number[]>();
  const userIds = new Set<number>();
  if (groupIds.length) {
    const rows = await db
      .select({
        conversationId: conversationMembersTable.conversationId,
        userId: conversationMembersTable.userId,
      })
      .from(conversationMembersTable)
      .where(inArray(conversationMembersTable.conversationId, groupIds));
    for (const r of rows) {
      const list = memberIdsByConv.get(r.conversationId) ?? [];
      list.push(r.userId);
      memberIdsByConv.set(r.conversationId, list);
      userIds.add(r.userId);
    }
  }
  for (const c of convs) {
    if (c.type === "group") continue;
    const otherId = c.userAId === meId ? c.userBId : c.userAId;
    if (otherId != null) userIds.add(otherId);
  }
  const users = userIds.size
    ? await db.select().from(usersTable).where(inArray(usersTable.id, [...userIds]))
    : [];
  return { usersById: new Map(users.map((u) => [u.id, u])), memberIdsByConv };
}

export async function serializeConversation(
  conv: Conversation,
  meId: number,
  preload?: ConversationPreload,
) {
  let otherUser: UserRow | null = null;
  let members: ReturnType<typeof serializeUser>[] | null = null;
  if (conv.type === "group") {
    const memberIds = preload
      ? (preload.memberIdsByConv.get(conv.id) ?? [])
      : await getGroupMemberIds(conv.id);
    const rows = preload
      ? memberIds
          .map((uid) => preload.usersById.get(uid))
          .filter((u): u is UserRow => !!u)
      : memberIds.length
        ? await db.select().from(usersTable).where(inArray(usersTable.id, memberIds))
        : [];
    members = rows.map(serializeUser);
  } else {
    const otherId = conv.userAId === meId ? conv.userBId : conv.userAId;
    if (otherId != null) {
      if (preload) {
        otherUser = preload.usersById.get(otherId) ?? null;
      } else {
        const [row] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, otherId));
        otherUser = row ?? null;
      }
    }
  }
  // Messages already archived into a ticket (ended chats) stay in History
  // only — they no longer appear in the live thread or the sidebar preview.
  const archivedUpTo = await getArchivedUpTo(conv.id);
  const [lastTicket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.conversationId, conv.id))
    .orderBy(desc(ticketsTable.id))
    .limit(1);
  const [lastMessage] = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conv.id),
        gt(messagesTable.id, archivedUpTo),
      ),
    )
    .orderBy(desc(messagesTable.id))
    .limit(1);
  const [unread] = await db
    .select({ n: count() })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conv.id),
        ne(messagesTable.senderId, meId),
        ne(messagesTable.status, "read"),
      ),
    );
  return {
    id: conv.id,
    type: conv.type,
    title: conv.title,
    iconUrl: conv.iconUrl,
    createdById: conv.createdById,
    members,
    otherUser: otherUser ? serializeUser(otherUser) : null,
    lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
    unreadCount: unread?.n ?? 0,
    updatedAt: conv.updatedAt.toISOString(),
    mode: conv.mode,
    selectedCategoryId: conv.selectedCategoryId,
    escalationReason: conv.escalationReason,
    aiResponseCount: conv.aiResponseCount,
    language: conv.language,
    adminEscalated: conv.adminEscalated,
    slaStatus: conv.status,
    // When the previous chat on this conversation was archived (ended).
    // Calls/messages before this instant belong to the archived ticket.
    archivedAt: lastTicket ? lastTicket.closedAt.toISOString() : null,
    openedAt: conv.openedAt ? conv.openedAt.toISOString() : null,
    firstResponseAt: conv.firstResponseAt ? conv.firstResponseAt.toISOString() : null,
    awaitingReplySince: conv.awaitingReplySince ? conv.awaitingReplySince.toISOString() : null,
    resolvedAt: conv.resolvedAt ? conv.resolvedAt.toISOString() : null,
  };
}

router.get(
  "/conversations",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const meId = req.auth!.sub;
    // Groups the user belongs to (membership table) + their 1:1 chats.
    const memberships = await db
      .select({ conversationId: conversationMembersTable.conversationId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.userId, meId));
    const groupIds = memberships.map((m) => m.conversationId);
    const convs = await db
      .select()
      .from(conversationsTable)
      .where(
        or(
          eq(conversationsTable.userAId, meId),
          eq(conversationsTable.userBId, meId),
          ...(groupIds.length ? [inArray(conversationsTable.id, groupIds)] : []),
        ),
      )
      .orderBy(desc(conversationsTable.updatedAt));
    // Batch user lookups for the whole list (2 queries) instead of one or
    // more user queries per conversation.
    const preload = await preloadConversationUsers(convs, meId);
    const result = [];
    for (const conv of convs) {
      const s = await serializeConversation(conv, meId, preload);
      if (s.otherUser || s.type === "group") result.push(s);
    }
    res.json(result);
  },
);

router.post(
  "/conversations",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const parsed = CreateConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const meId = req.auth!.sub;
    const otherId = parsed.data.userId;
    if (otherId === meId) {
      res.status(400).json({ error: "Cannot start a conversation with yourself" });
      return;
    }
    const [other] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, otherId));
    if (!other || !other.isActive) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const [a, b] = meId < otherId ? [meId, otherId] : [otherId, meId];
    let [conv] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.userAId, a),
          eq(conversationsTable.userBId, b),
        ),
      );
    if (!conv) {
      // Chats started from the app (user search / directory) are plain direct
      // chats: no caller assignment, no AI-first flow, no SLA clocks. Only
      // the SSO direct-link flow creates 'caller' support conversations.
      [conv] = await db
        .insert(conversationsTable)
        .values({ userAId: a, userBId: b, mode: "human", type: "direct" })
        .returning();
    }
    res.json(await serializeConversation(conv!, meId));
  },
);

router.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const conv = Number.isInteger(id)
      ? await getConversationForUser(id, req.auth!.sub)
      : null;
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    // Archived messages (ended chats) live under their ticket in History.
    const archivedUpTo = await getArchivedUpTo(id);
    // Pagination: return the latest `limit` messages by default; `before`
    // (a message id) cursors backwards through older history.
    const rawLimit = Number(req.query["limit"]);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
    const rawBefore = Number(req.query["before"]);
    const before = Number.isInteger(rawBefore) && rawBefore > 0 ? rawBefore : null;
    const messages = (
      await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, id),
            gt(messagesTable.id, archivedUpTo),
            ...(before != null ? [sql`${messagesTable.id} < ${before}`] : []),
          ),
        )
        .orderBy(desc(messagesTable.id))
        .limit(limit)
    ).reverse();
    const names = await senderNameMap(messages);
    // For encrypted messages, attach only the requesting user's envelope.
    const encryptedIds = messages.filter((m) => m.encrypted).map((m) => m.id);
    const envelopeByMessageId = new Map<number, { type: number; body: string }>();
    if (encryptedIds.length) {
      const envs = await db
        .select()
        .from(messageEnvelopesTable)
        .where(
          and(
            inArray(messageEnvelopesTable.messageId, encryptedIds),
            eq(messageEnvelopesTable.recipientId, req.auth!.sub),
          ),
        );
      for (const e of envs) {
        envelopeByMessageId.set(e.messageId, { type: e.ciphertextType, body: e.ciphertext });
      }
    }
    res.json(
      messages.map((m) =>
        serializeMessage(
          m,
          m.senderId != null ? names.get(m.senderId) : null,
          envelopeByMessageId.get(m.id) ?? null,
        ),
      ),
    );
  },
);

router.post(
  "/conversations/:id/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = SendMessageBody.safeParse(req.body);
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { content, attachmentUrl, attachmentType, attachmentName, encrypted, envelopes } =
      parsed.data;
    if (!encrypted && !content?.trim() && !attachmentUrl) {
      res.status(400).json({ error: "Message must have content or an attachment" });
      return;
    }
    const meId = req.auth!.sub;
    const conv = await getConversationForUser(id, meId);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const recipientIds = (await getRecipientIds(conv)).filter((uid) => uid !== meId);

    // ---- Encrypted path (staff direct & group chats only) ----------------
    // The client sends one ciphertext per recipient (pairwise Signal
    // sessions). The server stores ciphertext only: no content, no
    // translation, no AI, no admin monitor feed.
    if (encrypted) {
      if (conv.type !== "direct" && conv.type !== "group") {
        res.status(400).json({ error: "Encryption is only available in direct and group chats" });
        return;
      }
      // E2EE is staff-only policy, enforced server-side (not just in the UI).
      if (req.auth!.role === "user") {
        res.status(403).json({ error: "Encrypted messages are only available to staff" });
        return;
      }
      const envs = envelopes ?? [];
      // Strict envelope shape: valid Signal ciphertext type (3 =
      // PreKeyWhisperMessage, 1 = WhisperMessage), non-empty bounded base64
      // body. Malformed envelopes would otherwise be stored and become
      // permanent decrypt failures for recipients.
      const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
      const badEnvelope = envs.some(
        (e) =>
          (e.type !== 1 && e.type !== 3) ||
          typeof e.body !== "string" ||
          e.body.length === 0 ||
          e.body.length > 512 * 1024 ||
          e.body.length % 4 !== 0 ||
          !B64_RE.test(e.body),
      );
      if (badEnvelope) {
        res.status(400).json({ error: "Invalid message envelope" });
        return;
      }
      const envUserIds = new Set(envs.map((e) => e.userId));
      // Every current recipient must have an envelope; no extras allowed
      // (prevents leaking ciphertext to non-members or skipping members).
      const recipientSet = new Set(recipientIds);
      const missing = recipientIds.filter((uid) => !envUserIds.has(uid));
      const extras = envs.filter((e) => !recipientSet.has(e.userId) && e.userId !== meId);
      if (missing.length || extras.length || envs.length !== envUserIds.size) {
        res.status(409).json({
          error: "Envelope recipients do not match the current members. Please retry.",
        });
        return;
      }
      const initialStatusEnc = recipientIds.some((uid) => isUserOnline(uid))
        ? "delivered"
        : "sent";
      const [message] = await db
        .insert(messagesTable)
        .values({
          conversationId: id,
          senderId: meId,
          encrypted: true,
          content: null,
          contentEn: null,
          status: initialStatusEnc,
        })
        .returning();
      if (envs.length) {
        await db.insert(messageEnvelopesTable).values(
          envs.map((e) => ({
            messageId: message!.id,
            recipientId: e.userId,
            ciphertextType: e.type,
            ciphertext: e.body,
          })),
        );
      }
      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, id));
      const senderName = await getUserName(meId);
      // Each recipient gets ONLY their own envelope.
      const envByUser = new Map(envs.map((e) => [e.userId, { type: e.type, body: e.body }]));
      for (const uid of recipientIds) {
        emitToUser(uid, "message:new", serializeMessage(message!, senderName, envByUser.get(uid) ?? null));
      }
      if (initialStatusEnc === "delivered") {
        emitToUser(meId, "message:status", {
          conversationId: id,
          messageIds: [message!.id],
          status: "delivered",
        });
      }
      res.status(201).json(serializeMessage(message!, senderName, envByUser.get(meId) ?? null));
      return;
    }
    const initialStatus = recipientIds.some((uid) => isUserOnline(uid))
      ? "delivered"
      : "sent";

    // Cross-language conversations store both renditions: `content` in the
    // customer's language, `contentEn` in English for staff. Only caller
    // (support) chats use the translation pipeline.
    const trimmed = content?.trim() || null;
    let storedContent = trimmed;
    let storedContentEn: string | null = null;
    if (conv.type === "caller" && trimmed && conv.language !== "en") {
      if (req.auth!.role === "user") {
        // Customer may type in any language (even romanized) — normalize to
        // their chosen language for display AND produce the English rendition.
        const dual = await translateDual(trimmed, conv.language);
        storedContent = dual.local;
        storedContentEn = dual.en;
      } else {
        // Staff write English — deliver it in the customer's language.
        storedContentEn = trimmed;
        storedContent = await translateText(trimmed, conv.language);
      }
    }

    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: id,
        senderId: meId,
        content: storedContent,
        contentEn: storedContentEn,
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
        attachmentName: attachmentName || null,
        status: initialStatus,
      })
      .returning();
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));
    const payload = serializeMessage(message!, await getUserName(meId));
    for (const uid of recipientIds) emitToUser(uid, "message:new", payload);
    // System-wide monitoring feed for admins (support chats only).
    if (conv.type === "caller") {
      emitToAdmins("monitor:activity", {
        kind: "message",
        conversationId: id,
        message: payload,
        at: new Date().toISOString(),
      });
    }
    if (initialStatus === "delivered") {
      emitToUser(meId, "message:status", {
        conversationId: id,
        messageIds: [message!.id],
        status: "delivered",
      });
    }
    res.status(201).json(payload);

    // SLA clocks and the AI-first flow only apply to caller (support) chats.
    if (conv.type === "caller") {
      if (req.auth!.role === "user") void slaOnCustomerMessage(id);
      else void slaOnStaffReply(id);

      if (conv.mode === "ai" && req.auth!.role === "user") {
        const typingTargets = [conv.userAId, ...(conv.userBId != null ? [conv.userBId] : [])];
        emitAiTyping(typingTargets, id, true);
        void generateAiReply(id, meId).finally(() =>
          emitAiTyping(typingTargets, id, false),
        );
      }
    }
  },
);

router.post(
  "/conversations/:id/select-category",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = SelectConversationCategoryBody.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { categoryId, customText, language } = parsed.data;
    const lang = language && SUPPORTED_LANGUAGES[language] ? language : "en";
    if (!categoryId && !customText?.trim()) {
      res.status(400).json({ error: "categoryId or customText is required" });
      return;
    }
    const meId = req.auth!.sub;
    const conv = await getConversationForUser(id, meId);
    if (!conv || conv.type !== "caller" || conv.userBId == null) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    let firstMessage = customText?.trim() || "";
    if (categoryId) {
      const [cat] = await db
        .select()
        .from(supportCategoriesTable)
        .where(eq(supportCategoriesTable.id, categoryId));
      if (!cat || !cat.isActive) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      if (!firstMessage) firstMessage = `I need help with: ${cat.title}`;
    }
    const [updated] = await db
      .update(conversationsTable)
      .set({
        selectedCategoryId: categoryId ?? null,
        mode: "ai",
        language: lang,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, id))
      .returning();

    // Record the user's selection as a normal message so agents see it later.
    // Non-English chats also carry an English rendition for staff. The
    // customText was typed by the customer (their language); the auto
    // fallback ("I need help with: ...") is English and must be translated
    // the other way so the customer-visible copy is in their language.
    let firstMessageEn: string | null = null;
    if (lang !== "en") {
      if (customText?.trim()) {
        const dual = await translateDual(firstMessage, lang);
        firstMessage = dual.local;
        firstMessageEn = dual.en;
      } else {
        firstMessageEn = firstMessage;
        firstMessage = await translateText(firstMessageEn, lang);
      }
    }
    const otherId: number = conv.userAId === meId ? conv.userBId : conv.userAId;
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: id,
        senderId: meId,
        content: firstMessage,
        contentEn: firstMessageEn,
        status: isUserOnline(otherId) ? "delivered" : "sent",
      })
      .returning();
    const payload = serializeMessage(message!, await getUserName(meId));
    emitToUser(otherId, "message:new", payload);
    emitToUser(meId, "message:new", payload);
    emitToAdmins("monitor:activity", {
      kind: "message",
      conversationId: id,
      message: payload,
      at: new Date().toISOString(),
    });

    res.json(await serializeConversation(updated!, meId));

    if (req.auth!.role === "user") await slaOnCustomerMessage(id);

    const typingTargets = [conv.userAId, conv.userBId];
    emitAiTyping(typingTargets, id, true);
    void generateAiReply(id, meId).finally(() =>
      emitAiTyping(typingTargets, id, false),
    );
  },
);

router.post(
  "/conversations/:id/escalate",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = EscalateConversationBody.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const meId = req.auth!.sub;
    const conv = await getConversationForUser(id, meId);
    if (!conv || conv.type !== "caller") {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (conv.mode === "human") {
      res.json(await serializeConversation(conv, meId));
      return;
    }
    // Business rule: customers can't jump to a human until the AI has had a
    // real chance to help (5 replies). Staff can still escalate anytime.
    if (req.auth!.role === "user" && conv.aiResponseCount < 5) {
      res.status(403).json({
        error:
          "Our assistant will keep helping you first — a human agent becomes available after a few more messages.",
      });
      return;
    }
    const updated = await escalateToHuman(
      id,
      parsed.data.reason?.trim() || "User requested a human agent",
    );
    res.json(await serializeConversation(updated ?? conv, meId));
  },
);

// Agents/support flag a conversation for the admin to reply directly.
router.post(
  "/conversations/:id/escalate-to-admin",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const parsed = EscalateConversationToAdminBody.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    if (req.auth!.role === "user") {
      res.status(403).json({ error: "Only support members can escalate to admin" });
      return;
    }
    const meId = req.auth!.sub;
    const conv = await getConversationForUser(id, meId);
    if (!conv || conv.type !== "caller") {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const reason =
      parsed.data.reason?.trim() || "Support member escalated to admin";
    const [updated] = await db
      .update(conversationsTable)
      .set({
        adminEscalated: true,
        mode: "human",
        escalationReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, id))
      .returning();
    const event = {
      conversationId: id,
      reason,
      byUserId: meId,
      at: new Date().toISOString(),
    };
    emitToAdmins("conversation:admin-escalated", event);
    emitToAdmins("monitor:activity", { kind: "admin-escalation", ...event });
    // Telegram notification to admins (fire-and-forget; never blocks the response).
    void (async () => {
      const pair = await db
        .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
        .from(usersTable)
        .where(inArray(usersTable.id, [conv.userAId, ...(conv.userBId != null ? [conv.userBId] : [])]));
      const customer = pair.find((u) => u.role === "user");
      const staff = pair.find((u) => u.id === meId);
      await notifyAdminsOnTelegram(
        `🔴 Chat escalated to admin\n\nCustomer: ${customer?.name ?? "Unknown"}\nBy: ${staff?.name ?? "Support member"}\nReason: ${reason}\nConversation #${id}`,
      );
    })().catch(() => {});
    res.json(await serializeConversation(updated!, meId));
  },
);

// Staff mark a conversation as resolved (stops the SLA resolution clock).
router.post(
  "/conversations/:id/resolve",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    if (req.auth!.role === "user") {
      res.status(403).json({ error: "Only support members can resolve a conversation" });
      return;
    }
    // Agents may only resolve conversations they participate in; admins any.
    const conv =
      req.auth!.role === "admin"
        ? (await db.select().from(conversationsTable).where(eq(conversationsTable.id, id)))[0]
        : await getConversationForUser(id, req.auth!.sub);
    if (!conv || conv.type !== "caller") {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const [updated] = await db
      .update(conversationsTable)
      .set({
        status: "resolved",
        resolvedAt: conv.resolvedAt ?? new Date(),
        awaitingReplySince: null,
        updatedAt: new Date(),
      })
      .where(eq(conversationsTable.id, id))
      .returning();
    emitToAdmins("monitor:activity", {
      kind: "resolved",
      conversationId: id,
      at: new Date().toISOString(),
    });
    res.json(await serializeConversation(updated!, req.auth!.sub));
  },
);

// End the chat: any participant (customer or agent) or an admin. Sends the
// admin-configured "closing" template as a system message, then resolves the
// conversation (stops the SLA resolution clock).
router.post(
  "/conversations/:id/end",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    // Participants may end their own chat; admins any.
    const conv =
      req.auth!.role === "admin"
        ? (await db.select().from(conversationsTable).where(eq(conversationsTable.id, id)))[0]
        : await getConversationForUser(id, req.auth!.sub);
    // End-chat (SLA resolve + closing note) is a support-flow concept; direct
    // and group chats have no lifecycle to end.
    if (!conv || conv.type !== "caller") {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    // Atomically claim the open→resolved transition; only the request that
    // wins sends the one-time thank-you/closing note (race-safe under
    // parallel end requests).
    const [claimed] = await db
      .update(conversationsTable)
      .set({
        status: "resolved",
        resolvedAt: conv.resolvedAt ?? new Date(),
        awaitingReplySince: null,
        updatedAt: new Date(),
      })
      .where(and(eq(conversationsTable.id, id), ne(conversationsTable.status, "resolved")))
      .returning();
    if (claimed && claimed.type === "caller") {
      try {
        await sendGreetingTemplate(claimed, "closing");
      } catch {
        // Closing note is best-effort; the conversation is already resolved.
      }
      // Archive this chat under a ticket number: everything exchanged since
      // the previous ticket moves to History, and the live thread starts fresh.
      try {
        const from = (await getArchivedUpTo(id)) + 1;
        const range = await db
          .select({
            maxId: sql<number>`coalesce(max(${messagesTable.id}), 0)`,
            n: count(),
            firstAt: sql<Date | null>`min(${messagesTable.createdAt})`,
          })
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.conversationId, id),
              gt(messagesTable.id, from - 1),
            ),
          );
        const to = range[0]?.maxId ?? 0;
        const nMessages = Number(range[0]?.n ?? 0);
        if (to >= from && nMessages > 0) {
          const participantIds = [claimed.userAId, claimed.userBId].filter(
            (v): v is number => v != null,
          );
          const participants = participantIds.length
            ? await db.select().from(usersTable).where(inArray(usersTable.id, participantIds))
            : [];
          const customer = participants.find((u) => u.role === "user");
          const agent = participants.find((u) => u.role !== "user");
          if (customer) {
            const [ticket] = await db
              .insert(ticketsTable)
              .values({
                conversationId: id,
                customerId: customer.id,
                agentId: agent?.id ?? null,
                categoryId: claimed.selectedCategoryId,
                fromMessageId: from,
                toMessageId: to,
                messageCount: nMessages,
                openedAt: claimed.openedAt ?? (range[0]?.firstAt as Date | null),
                closedById: req.auth!.sub,
              })
              .returning();
            if (ticket) {
              await db
                .update(ticketsTable)
                .set({ ticketNo: `TKT-${String(ticket.id).padStart(6, "0")}` })
                .where(eq(ticketsTable.id, ticket.id));
            }
            // Reset the support flow so the next visit starts fresh
            // (topic picker + AI-first mode when enabled).
            const settings = await getAiSettings();
            await db
              .update(conversationsTable)
              .set({
                mode: settings.aiEnabled ? "ai" : "human",
                selectedCategoryId: null,
                escalationReason: null,
                aiResponseCount: 0,
                adminEscalated: false,
                openedAt: null,
                firstResponseAt: null,
                awaitingReplySince: null,
                updatedAt: new Date(),
              })
              .where(eq(conversationsTable.id, id));
          }
        }
      } catch (err) {
        // Ticketing is best-effort; never block ending the chat.
        console.error("Failed to archive ticket for conversation", id, err);
      }
      for (const uid of await getRecipientIds(claimed)) {
        emitToUser(uid, "conversation:updated", { conversationId: id });
      }
    }
    const updated =
      claimed ??
      (await db.select().from(conversationsTable).where(eq(conversationsTable.id, id)))[0];
    emitToAdmins("monitor:activity", {
      kind: "resolved",
      conversationId: id,
      at: new Date().toISOString(),
    });
    res.json(await serializeConversation(updated!, req.auth!.sub));
  },
);

// Change the conversation's customer language mid-chat. Participants only.
// New messages (AI replies, staff replies) are delivered in the new language;
// existing messages keep the language they were written in.
router.post(
  "/conversations/:id/language",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const meId = req.auth!.sub;
    const language = String((req.body as { language?: string })?.language ?? "");
    if (!SUPPORTED_LANGUAGES[language]) {
      res.status(400).json({ error: "Unsupported language" });
      return;
    }
    const conv = Number.isInteger(id)
      ? await getConversationForUser(id, meId)
      : null;
    // Translation is caller-chat-only; direct and group chats are plain text.
    if (!conv || conv.type !== "caller") {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    await db
      .update(conversationsTable)
      .set({ language, updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));
    for (const uid of await getRecipientIds(conv)) {
      emitToUser(uid, "conversation:updated", { conversationId: id });
    }
    res.json({ ok: true });
  },
);

router.post(
  "/conversations/:id/read",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    const meId = req.auth!.sub;
    const conv = Number.isInteger(id)
      ? await getConversationForUser(id, meId)
      : null;
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const updated = await db
      .update(messagesTable)
      .set({ status: "read" })
      .where(
        and(
          eq(messagesTable.conversationId, id),
          ne(messagesTable.senderId, meId),
          ne(messagesTable.status, "read"),
        ),
      )
      .returning({ id: messagesTable.id });
    if (updated.length > 0) {
      for (const uid of (await getRecipientIds(conv)).filter((u) => u !== meId)) {
        emitToUser(uid, "message:status", {
          conversationId: id,
          messageIds: updated.map((m) => m.id),
          status: "read",
        });
      }
    }
    res.json({ ok: true });
  },
);

export default router;
