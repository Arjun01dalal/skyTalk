import {
  db,
  aiSettingsTable,
  supportCategoriesTable,
  conversationsTable,
  messagesTable,
  messageTemplatesTable,
  usersTable,
  type AiSettings,
  type Message,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { emitToUser, emitToAdmins, isUserOnline } from "./socket";
import { slaOnStaffReply } from "./sla";
import { logger } from "./logger";
import { translateText, languageName } from "./translate";

const AI_MODEL = "gpt-5.6-luna";

export async function getAiSettings(): Promise<AiSettings> {
  const [row] = await db.select().from(aiSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(aiSettingsTable).values({}).returning();
  return created!;
}

function serializeMessage(m: Message) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: null,
    isAi: m.isAi,
    content: m.content,
    contentEn: m.contentEn,
    attachmentUrl: m.attachmentUrl,
    attachmentType: m.attachmentType,
    attachmentName: m.attachmentName,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

async function insertAiMessage(
  conversationId: number,
  content: string,
  recipients: number[],
  contentEn?: string | null,
  // When set, the message is attributed to this human sender instead of the AI
  // (used for the handover welcome, which must come from the agent).
  senderId?: number | null,
) {
  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId,
      senderId: senderId ?? null,
      isAi: senderId == null,
      content,
      contentEn: contentEn ?? null,
      status: "delivered",
    })
    .returning();
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));
  // AI replies count as responses for SLA purposes.
  void slaOnStaffReply(conversationId);
  const payload = serializeMessage(message!);
  for (const uid of recipients) emitToUser(uid, "message:new", payload);
  emitToAdmins("monitor:activity", {
    kind: "message",
    conversationId,
    message: payload,
    at: new Date().toISOString(),
  });
  return message!;
}

async function categoryContext(categoryId: number | null): Promise<string> {
  if (!categoryId) return "";
  const parts: string[] = [];
  let currentId: number | null = categoryId;
  // Walk up the category tree (bounded to avoid cycles).
  for (let i = 0; i < 5 && currentId; i++) {
    const [cat] = await db
      .select()
      .from(supportCategoriesTable)
      .where(eq(supportCategoriesTable.id, currentId));
    if (!cat) break;
    parts.unshift(
      `${cat.title}${cat.description ? ` — ${cat.description}` : ""}${cat.aiPrompt ? `\nCategory instructions: ${cat.aiPrompt}` : ""}`,
    );
    currentId = cat.parentId;
  }
  return parts.length
    ? `The user selected this support topic: ${parts.join(" > ")}`
    : "";
}

