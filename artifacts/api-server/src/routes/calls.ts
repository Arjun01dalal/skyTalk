import { Router, type IRouter } from "express";
import { db, callsTable, usersTable } from "@workspace/db";
import { desc, eq, inArray, or } from "drizzle-orm";
import {
  type AuthenticatedRequest,
  requireAuth,
  serializeUser,
} from "../lib/auth";

const router: IRouter = Router();

router.get("/calls", requireAuth, async (req: AuthenticatedRequest, res) => {
  const meId = req.auth!.sub;
  const calls = await db
    .select()
    .from(callsTable)
    .where(or(eq(callsTable.callerId, meId), eq(callsTable.calleeId, meId)))
    .orderBy(desc(callsTable.id))
    .limit(100);

  const userIds = new Set<number>();
  for (const c of calls) {
    userIds.add(c.callerId);
    userIds.add(c.calleeId);
  }
  // Batch: one lookup for every user involved instead of one query per user.
  const users = userIds.size
    ? await db.select().from(usersTable).where(inArray(usersTable.id, Array.from(userIds)))
    : [];
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
});

export default router;
