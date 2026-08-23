import {
  db,
  conversationsTable,
  slaSettingsTable,
  slaEventsTable,
  usersTable,
  type SlaSettings,
} from "@workspace/db";
import { and, eq, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { notifyAdminsOnTelegram } from "./telegram";
import { emitToAdmins } from "./socket";
import { logger } from "./logger";

export async function getSlaSettings(): Promise<SlaSettings> {
  // Race-safe singleton: pin the row to id=1 so concurrent first reads can't
  // create duplicate settings rows.
  const [row] = await db
    .select()
    .from(slaSettingsTable)
    .where(eq(slaSettingsTable.id, 1));
  if (row) return row;
  await db.insert(slaSettingsTable).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db
    .select()
    .from(slaSettingsTable)
    .where(eq(slaSettingsTable.id, 1));
  return created!;
}

export function serializeSlaSettings(s: SlaSettings) {
  return {
    firstResponseMins: s.firstResponseMins,
    waitingReplyMins: s.waitingReplyMins,
    resolutionHours: s.resolutionHours,
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * Customer sent a message: open the SLA clock. Starts (or restarts after a
 * resolve) the conversation window and marks the customer as waiting.
 */
export async function slaOnCustomerMessage(conversationId: number) {
  try {
    // Single atomic statement — concurrent customer/staff events must not
    // interleave (read-modify-write would lose clock updates).
    await db.execute(sql`
      UPDATE conversations SET
        opened_at = CASE
          WHEN status = 'resolved' OR opened_at IS NULL THEN now()
          ELSE opened_at
        END,
        -- A reopened conversation starts a fresh SLA window.
        first_response_at = CASE WHEN status = 'resolved' THEN NULL ELSE first_response_at END,
        resolved_at = CASE WHEN status = 'resolved' THEN NULL ELSE resolved_at END,
        awaiting_reply_since = CASE
          WHEN status = 'resolved' THEN now()
          ELSE COALESCE(awaiting_reply_since, now())
        END,
        status = 'open'
      WHERE id = ${conversationId}
    `);
  } catch (err) {
    logger.error({ err }, "slaOnCustomerMessage failed");
  }
}

/** Staff or AI replied: stop the waiting clock, record first response. */
export async function slaOnStaffReply(conversationId: number) {
  try {
    await db.execute(sql`
      UPDATE conversations SET
        first_response_at = CASE
          WHEN first_response_at IS NULL AND opened_at IS NOT NULL THEN now()
          ELSE first_response_at
        END,
        awaiting_reply_since = NULL
      WHERE id = ${conversationId}
    `);
  } catch (err) {
    logger.error({ err }, "slaOnStaffReply failed");
  }
}

const KIND_LABEL: Record<string, string> = {
  first_response: "First response overdue",
  waiting: "Customer waiting too long",
  resolution: "Resolution overdue",
};

/**
 * Periodic breach scan: finds open conversations past their SLA limits,
 * records one event per breached window and alerts admins on Telegram.
 */
async function scanForBreaches() {
  const s = await getSlaSettings();
  const now = Date.now();
  const frCutoff = new Date(now - s.firstResponseMins * 60_000);
  const waitCutoff = new Date(now - s.waitingReplyMins * 60_000);
  const resCutoff = new Date(now - s.resolutionHours * 3_600_000);

  const candidates: { conversationId: number; kind: "first_response" | "waiting" | "resolution"; referenceAt: Date }[] = [];

  const frRows = await db
    .select({ id: conversationsTable.id, ref: conversationsTable.awaitingReplySince })
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.status, "open"),
      isNull(conversationsTable.firstResponseAt),
      isNotNull(conversationsTable.awaitingReplySince),
      lt(conversationsTable.awaitingReplySince, frCutoff),
    ));
  for (const r of frRows) candidates.push({ conversationId: r.id, kind: "first_response", referenceAt: r.ref! });

  const waitRows = await db
    .select({ id: conversationsTable.id, ref: conversationsTable.awaitingReplySince })
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.status, "open"),
      isNotNull(conversationsTable.firstResponseAt),
      isNotNull(conversationsTable.awaitingReplySince),
      lt(conversationsTable.awaitingReplySince, waitCutoff),
    ));
  for (const r of waitRows) candidates.push({ conversationId: r.id, kind: "waiting", referenceAt: r.ref! });

  const resRows = await db
    .select({ id: conversationsTable.id, ref: conversationsTable.openedAt })
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.status, "open"),
      isNotNull(conversationsTable.openedAt),
      lt(conversationsTable.openedAt, resCutoff),
    ));
  for (const r of resRows) candidates.push({ conversationId: r.id, kind: "resolution", referenceAt: r.ref! });

  // Flood control: individual Telegram alerts for the first few new breaches
  // per scan; anything beyond that is rolled into one summary message (a
  // backlog of old conversations must not fan out dozens of alerts at once).
  const MAX_INDIVIDUAL_ALERTS = 3;
  const newBreaches: typeof candidates = [];

  for (const c of candidates) {
    const inserted = await db
      .insert(slaEventsTable)
      .values(c)
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) continue; // already alerted for this window
    newBreaches.push(c);
    emitToAdmins("sla:breach", {
      conversationId: c.conversationId,
      kind: c.kind,
      at: new Date().toISOString(),
    });
  }

  const detailed = newBreaches.slice(0, MAX_INDIVIDUAL_ALERTS);
  for (const c of detailed) {
    // Identify the customer for a readable alert.
    let customer = "";
    try {
      const [conv] = await db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, c.conversationId));
      if (conv) {
        const users = await db
          .select()
          .from(usersTable)
          .where(sql`${usersTable.id} in (${conv.userAId}, ${conv.userBId})`);
        const cust = users.find((u) => u.role === "user");
        if (cust) customer = ` — customer: ${cust.name || cust.email}`;
      }
    } catch { /* name lookup is best-effort */ }
    void notifyAdminsOnTelegram(
      `⏰ SLA breach: ${KIND_LABEL[c.kind]} (conversation #${c.conversationId})${customer}`,
    ).catch((err) => logger.error({ err }, "SLA telegram alert failed"));
  }
  const overflow = newBreaches.length - detailed.length;
  if (overflow > 0) {
    void notifyAdminsOnTelegram(
      `⏰ ${overflow} more SLA breach${overflow === 1 ? "" : "es"} detected — see the SLA page for details.`,
    ).catch((err) => logger.error({ err }, "SLA telegram alert failed"));
  }
}

let slaTimer: ReturnType<typeof setInterval> | null = null;

export function startSlaMonitor() {
  if (slaTimer) return;
  slaTimer = setInterval(() => {
    void scanForBreaches().catch((err) => logger.error({ err }, "SLA scan failed"));
  }, 30_000);
  logger.info("SLA monitor started (30s interval)");
}
