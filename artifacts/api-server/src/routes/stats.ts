import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  messagesTable,
  callsTable,
  conversationsTable,
} from "@workspace/db";
import { and, count, eq, gte, inArray, ne } from "drizzle-orm";
import {
  type AuthenticatedRequest,
  requireAdmin,
  requireAuth,
} from "../lib/auth";
import { getOnlineUserCount, getOnlineUserIds } from "../lib/socket";

const router: IRouter = Router();

router.get(
  "/stats/summary",
  requireAuth,
  requireAdmin,
  async (_req: AuthenticatedRequest, res) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const onlineIds = getOnlineUserIds();

    const [
      [totalUsers],
      [totalAgents],
      [totalAdmins],
      [messagesToday],
      [callsToday],
      [activeSupportRow],
      [totalUnreadMessages],
      [totalUniqueChats],
      [totalMessages],
      [totalCalls],
    ] = await Promise.all([
      db.select({ n: count() }).from(usersTable).where(eq(usersTable.role, "user")),
      db.select({ n: count() }).from(usersTable).where(eq(usersTable.role, "agent")),
      db.select({ n: count() }).from(usersTable).where(eq(usersTable.role, "admin")),
      db.select({ n: count() }).from(messagesTable).where(gte(messagesTable.createdAt, startOfDay)),
      db.select({ n: count() }).from(callsTable).where(gte(callsTable.startedAt, startOfDay)),
      onlineIds.length > 0
        ? db
            .select({ n: count() })
            .from(usersTable)
            .where(
              and(
                inArray(usersTable.id, onlineIds),
                inArray(usersTable.role, ["agent", "admin"]),
              ),
            )
        : Promise.resolve([{ n: 0 }]),
      db.select({ n: count() }).from(messagesTable).where(ne(messagesTable.status, "read")),
      db.select({ n: count() }).from(conversationsTable),
      db.select({ n: count() }).from(messagesTable),
      db.select({ n: count() }).from(callsTable),
    ]);
    const activeSupportTeam = activeSupportRow?.n ?? 0;

    res.json({
      activeSupportTeam,
      todayTotalChat: messagesToday?.n ?? 0,
      totalUnreadMessages: totalUnreadMessages?.n ?? 0,
      totalUniqueChats: totalUniqueChats?.n ?? 0,
      todayTotalRecordings: 0,
      totalCommunication: (totalMessages?.n ?? 0) + (totalCalls?.n ?? 0),
      totalUsers: totalUsers?.n ?? 0,
      totalAgents: totalAgents?.n ?? 0,
      totalAdmins: totalAdmins?.n ?? 0,
      messagesToday: messagesToday?.n ?? 0,
      callsToday: callsToday?.n ?? 0,
      onlineUsers: getOnlineUserCount(),
    });
  },
);

export default router;
