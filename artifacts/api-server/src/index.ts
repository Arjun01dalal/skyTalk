import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupSocketServer } from "./lib/socket";
import { startTelegramRegistrationPoller } from "./lib/telegram";
import { startSlaMonitor } from "./lib/sla";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
setupSocketServer(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
  startTelegramRegistrationPoller();
  startSlaMonitor();
});
