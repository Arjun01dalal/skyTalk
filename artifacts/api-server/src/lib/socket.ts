import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  db,
  usersTable,
  callsTable,
  messagesTable,
  conversationsTable,
  conversationMembersTable,
} from "@workspace/db";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { verifyAccessToken } from "./auth";
import { logger } from "./logger";
import { incrementOperationalCounter } from "./operations";
import { issueTurnIceServer, getStunFallbackIceServer, type TurnIceServer, type StunIceServer } from "./turn";

let io: Server | null = null;

// userId -> set of socket ids
const onlineUsers = new Map<number, Set<string>>();

// callId -> call state
interface ActiveCall {
  callId: number;
  callerId: number;
  calleeId: number;
  answeredAt: number | null;
  lastQualityReportAt: Map<number, number>;
}
const activeCalls = new Map<number, ActiveCall>();
const turnCredentialWindows = new Map<number, { startedAt: number; issued: number }>();
const TURN_CREDENTIAL_WINDOW_MS = 60 * 60_000;
const TURN_CREDENTIALS_PER_USER_PER_WINDOW = 3;

export function isUserOnline(userId: number): boolean {
  return onlineUsers.has(userId);
}

export function emitToUser(
  userId: number,
  event: string,
  payload: unknown,
): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

// Broadcast to every connected client (e.g. tell admins the user list changed).
export function broadcast(event: string, payload: unknown): void {
  io?.emit(event, payload);
}

// Emit only to connected admins (system-wide monitoring feed).
export function emitToAdmins(event: string, payload: unknown): void {
  io?.to("role:admin").emit(event, payload);
}

type CallQualityReport = {
  iceConnectionState?: string;
  connectionState?: string;
  candidateType?: string;
  packetsLost?: number;
  packetsReceived?: number;
  jitterMs?: number;
  roundTripTimeMs?: number;
  inboundBitrateKbps?: number;
  outboundBitrateKbps?: number;
  recovery?: boolean;
};

function isDegradedQuality(report: CallQualityReport): boolean {
  if (report.iceConnectionState === "failed") return true;
  if (report.connectionState === "failed") return true;
  const packetsLost = report.packetsLost ?? 0;
  const packetsReceived = report.packetsReceived ?? 0;
  if (packetsLost > 0 && packetsReceived > 0) {
    return packetsLost / (packetsLost + packetsReceived) > 0.05;
  }
  return (report.jitterMs ?? 0) > 30 || (report.roundTripTimeMs ?? 0) > 500;
}

