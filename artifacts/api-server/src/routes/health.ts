import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import {
  type AuthenticatedRequest,
  requireAdmin,
  requireAuth,
} from "../lib/auth";
import { getOperationalSnapshot } from "../lib/operations";
import { getSocketOperationalState } from "../lib/socket";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get(
  "/ops/metrics",
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res) => {
    const reset = req.query["reset"] === "true";
    res.json({
      ...getOperationalSnapshot(reset),
      sockets: getSocketOperationalState(),
      databasePool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    });
  },
);

export default router;