// Send an admin-configured greeting template ("opening" at AI→human handoff,
// "closing" when the chat is ended) as a system message, translated.
export async function sendGreetingTemplate(
  conv: {
    id: number;
    userAId: number;
    userBId: number | null;
    language: string;
    selectedCategoryId: number | null;
  },
  kind: "opening" | "closing",
) {
  const [tpl] = await db
    .select()
    .from(messageTemplatesTable)
    .where(eq(messageTemplatesTable.kind, kind))
    .limit(1);
  if (!tpl?.content?.trim()) return;

  const participants = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
    .from(usersTable)
    .where(sql`${usersTable.id} in (${conv.userAId}, ${conv.userBId ?? conv.userAId})`);
  const customer = participants.find((p) => p.role === "user");
  const staff = participants.find((p) => p.role !== "user");

  let categoryTitle = "your issue";
  if (conv.selectedCategoryId != null) {
    const [cat] = await db
      .select({ title: supportCategoriesTable.title })
      .from(supportCategoriesTable)
      .where(eq(supportCategoriesTable.id, conv.selectedCategoryId));
    if (cat) categoryTitle = cat.title;
  }

  const now = new Date();
  const textEn = tpl.content
    .replaceAll("{{customer_name}}", customer?.name ?? "there")
    .replaceAll("{{agent_name}}", staff?.name ?? "our support team")
    .replaceAll("{{category}}", categoryTitle)
    .replaceAll("{{date}}", now.toLocaleDateString("en-IN"))
    .replaceAll("{{time}}", now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
  const text =
    conv.language !== "en" ? await translateText(textEn, conv.language) : textEn;
  // The opening welcome must appear to come from the human agent taking over
  // (not from the AI); fall back to an AI note if no staff participant exists.
  await insertAiMessage(
    conv.id,
    text,
    conv.userBId != null ? [conv.userAId, conv.userBId] : [conv.userAId],
    conv.language !== "en" ? textEn : null,
    kind === "opening" ? (staff?.id ?? null) : null,
  );
}

export async function escalateToHuman(
  conversationId: number,
  reason: string,
  opts: { announce?: boolean } = {},
) {
  // Atomically claim the AI→human flip: only the request whose conditional
  // update succeeds sends the one-time welcome (race-safe under parallel
  // escalations).
  const [flipped] = await db
    .update(conversationsTable)
    .set({ mode: "human", escalationReason: reason, updatedAt: new Date() })
    .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.mode, "ai")))
    .returning();
  const wasAi = !!flipped;
  let conv = flipped;
  if (!conv) {
    // Already human — just record the latest escalation reason.
    [conv] = await db
      .update(conversationsTable)
      .set({ escalationReason: reason, updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId))
      .returning();
  }
  if (!conv) return null;
  if (opts.announce !== false) {
    const announceEn =
      "I'm connecting you with a member of our support team. They can see this conversation and will reply here shortly.";
    const announce =
      conv.language !== "en"
        ? await translateText(announceEn, conv.language)
        : announceEn;
    await insertAiMessage(
      conversationId,
      announce,
      conv.userBId != null ? [conv.userAId, conv.userBId] : [conv.userAId],
      conv.language !== "en" ? announceEn : null,
    );
  }
  // One-time welcome (the admin-configured "opening" template) sent exactly
  // when the chat is handed over from AI to a human — never again afterwards,
  // and never when staff pick other quick-reply templates.
  if (wasAi) {
    try {
      await sendGreetingTemplate(conv, "opening");
    } catch (err) {
      logger.error({ err, conversationId }, "handoff welcome failed");
    }
  }
  const event = {
    conversationId,
    reason,
    at: new Date().toISOString(),
  };
  emitToUser(conv.userAId, "conversation:escalated", event);
  if (conv.userBId != null) emitToUser(conv.userBId, "conversation:escalated", event);
  emitToAdmins("monitor:activity", { kind: "escalation", ...event });
  return conv;
}

// Serialize AI generation per conversation: rapid-fire user messages would
// otherwise race on aiResponseCount / mode and could double-reply.
const aiLocks = new Map<number, Promise<void>>();

/**
 * Generate an AI reply for a conversation in "ai" mode after the end-user
 * (`userId`) sent a message. Handles auto-escalation. Fire-and-forget safe.
 */
export function generateAiReply(conversationId: number, userId: number): Promise<void> {
  const prev = aiLocks.get(conversationId) ?? Promise.resolve();
  const run = prev.then(() => generateAiReplyInner(conversationId, userId));
  // Keep the chain alive even if a run throws (inner already catches, belt-and-braces).
  const settled = run.catch(() => {});
  aiLocks.set(conversationId, settled);
  settled.finally(() => {
    if (aiLocks.get(conversationId) === settled) aiLocks.delete(conversationId);
  });
  return run;
}

