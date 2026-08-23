import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import ssoRouter from "./sso";
import usersRouter from "./users";
import conversationsRouter from "./conversations";
import uploadsRouter from "./uploads";
import callsRouter from "./calls";
import statsRouter from "./stats";
import adminMonitorRouter from "./admin-monitor";
import supportRouter from "./support";
import externalRouter from "./external";
import cxDataRouter from "./cx-data";
import slaRouter from "./sla";
import groupsRouter from "./groups";
import e2eeRouter from "./e2ee";
import ticketsRouter from "./tickets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(ssoRouter);
router.use(usersRouter);
router.use(conversationsRouter);
router.use(uploadsRouter);
router.use(callsRouter);
router.use(statsRouter);
router.use(adminMonitorRouter);
router.use(supportRouter);
router.use(externalRouter);
router.use(cxDataRouter);
router.use(slaRouter);
router.use(groupsRouter);
router.use(e2eeRouter);
router.use(ticketsRouter);

export default router;