function validState(
  value: unknown,
  allowed: readonly string[],
): string | undefined | null {
  if (value == null) return undefined;
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function finiteMetric(
  value: unknown,
  maximum: number,
  integer = false,
): number | undefined | null {
  if (value == null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function parseQualityReport(value: unknown): CallQualityReport | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const iceConnectionState = validState(input["iceConnectionState"], [
    "new",
    "checking",
    "connected",
    "completed",
    "failed",
    "disconnected",
    "closed",
  ]);
  const connectionState = validState(input["connectionState"], [
    "new",
    "connecting",
    "connected",
    "disconnected",
    "failed",
    "closed",
  ]);
  const candidateType = validState(input["candidateType"], [
    "host",
    "srflx",
    "prflx",
    "relay",
  ]);
  const packetsLost = finiteMetric(input["packetsLost"], 1_000_000_000, true);
  const packetsReceived = finiteMetric(
    input["packetsReceived"],
    1_000_000_000,
    true,
  );
  const jitterMs = finiteMetric(input["jitterMs"], 60_000);
  const roundTripTimeMs = finiteMetric(input["roundTripTimeMs"], 60_000);
  const inboundBitrateKbps = finiteMetric(
    input["inboundBitrateKbps"],
    10_000,
  );
  const outboundBitrateKbps = finiteMetric(
    input["outboundBitrateKbps"],
    10_000,
  );
  if (
    [
      iceConnectionState,
      connectionState,
      candidateType,
      packetsLost,
      packetsReceived,
      jitterMs,
      roundTripTimeMs,
      inboundBitrateKbps,
      outboundBitrateKbps,
    ].some((metric) => metric === null)
  ) {
    return null;
  }
  return {
    iceConnectionState: iceConnectionState ?? undefined,
    connectionState: connectionState ?? undefined,
    candidateType: candidateType ?? undefined,
    packetsLost: packetsLost ?? undefined,
    packetsReceived: packetsReceived ?? undefined,
    jitterMs: jitterMs ?? undefined,
    roundTripTimeMs: roundTripTimeMs ?? undefined,
    inboundBitrateKbps: inboundBitrateKbps ?? undefined,
    outboundBitrateKbps: outboundBitrateKbps ?? undefined,
    recovery: input["recovery"] === true,
  };
}

async function setPresence(userId: number, isOnline: boolean) {
  const lastSeenAt = new Date();
  await db
    .update(usersTable)
    .set({ isOnline, lastSeenAt })
    .where(eq(usersTable.id, userId));
  io?.emit("presence", {
    userId,
    isOnline,
    lastSeenAt: lastSeenAt.toISOString(),
  });
}

async function markUndeliveredAsDelivered(userId: number) {
  // All messages sent to this user that are still "sent" become "delivered".
  // Covers 1:1 conversations (userA/userB) and group conversations the user
  // belongs to (conversation_members).
  const memberRows = await db
    .select({ conversationId: conversationMembersTable.conversationId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.userId, userId));
  const memberConvIds = memberRows.map((r) => r.conversationId);
  const convs = await db
    .select()
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.userAId, userId),
        eq(conversationsTable.userBId, userId),
        ...(memberConvIds.length > 0
          ? [inArray(conversationsTable.id, memberConvIds)]
          : []),
      ),
    );
  for (const conv of convs) {
    const updated = await db
      .update(messagesTable)
      .set({ status: "delivered" })
      .where(
        and(
          eq(messagesTable.conversationId, conv.id),
          ne(messagesTable.senderId, userId),
          eq(messagesTable.status, "sent"),
        ),
      )
      .returning({ id: messagesTable.id });
    if (updated.length === 0) continue;
    if (conv.type === "group") {
      // Tell every other group member (senders included) about the change.
      const { getGroupMemberIds } = await import("../routes/conversations");
      for (const uid of await getGroupMemberIds(conv.id)) {
        if (uid !== userId) {
          emitToUser(uid, "message:status", {
            conversationId: conv.id,
            messageIds: updated.map((u) => u.id),
            status: "delivered",
          });
        }
      }
      continue;
    }
    {
      const otherId = conv.userAId === userId ? conv.userBId : conv.userAId;
      if (otherId == null) continue;
      emitToUser(otherId, "message:status", {
        conversationId: conv.id,
        messageIds: updated.map((m) => m.id),
        status: "delivered",
      });
    }
  }
}

async function serializeCallUser(userId: number) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function endCall(
  call: ActiveCall,
  finalStatus: "missed" | "answered" | "rejected",
) {
  activeCalls.delete(call.callId);
  const endedAt = new Date();
  const durationSeconds = call.answeredAt
    ? Math.round((endedAt.getTime() - call.answeredAt) / 1000)
    : null;
  await db
    .update(callsTable)
    .set({ status: finalStatus, endedAt, durationSeconds })
    .where(eq(callsTable.id, call.callId));
}