async function generateAiReplyInner(conversationId: number, userId: number) {
  try {
    const settings = await getAiSettings();
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId));
    if (!conv || conv.mode !== "ai") return;
    if (!settings.aiEnabled) return;

    const recipients =
      conv.userBId != null ? [conv.userAId, conv.userBId] : [conv.userAId];

    if (
      settings.autoEscalation &&
      conv.aiResponseCount >= settings.maxAiResponses
    ) {
      await escalateToHuman(conversationId, "Maximum AI responses reached");
      return;
    }

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.id));
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    const catCtx = await categoryContext(conv.selectedCategoryId);
    const systemPrompt = [
      settings.systemPrompt?.trim() ||
        "You are a friendly, concise customer-support assistant. Help the user resolve their issue. Keep replies short (2-4 sentences) and practical.",
      catCtx,
      settings.greetingMessage && conv.aiResponseCount === 0
        ? `Start your first reply with this greeting (adapt naturally): "${settings.greetingMessage}"`
        : "",
      user ? `The user's name is ${user.name}.` : "",
      conv.language !== "en"
        ? `IMPORTANT: The user speaks ${languageName(conv.language)}. Write "reply" in ${languageName(conv.language)} and also provide "reply_en", an accurate English translation of your reply for the support team.`
        : "",
      `You must respond ONLY with a JSON object: {"reply": string${conv.language !== "en" ? ', "reply_en": string (English translation of reply)' : ""}, "confidence": number 0-100 (how confident you are that your reply resolves the user's issue), "escalate": boolean (true if a human agent is needed), "escalation_reason": string}.
Escalate when: the user explicitly asks for a human, the user sounds frustrated, the issue needs account access or manual action you cannot perform, or you cannot help confidently.`,
      conv.aiResponseCount < 4
        ? `IMPORTANT: A human agent is NOT available yet for this conversation. Do NOT say you are connecting, transferring, or escalating to a human/agent — never promise a handover. If the user asks for a human, politely explain you will try to help first and ask for more details about their issue. Keep genuinely trying to resolve it yourself.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const m of history.slice(-30)) {
      const text =
        m.content?.trim() ||
        (m.attachmentName ? `[sent attachment: ${m.attachmentName}]` : "");
      if (!text) continue;
      chatMessages.push({
        role: m.isAi ? "assistant" : m.senderId === userId ? "user" : "assistant",
        content: text,
      });
    }

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 8192,
      messages: chatMessages,
      response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: {
      reply?: string;
      reply_en?: string;
      confidence?: number;
      escalate?: boolean;
      escalation_reason?: string;
    } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { reply: raw, confidence: 100, escalate: false };
    }

    const reply = parsed.reply?.trim();
    if (reply) {
      // Atomic, state-conditional claim: only counts (and speaks) if the
      // conversation is STILL in AI mode — drops stale replies that finished
      // after a human escalation happened mid-generation.
      const [claimed] = await db
        .update(conversationsTable)
        .set({ aiResponseCount: sql`${conversationsTable.aiResponseCount} + 1` })
        .where(
          and(
            eq(conversationsTable.id, conversationId),
            eq(conversationsTable.mode, "ai"),
          ),
        )
        .returning();
      if (!claimed) return; // escalated while the model was thinking — stay silent
      const replyEn =
        conv.language !== "en"
          ? parsed.reply_en?.trim() || (await translateText(reply, "en"))
          : null;
      await insertAiMessage(conversationId, reply, recipients, replyEn);
    }

    const lowConfidence =
      typeof parsed.confidence === "number" &&
      parsed.confidence < settings.confidenceThreshold;
    // AI must handle at least this many replies before a conversation can be
    // handed to a human (per business rule: connect after ~5 messages, not 1).
    const MIN_AI_RESPONSES_BEFORE_ESCALATION = 5;
    const responsesSoFar = conv.aiResponseCount + (reply ? 1 : 0);
    const shouldEscalate =
      (parsed.escalate === true || (settings.autoEscalation && lowConfidence)) &&
      responsesSoFar >= MIN_AI_RESPONSES_BEFORE_ESCALATION;
    if (shouldEscalate) {
      await escalateToHuman(
        conversationId,
        parsed.escalation_reason ||
          (parsed.escalate ? "AI requested human help" : "Low AI confidence"),
      );
    }
  } catch (err) {
    logger.error({ err, conversationId }, "AI reply generation failed");
    // Fail loudly to the user instead of silently dropping the message.
    try {
      const [conv] = await db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, conversationId));
      if (conv && conv.mode === "ai") {
        await escalateToHuman(
          conversationId,
          "AI assistant unavailable (error)",
        );
      }
    } catch (innerErr) {
      logger.error({ err: innerErr }, "AI failure escalation failed");
    }
  }
}

export function emitAiTyping(recipients: number[], conversationId: number, isTyping: boolean) {
  for (const uid of recipients) {
    if (isUserOnline(uid)) {
      // Sentinel userId -1 = the AI assistant (client renders a bot typing bubble).
      emitToUser(uid, "typing", { conversationId, userId: -1, isAi: true, isTyping });
    }
  }
}
