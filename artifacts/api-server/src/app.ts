import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { incrementOperationalCounter } from "./lib/operations";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  incrementOperationalCounter("httpRequests");
  const isMessageSend =
    req.method === "POST" &&
    /^\/api\/conversations\/\d+\/messages$/.test(req.path);
  if (isMessageSend) incrementOperationalCounter("messageSendAttempts");

  res.on("finish", () => {
    if (res.statusCode >= 500) {
      incrementOperationalCounter("httpServerErrors");
      if (isMessageSend) incrementOperationalCounter("messageSendErrors");
    } else if (isMessageSend && res.statusCode >= 400) {
      incrementOperationalCounter("messageSendRejected");
    }
  });
  next();
});
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
