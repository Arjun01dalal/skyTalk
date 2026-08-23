import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  slaSettingsTable,
  slaEventsTable,
  usersTable,
} from "@workspace/db";
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  type AuthenticatedRequest,
  requireAuth,
  requireAdmin,
} from "../lib/auth";
import { getSlaSettings, serializeSlaSettings } from "../lib/sla";
import { UpdateSlaSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Staff (agent/admin) can read the limits to render warning timers.
router.get(
  "/sla/settings",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    if (req.auth!.role === "user") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(serializeSlaSettings(await getSlaSettings()));
  },
);

// Only admins may change the limits.
router.put(
  "/admin/sla-settings",
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const parsed = UpdateSlaSettingsBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const current = await getSlaSettings();
    const [updated] = await db
      .update(slaSettingsTable)
      .set({
        firstResponseMins: parsed.data.firstResponseMins ?? current.firstResponseMins,
        waitingReplyMins: parsed.data.waitingReplyMins ?? current.waitingReplyMins,
        resolutionHours: parsed.data.resolutionHours ?? current.resolutionHours,
        updatedAt: new Date(),
      })
      .where(eq(slaSettingsTable.id, current.id))
      .returning();
    res.json(serializeSlaSettings(updated!));
  },
);

// SLA report: totals, averages, and the latest breaches.
router.get(
  "/admin/sla-report",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    const [totals] = (await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'open' AND opened_at IS NOT NULL)::int AS open_count,
        count(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
        avg(EXTRACT(EPOCH FROM (first_response_at - opened_at)))
          FILTER (WHERE first_response_at IS NOT NULL AND opened_at IS NOT NULL) AS avg_first_response_secs,
        avg(EXTRACT(EPOCH FROM (resolved_at - opened_at)))
          FILTER (WHERE resolved_at IS NOT NULL AND opened_at IS NOT NULL) AS avg_resolution_secs
      FROM conversations
    `)).rows as Array<Record<string, unknown>>;

    const [breachTotals] = (await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE kind = 'first_response')::int AS first_response,
        count(*) FILTER (WHERE kind = 'waiting')::int AS waiting,
        count(*) FILTER (WHERE kind = 'resolution')::int AS resolution
      FROM sla_events
    `)).rows as Array<Record<string, unknown>>;

    const events = await db
      .select()
      .from(slaEventsTable)
      .orderBy(desc(slaEventsTable.id))
      .limit(50);

    // Resolve customer names for the listed breaches.
    const convIds = [...new Set(events.map((e) => e.conversationId))];
    const nameByConv = new Map<number, string>();
    if (convIds.length) {
      const convs = await db
        .select()
        .from(conversationsTable)
        .where(inArray(conversationsTable.id, convIds));
      const userIds = [
        ...new Set(
          convs.flatMap((c) =>
            c.userBId != null ? [c.userAId, c.userBId] : [c.userAId],
          ),
        ),
      ];
      const users = userIds.length
        ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
        : [];
      const userById = new Map(users.map((u) => [u.id, u]));
      for (const c of convs) {
        const cust = [
          userById.get(c.userAId),
          c.userBId != null ? userById.get(c.userBId) : undefined,
        ].find(
          (u) => u?.role === "user",
        );
        if (cust) nameByConv.set(c.id, cust.name || cust.email);
      }
    }

    res.json({
      settings: serializeSlaSettings(await getSlaSettings()),
      openCount: Number(totals?.["open_count"] ?? 0),
      resolvedCount: Number(totals?.["resolved_count"] ?? 0),
      avgFirstResponseSecs:
        totals?.["avg_first_response_secs"] != null
          ? Math.round(Number(totals["avg_first_response_secs"]))
          : null,
      avgResolutionSecs:
        totals?.["avg_resolution_secs"] != null
          ? Math.round(Number(totals["avg_resolution_secs"]))
          : null,
      breachTotals: {
        firstResponse: Number(breachTotals?.["first_response"] ?? 0),
        waiting: Number(breachTotals?.["waiting"] ?? 0),
        resolution: Number(breachTotals?.["resolution"] ?? 0),
      },
      recentBreaches: events.map((e) => ({
        id: e.id,
        conversationId: e.conversationId,
        kind: e.kind,
        customerName: nameByConv.get(e.conversationId) ?? null,
        referenceAt: e.referenceAt.toISOString(),
        breachedAt: e.breachedAt.toISOString(),
      })),
    });
  },
);

export default router;
