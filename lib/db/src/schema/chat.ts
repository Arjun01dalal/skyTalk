import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const conversationsTable = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    userAId: integer("user_a_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Null for group conversations (members live in conversation_members).
    userBId: integer("user_b_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    // 'caller'  = support chat auto-assigned to an agent via the SSO link
    // 'direct'  = normal one-to-one chat between two registered users
    // 'group'   = multi-member group chat
    type: text("type", { enum: ["caller", "direct", "group"] })
      .notNull()
      .default("caller"),
    // Group-only fields
    title: text("title"),
    iconUrl: text("icon_url"),
    createdById: integer("created_by_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // AI-first support flow
    mode: text("mode", { enum: ["ai", "human"] }).notNull().default("human"),
    selectedCategoryId: integer("selected_category_id"),
    escalationReason: text("escalation_reason"),
    aiResponseCount: integer("ai_response_count").notNull().default(0),
    // Customer-facing language for this conversation (BCP-47-ish code, e.g. "hi").
    language: text("language").notNull().default("en"),
    // Agent flagged this conversation for the admin to reply directly.
    adminEscalated: boolean("admin_escalated").notNull().default(false),
    // SLA tracking: a conversation "opens" when the customer sends a message
    // and is "resolved" when staff mark it done. Reopens on new customer msg.
    status: text("status", { enum: ["open", "resolved"] })
      .notNull()
      .default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    // Oldest customer message not yet answered by staff/AI (null = answered).
    awaitingReplySince: timestamp("awaiting_reply_since", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("conversations_pair_idx").on(t.userAId, t.userBId)],
);

export type Conversation = typeof conversationsTable.$inferSelect;

// Membership for group conversations only (1:1 chats keep userA/userB).
export const conversationMembersTable = pgTable(
  "conversation_members",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    addedById: integer("added_by_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("conversation_members_conversation_id_user_id_key").on(t.conversationId, t.userId)],
);

export type ConversationMember = typeof conversationMembersTable.$inferSelect;

export const messagesTable = pgTable(
  "messages",
  {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  // Nullable: AI assistant messages have no human sender.
  senderId: integer("sender_id").references(() => usersTable.id, {
    onDelete: "cascade",
  }),
  isAi: boolean("is_ai").notNull().default(false),
  // E2EE (direct/group chats): true means `content` is null and the actual
  // payload lives in message_envelopes, one ciphertext per recipient.
  encrypted: boolean("encrypted").notNull().default(false),
  content: text("content"),
  // English rendition of `content` when the conversation language is not
  // English (staff always read/write English; customers see `content`).
  contentEn: text("content_en"),
  attachmentUrl: text("attachment_url"),
  attachmentType: text("attachment_type"),
  attachmentName: text("attachment_name"),
    status: text("status", { enum: ["sent", "delivered", "read"] })
      .notNull()
      .default("sent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Hot path: thread loads / pagination / unread counts all filter by
  // conversation_id and range/order on id.
  (t) => [index("messages_conversation_id_id_idx").on(t.conversationId, t.id)],
);

export type Message = typeof messagesTable.$inferSelect;

// ---------------------------------------------------------------------------
// End-to-end encryption (Signal protocol) — direct & group chats only.
// The server stores PUBLIC key material and ciphertext only; private keys
// never leave the client (IndexedDB).
// ---------------------------------------------------------------------------

// One "device" (key bundle) per user: identity key + current signed prekey.
export const e2eeDevicesTable = pgTable("e2ee_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  registrationId: integer("registration_id").notNull(),
  identityKey: text("identity_key").notNull(),
  signedPrekeyId: integer("signed_prekey_id").notNull(),
  signedPrekeyPub: text("signed_prekey_pub").notNull(),
  signedPrekeySignature: text("signed_prekey_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type E2eeDevice = typeof e2eeDevicesTable.$inferSelect;

// One-time prekeys: consumed (deleted) when handed out in a bundle.
export const e2eePrekeysTable = pgTable(
  "e2ee_prekeys",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    keyId: integer("key_id").notNull(),
    pubKey: text("pub_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("e2ee_prekeys_user_key_unique").on(t.userId, t.keyId)],
);

export type E2eePrekey = typeof e2eePrekeysTable.$inferSelect;

// Per-recipient ciphertext for encrypted messages (pairwise Signal sessions).
export const messageEnvelopesTable = pgTable(
  "message_envelopes",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messagesTable.id, { onDelete: "cascade" }),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // libsignal ciphertext message type: 3 = PreKeyWhisperMessage, 1 = WhisperMessage.
    ciphertextType: integer("ciphertext_type").notNull(),
    ciphertext: text("ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The unique index doubles as the lookup index for
  // (message_id, recipient_id) envelope fetches.
  (t) => [uniqueIndex("message_envelopes_msg_recipient_unique").on(t.messageId, t.recipientId)],
);

export type MessageEnvelope = typeof messageEnvelopesTable.$inferSelect;

export const callsTable = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    callerId: integer("caller_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    calleeId: integer("callee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["missed", "answered", "rejected"] })
      .notNull()
      .default("missed"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
  },
  // Call history is queried by "caller_id = me OR callee_id = me".
  (t) => [index("calls_caller_id_idx").on(t.callerId), index("calls_callee_id_idx").on(t.calleeId)],
);

export type Call = typeof callsTable.$inferSelect;

export const supportCategoriesTable = pgTable("support_categories", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  aiPrompt: text("ai_prompt"),
  requiresInput: boolean("requires_input").notNull().default(false),
  inputPrompt: text("input_prompt"),
  language: text("language").notNull().default("en"),
  parentId: integer("parent_id").references(
    (): AnyPgColumn => supportCategoriesTable.id,
    { onDelete: "cascade" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SupportCategory = typeof supportCategoriesTable.$inferSelect;

// Predefined quick-reply templates staff can insert, edit, and send.
export const messageTemplatesTable = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  // Optional link to a support category: template is offered when a chat in
  // that category (or one of its subcategories) is active. Null = general.
  categoryId: integer("category_id").references(
    () => supportCategoriesTable.id,
    { onDelete: "set null" },
  ),
  // 'opening' / 'closing' are the shared greeting + sign-off automatically
  // wrapped around any 'normal' template when staff insert it.
  kind: text("kind", { enum: ["normal", "opening", "closing"] })
    .notNull()
    .default("normal"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MessageTemplate = typeof messageTemplatesTable.$inferSelect;

export const aiSettingsTable = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  systemPrompt: text("system_prompt"),
  greetingMessage: text("greeting_message"),
  confidenceThreshold: integer("confidence_threshold").notNull().default(60),
  maxAiResponses: integer("max_ai_responses").notNull().default(6),
  autoEscalation: boolean("auto_escalation").notNull().default(true),
  supportPhone: text("support_phone"),
  // Comma-separated Telegram chat IDs to notify when a chat is escalated to admin.
  telegramChatIds: text("telegram_chat_ids"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AiSettings = typeof aiSettingsTable.$inferSelect;

// Singleton row of admin-configurable SLA time limits.
export const slaSettingsTable = pgTable("sla_settings", {
  id: serial("id").primaryKey(),
  firstResponseMins: integer("first_response_mins").notNull().default(2),
  waitingReplyMins: integer("waiting_reply_mins").notNull().default(5),
  resolutionHours: integer("resolution_hours").notNull().default(12),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SlaSettings = typeof slaSettingsTable.$inferSelect;

// One row per SLA breach (deduped per conversation/kind/reference window).
export const slaEventsTable = pgTable(
  "sla_events",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["first_response", "waiting", "resolution"],
    }).notNull(),
    // Start of the breached window (e.g. when the customer started waiting).
    referenceAt: timestamp("reference_at", { withTimezone: true }).notNull(),
    breachedAt: timestamp("breached_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("sla_events_dedup_idx").on(t.conversationId, t.kind, t.referenceAt)],
);

export type SlaEvent = typeof slaEventsTable.$inferSelect;

// One row per ended support chat: when staff (or the customer) ends a caller
// chat, the messages exchanged since the previous ticket are archived under a
// human-readable ticket number and shown in the History page.
export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  // Human-readable ticket number, e.g. "TKT-000042" (derived from id).
  ticketNo: text("ticket_no").notNull().default(""),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  categoryId: integer("category_id"),
  // Message id range archived in this ticket (inclusive).
  fromMessageId: integer("from_message_id").notNull(),
  toMessageId: integer("to_message_id").notNull(),
  messageCount: integer("message_count").notNull().default(0),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedById: integer("closed_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
});

export type Ticket = typeof ticketsTable.$inferSelect;
