import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type AuthenticatedRequest, requireAuth } from "../lib/auth";
import {
  mockDeposits,
  mockPendingWithdrawals,
  mockBets,
  GAME_TYPES,
} from "../lib/cx-mocks";

// Customer-scoped data for the in-chat issue flows (Deposit / Withdrawal /
// Bet History). The logged-in customer only ever sees THEIR OWN records —
// identity comes from the auth token, never from the query string.
// Currently served from mocks (EXTERNAL_API_MOCK, default on); tomorrow these
// handlers will proxy to laxminarayan.live with the same response shapes.

const router: IRouter = Router();

async function requesterName(userId: number): Promise<string> {
  const [u] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return u?.name ?? "Customer";
}

router.get("/cx/deposits", requireAuth, async (req: AuthenticatedRequest, res) => {
  const name = await requesterName(req.auth!.sub);
  res.json({ data: mockDeposits(req.auth!.sub, name) });
});

router.get("/cx/withdrawals", requireAuth, async (req: AuthenticatedRequest, res) => {
  const name = await requesterName(req.auth!.sub);
  res.json({ data: mockPendingWithdrawals(req.auth!.sub, name) });
});

router.get("/cx/bets", requireAuth, async (req: AuthenticatedRequest, res) => {
  const name = await requesterName(req.auth!.sub);
  const { from, to, gameType, status } = req.query as Record<string, string | undefined>;
  res.json({
    data: mockBets(req.auth!.sub, name, { from, to, gameType, status }),
    gameTypes: GAME_TYPES,
  });
});

export default router;