function handleCallEvents(socket: Socket, userId: number) {
  let cachedTurnIceServer: TurnIceServer | StunIceServer | null = null;
  let turnIceServerIssuedAt = 0;
  let lastTurnFailureLoggedAt = 0;

  socket.on(
    "call:initiate",
    async (
      data: { toUserId: number; offer: unknown },
      ack?: (resp: { callId?: number; error?: string }) => void,
    ) => {
      incrementOperationalCounter("callSignalAttempts");
      try {
        const toUserId = Number(data?.toUserId);
        if (!Number.isInteger(toUserId) || toUserId === userId) {
          incrementOperationalCounter("callSignalRejected");
          ack?.({ error: "Invalid callee" });
          return;
        }
        // Busy = already in (or ringing on) another call.
        const calleeBusy = Array.from(activeCalls.values()).some(
          (c) => c.callerId === toUserId || c.calleeId === toUserId,
        );
        if (!isUserOnline(toUserId) || calleeBusy) {
          incrementOperationalCounter("callSignalRejected");
          // Still record the attempt so admins see it and the user sees a
          // "missed" entry in the thread.
          const [row] = await db
            .insert(callsTable)
            .values({
              callerId: userId,
              calleeId: toUserId,
              status: "missed",
              endedAt: new Date(),
            })
            .returning();
          const from = await serializeCallUser(userId);
          const to = await serializeCallUser(toUserId);
          emitToAdmins("monitor:activity", {
            kind: "call",
            callId: row!.id,
            from,
            to,
            at: new Date().toISOString(),
          });
          ack?.({ error: calleeBusy ? "busy" : "offline" });
          return;
        }
        const [row] = await db
          .insert(callsTable)
          .values({ callerId: userId, calleeId: toUserId, status: "missed" })
          .returning();
        const call: ActiveCall = {
          callId: row!.id,
          callerId: userId,
          calleeId: toUserId,
          answeredAt: null,
          lastQualityReportAt: new Map(),
        };
        activeCalls.set(call.callId, call);
        const from = await serializeCallUser(userId);
        emitToUser(toUserId, "call:incoming", {
          callId: call.callId,
          from,
          offer: data.offer,
        });
        const to = await serializeCallUser(toUserId);
        emitToAdmins("monitor:activity", {
          kind: "call",
          callId: call.callId,
          from,
          to,
          at: new Date().toISOString(),
        });
        ack?.({ callId: call.callId });
        // Auto-expire unanswered calls after 45s
        setTimeout(async () => {
          try {
            const still = activeCalls.get(call.callId);
            if (still && !still.answeredAt) {
              await endCall(still, "missed");
              emitToUser(still.callerId, "call:ended", { callId: call.callId });
              emitToUser(still.calleeId, "call:ended", { callId: call.callId });
            }
          } catch (err) {
            incrementOperationalCounter("callSignalErrors");
            logger.error({ err, callId: call.callId }, "call expiry failed");
          }
        }, 45000);
      } catch (err) {
        incrementOperationalCounter("callSignalErrors");
        logger.error({ err }, "call:initiate failed");
        ack?.({ error: "Failed to start call" });
      }
    },
  );

  socket.on(
    "call:accept",
    async (data: { callId: number; answer: unknown }) => {
      incrementOperationalCounter("callSignalAttempts");
      try {
        const call = activeCalls.get(Number(data?.callId));
        if (!call || call.calleeId !== userId) {
          incrementOperationalCounter("callSignalRejected");
          return;
        }
        call.answeredAt = Date.now();
        await db
          .update(callsTable)
          .set({ status: "answered" })
          .where(eq(callsTable.id, call.callId));
        emitToUser(call.callerId, "call:accepted", {
          callId: call.callId,
          answer: data.answer,
        });
      } catch (err) {
        incrementOperationalCounter("callSignalErrors");
        logger.error({ err, userId }, "call:accept failed");
      }
    },
  );

  socket.on("call:reject", async (data: { callId: number }) => {
    incrementOperationalCounter("callSignalAttempts");
    try {
      const call = activeCalls.get(Number(data?.callId));
      if (!call || call.calleeId !== userId) {
        incrementOperationalCounter("callSignalRejected");
        return;
      }
      await endCall(call, "rejected");
      emitToUser(call.callerId, "call:rejected", { callId: call.callId });
    } catch (err) {
      incrementOperationalCounter("callSignalErrors");
      logger.error({ err, userId }, "call:reject failed");
    }
  });

  socket.on("call:end", async (data: { callId: number }) => {
    incrementOperationalCounter("callSignalAttempts");
    try {
      const call = activeCalls.get(Number(data?.callId));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
        incrementOperationalCounter("callSignalRejected");
        return;
      }
      await endCall(call, call.answeredAt ? "answered" : "missed");
      const otherId = call.callerId === userId ? call.calleeId : call.callerId;
      emitToUser(otherId, "call:ended", { callId: call.callId });
    } catch (err) {
      incrementOperationalCounter("callSignalErrors");
      logger.error({ err, userId }, "call:end failed");
    }
  });

  socket.on(
    "call:ice-config",
    (ack?: (response: {
      iceServer?: TurnIceServer | StunIceServer;
      error?: string;
    }) => void) => {
      incrementOperationalCounter("turnCredentialRequests");
      try {
        const now = Date.now();
        if (cachedTurnIceServer && now - turnIceServerIssuedAt < 5 * 60_000) {
          ack?.({ iceServer: cachedTurnIceServer });
          return;
        }
        const priorWindow = turnCredentialWindows.get(userId);
        const credentialWindow =
          priorWindow && now - priorWindow.startedAt < TURN_CREDENTIAL_WINDOW_MS
            ? priorWindow
            : { startedAt: now, issued: 0 };
        if (credentialWindow.issued >= TURN_CREDENTIALS_PER_USER_PER_WINDOW) {
          incrementOperationalCounter("turnCredentialFailures");
          ack?.({
            error:
              "Voice relay credentials have been requested too often. Please try again later.",
          });
          return;
        }
        const iceServer = issueTurnIceServer(userId);
        if (!iceServer) {
          // TURN is not yet configured — return a public STUN fallback so
          // peer-to-peer calls continue to work. Relayed calls on restrictive
          // networks require TURN_URLS + TURN_SHARED_SECRET to be set.
          if (now - lastTurnFailureLoggedAt >= 60_000) {
            lastTurnFailureLoggedAt = now;
            logger.warn(
              { userId },
              "TURN relay not configured; returning public STUN fallback",
            );
          }
          const stunServer = getStunFallbackIceServer();
          cachedTurnIceServer = stunServer;
          turnIceServerIssuedAt = now;
          ack?.({ iceServer: stunServer });
          return;
        }
        credentialWindow.issued += 1;
        turnCredentialWindows.set(userId, credentialWindow);
        cachedTurnIceServer = iceServer;
        turnIceServerIssuedAt = now;
        ack?.({ iceServer });
      } catch (err) {
        incrementOperationalCounter("turnCredentialFailures");
        logger.error({ err, userId }, "TURN credential generation failed");
        ack?.({ error: "Voice relay credentials could not be issued." });
      }
    },
  );

  socket.on(
    "call:renegotiate",
    (data: { callId: number; offer: unknown }) => {
      const call = activeCalls.get(Number(data?.callId));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
        incrementOperationalCounter("callSignalRejected");
        return;
      }
      incrementOperationalCounter("callIceRestarts");
      const otherId = call.callerId === userId ? call.calleeId : call.callerId;
      emitToUser(otherId, "call:renegotiate", {
        callId: call.callId,
        offer: data.offer,
      });
    },
  );

  socket.on(
    "call:renegotiated",
    (data: { callId: number; answer: unknown }) => {
      const call = activeCalls.get(Number(data?.callId));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
        incrementOperationalCounter("callSignalRejected");
        return;
      }
      const otherId = call.callerId === userId ? call.calleeId : call.callerId;
      emitToUser(otherId, "call:renegotiated", {
        callId: call.callId,
        answer: data.answer,
      });
    },
  );

  socket.on(
    "call:quality",
    (data: { callId: number; report: unknown }) => {
      const call = activeCalls.get(Number(data?.callId));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
        incrementOperationalCounter("callSignalRejected");
        return;
      }
      const now = Date.now();
      const lastReportAt = call.lastQualityReportAt.get(userId) ?? 0;
      if (now - lastReportAt < 10_000) return;
      const report = parseQualityReport(data.report);
      if (!report) return;
      call.lastQualityReportAt.set(userId, now);
      incrementOperationalCounter("callQualityReports");
      if (report.candidateType === "relay") {
        incrementOperationalCounter("callRelayQualityReports");
      }
      if (isDegradedQuality(report)) {
        incrementOperationalCounter("callQualityDegraded");
        logger.warn(
          {
            callId: call.callId,
            userId,
            ...report,
          },
          "degraded call quality reported",
        );
      }
    },
  );

  socket.on(
    "call:ice",
    (data: { callId: number; candidate: unknown }) => {
      incrementOperationalCounter("callSignalAttempts");
      const call = activeCalls.get(Number(data?.callId));
      if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
        incrementOperationalCounter("callSignalRejected");
        return;
      }
      const otherId = call.callerId === userId ? call.calleeId : call.callerId;
      emitToUser(otherId, "call:ice", {
        callId: call.callId,
        candidate: data.candidate,
      });
    },
  );
}

