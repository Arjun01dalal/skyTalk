import { Router, type IRouter } from "express";
import {
  db,
  ticketsTable,
  messagesTable,
  callsTable,
  supportCategoriesTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, gte, lt, lte, or, inArray } from "drizzle-orm";
import { type AuthenticatedRequest, requireAuth, serializeUser } from "../lib/auth";
import { serializeMessage, senderNameMap } from "./conversations";

const router: IRouter = Router();

// List archived chat tickets. Admin sees all, agents see their own tickets,
// customers see tickets from their own chats.
router.get("/tickets", requireAuth, async (req: AuthenticatedRequest, res) => {
  const meId = req.auth!.sub;
  const role = req.auth!.role;
  const where =
    role === "admin"
      ? undefined
      : role === "agent"
        ? eq(ticketsTable.agentId, meId)
        : eq(ticketsTable.customerId, meId);

  const rows = await db
    .select()
    .from(ticketsTable)
    .where(where)
    .orderBy(desc(ticketsTable.id))
    .limit(300);

  const userIds = [
    ...new Set(
      rows.flatMap((t) => [t.customerId, t.agentId]).filter((v): v is number => v != null),
    ),
  ];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const catIds = [...new Set(rows.map((t) => t.categoryId).filter((v): v is number => v != null))];
  const cats = catIds.length
    ? await db
        .select()
        .from(supportCategoriesTable)
        .where(inArray(supportCategoriesTable.id, catIds))
    : [];
  const catOf = new Map(cats.map((c) => [c.id, c.title]));

  res.json(
    rows.map((t) => ({
      id: t.id,
      ticketNo: t.ticketNo,
      conversationId: t.conversationId,
      customerId: t.customerId,
      customerName: nameOf.get(t.customerId) ?? "Customer",
      agentId: t.agentId,
      agentName: t.agentId != null ? (nameOf.get(t.agentId) ?? null) : null,
      categoryTitle: t.categoryId != null ? (catOf.get(t.categoryId) ?? null) : null,
      messageCount: t.messageCount,
      openedAt: t.openedAt ? t.openedAt.toISOString() : null,
      closedAt: t.closedAt.toISOString(),
    })),
  );
});

// Full transcript of one ticket (the archived message range).
router.get(
  "/tickets/:id/messages",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }
    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const meId = req.auth!.sub;
    const role = req.auth!.role;
    const allowed =
      role === "admin" ||
      (role === "agent" && ticket.agentId === meId) ||
      (role === "user" && ticket.customerId === meId);
    if (!allowed) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const messages = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, ticket.conversationId),
          gte(messagesTable.id, ticket.fromMessageId),
          lte(messagesTable.id, ticket.toMessageId),
        ),
      )
      .orderBy(messagesTable.id);
    const names = await senderNameMap(messages);
    res.json(
      messages.map((m) =>
        serializeMessage(m, m.senderId != null ? names.get(m.senderId) : null, null),
      ),
    );
  },
);

// Calls that happened during this ticket's chat window (between the previous
// ticket's close and this ticket's close), between the customer and agent.
router.get(
  "/tickets/:id/calls",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }
    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const meId = req.auth!.sub;
    const role = req.auth!.role;
    const allowed =
      role === "admin" ||
      (role === "agent" && ticket.agentId === meId) ||
      (role === "user" && ticket.customerId === meId);
    if (!allowed) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    // Window starts after the previous ticket on the same conversation closed.
    const [prev] = await db
      .select()
      .from(ticketsTable)
      .where(
        and(
          eq(ticketsTable.conversationId, ticket.conversationId),
          lt(ticketsTable.id, ticket.id),
        ),
      )
      .orderBy(desc(ticketsTable.id))
      .limit(1);
    const participants = [ticket.customerId, ticket.agentId].filter(
      (v): v is number => v != null,
    );
    if (participants.length < 2) {
      res.json([]);
      return;
    }
    const conds = [
      or(
        and(eq(callsTable.callerId, participants[0]!), eq(callsTable.calleeId, participants[1]!)),
        and(eq(callsTable.callerId, participants[1]!), eq(callsTable.calleeId, participants[0]!)),
      ),
      lte(callsTable.startedAt, ticket.closedAt),
    ];
    if (prev) conds.push(gt(callsTable.startedAt, prev.closedAt));
    const calls = await db
      .select()
      .from(callsTable)
      .where(and(...conds))
      .orderBy(callsTable.id);

    const users = await db.select().from(usersTable).where(inArray(usersTable.id, participants));
    const userMap = new Map(users.map((u) => [u.id, serializeUser(u)]));
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