export function setupSocketServer(httpServer: HttpServer): void {
  // Clear stale presence flags left over from a previous process (crash or
  // redeploy) — nobody is connected the moment the server boots, so any
  // is_online=true rows are stale and skew the online counts. Connection
  // handlers await this promise so an early connection's setPresence(true)
  // can't be clobbered by a late-finishing reset.
  const presenceResetDone = db
    .update(usersTable)
    .set({ isOnline: false })
    .where(eq(usersTable.isOnline, true))
    .then(() => undefined)
    .catch((err: unknown) => {
      logger.error({ err }, "failed to reset stale presence");
    });

  io = new Server(httpServer, {
    path: "/api/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.["token"] as string | undefined;
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload) {
      incrementOperationalCounter("socketConnectionsRejected");
      next(new Error("unauthorized"));
      return;
    }
    socket.data["userId"] = payload.sub;
    socket.data["role"] = payload.role;
    next();
  });

  io.on("connection", async (socket) => {
    incrementOperationalCounter("socketConnectionsAccepted");
    await presenceResetDone;
    const userId = socket.data["userId"] as number;
    const role = socket.data["role"] as string;
    socket.join(`user:${userId}`);
    // Admins join a shared room so they receive the system-wide activity feed.
    if (role === "admin") socket.join("role:admin");

    const wasOffline = !onlineUsers.has(userId);
    let sockets = onlineUsers.get(userId);
    if (!sockets) {
      sockets = new Set();
      onlineUsers.set(userId, sockets);
    }
    sockets.add(socket.id);

    if (wasOffline) {
      try {
        await setPresence(userId, true);
        await markUndeliveredAsDelivered(userId);
      } catch (err) {
        incrementOperationalCounter("presenceErrors");
        logger.error({ err, userId }, "presence update failed");
      }
    }

    socket.on(
      "typing",
      async (data: { conversationId: number; isTyping: boolean }) => {
        incrementOperationalCounter("typingEvents");
        try {
          const conversationId = Number(data?.conversationId);
          if (!Number.isInteger(conversationId)) return;
          // Membership-aware lookup (supports groups too).
          const { getConversationForUser, getRecipientIds } = await import(
            "../routes/conversations"
          );
          const conv = await getConversationForUser(conversationId, userId);
          if (!conv) return;
          const recipients = (await getRecipientIds(conv)).filter(
            (u) => u !== userId,
          );
          for (const uid of recipients)
            emitToUser(uid, "typing", {
              conversationId,
              userId,
              isTyping: Boolean(data.isTyping),
            });
        } catch (err) {
          incrementOperationalCounter("socketErrors");
          logger.warn({ err, userId }, "typing event failed");
        }
      },
    );

    handleCallEvents(socket, userId);

    socket.on("error", (err) => {
      incrementOperationalCounter("socketErrors");
      logger.warn({ err, userId }, "socket error");
    });

    socket.on("disconnect", async () => {
      incrementOperationalCounter("socketDisconnects");
      const set = onlineUsers.get(userId);
      set?.delete(socket.id);
      if (set && set.size === 0) {
        onlineUsers.delete(userId);
        try {
          await setPresence(userId, false);
        } catch (err) {
          incrementOperationalCounter("presenceErrors");
          logger.error({ err, userId }, "presence update failed");
        }
        // End any active call this user is part of
        for (const call of Array.from(activeCalls.values())) {
          if (call.callerId === userId || call.calleeId === userId) {
            try {
              await endCall(call, call.answeredAt ? "answered" : "missed");
              const otherId =
                call.callerId === userId ? call.calleeId : call.callerId;
              emitToUser(otherId, "call:ended", { callId: call.callId });
            } catch (err) {
              incrementOperationalCounter("callSignalErrors");
              logger.error({ err, userId, callId: call.callId }, "disconnect call cleanup failed");
            }
          }
        }
      }
    });
  });

  logger.info("Socket.IO server attached at /api/socket.io");
}

export function getOnlineUserCount(): number {
  return onlineUsers.size;
}

export function getOnlineUserIds(): number[] {
  return Array.from(onlineUsers.keys());
}

export function getSocketOperationalState() {
  let activeSockets = 0;
  for (const sockets of onlineUsers.values()) activeSockets += sockets.size;
  return {
    activeSockets,
    activeUsers: onlineUsers.size,
    activeCalls: activeCalls.size,
  };
}
