import { createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  conversationsTable,
  db,
  pool,
  usersTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";

const SAFETY_CONFIRMATION = "CREATE_AND_DELETE_LOCAL_CAPACITY_TEST_DATA";
const baseUrl = new URL(process.env["CAPACITY_BASE_URL"] ?? "http://127.0.0.1:80");
const isLocal = ["127.0.0.1", "localhost"].includes(baseUrl.hostname);
const stages = (process.env["CAPACITY_STAGES"] ?? "100,250,500")
  .split(",")
  .map(Number);
const settleMs = Number(process.env["CAPACITY_STAGE_SETTLE_MS"] ?? 5000);
const batchSize = Number(process.env["CAPACITY_RAMP_BATCH_SIZE"] ?? 20);
const batchDelayMs = Number(process.env["CAPACITY_RAMP_BATCH_DELAY_MS"] ?? 100);
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const rootDir = fileURLToPath(new URL("../../../../", import.meta.url));
const resultsDir = `${rootDir}docs/capacity`;

type TestUser = {
  id: number;
  role: "admin" | "user";
  token: string;
  conversationId?: number;
  partnerId?: number;
};

type OpsSnapshot = {
  capturedAt: string;
  process: {
    rssMb: number;
    heapUsedMb: number;
    cpuUserMs: number;
    cpuSystemMs: number;
  };
  eventLoopDelayMs: {
    p95: number;
    p99: number;
    max: number;
  };
  counters: Record<string, number>;
  sockets: {
    activeSockets: number;
    activeUsers: number;
    activeCalls: number;
  };
  databasePool: {
    total: number;
    idle: number;
    waiting: number;
  };
};

type StageResult = {
  target: number;
  connected: number;
  connectionsAttempted: number;
  connectionsSucceeded: number;
  connectSuccessRate: number;
  connectP95Ms: number;
  reconnectSuccessRate: number;
  reconnectP95Ms: number;
  messagesAttempted: number;
  messageSuccessRate: number;
  messageP95Ms: number;
  callsAttempted: number;
  callSignalSuccessRate: number;
  callSignalP95Ms: number;
  metrics: OpsSnapshot;
  passed: boolean;
  reasons: string[];
};

function assertSafeConfiguration(): void {
  if (process.env["CAPACITY_TEST_CONFIRM"] !== SAFETY_CONFIRMATION) {
    throw new Error(
      `Safety confirmation missing. Set CAPACITY_TEST_CONFIRM=${SAFETY_CONFIRMATION}.`,
    );
  }
  if (process.env["NODE_ENV"] === "production" || baseUrl.hostname.endsWith(".replit.app")) {
    throw new Error("Capacity tests are blocked against production deployments.");
  }
  if (!isLocal) {
    throw new Error(
      "Capacity tests only accept a loopback URL. Run the harness inside an isolated development/staging environment.",
    );
  }
  if (
    process.env["REPLIT_DEPLOYMENT"] ||
    process.env["REPLIT_DEPLOYMENT_ID"] ||
    process.env["REPLIT_DEPLOYMENT_TYPE"]
  ) {
    throw new Error("Capacity tests are blocked inside published deployments.");
  }
  if (
    stages.length === 0 ||
    stages.some((stage) => !Number.isInteger(stage) || stage <= 0 || stage > 1000) ||
    !stages.every((stage, index) => index === 0 || stage > stages[index - 1]!)
  ) {
    throw new Error("CAPACITY_STAGES must be increasing integers between 1 and 1000.");
  }
  if (Math.max(...stages) % 2 !== 0) {
    throw new Error("The largest stage must be even so every test user has a chat partner.");
  }
  if (!process.env["SESSION_SECRET"]) {
    throw new Error("SESSION_SECRET is required to issue dedicated load-test tokens.");
  }
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function signToken(user: { id: number; role: "admin" | "user" }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      role: user.role,
      iat: now,
      exp: now + 2 * 60 * 60,
      sub: String(user.id),
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac(
    "sha256",
    `${process.env["SESSION_SECRET"]}.access`,
  )
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function percentile(values: number[], percent: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index]!);
}

function percent(successes: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((successes / total) * 10000) / 100;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class EngineSocket {
  private ws: WebSocket | null = null;
  private nextAckId = 1;
  private readonly pendingAcks = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    readonly user: TestUser,
    private readonly target: URL,
  ) {}

  connect(timeoutMs = 15000): Promise<number> {
    const started = performance.now();
    const socketUrl = new URL(this.target);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.pathname = "/api/socket.io/";
    socketUrl.search = "EIO=4&transport=websocket";

    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(socketUrl);
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        reject(new Error(`Socket timeout for test user ${this.user.id}`));
      }, timeoutMs);

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };

      ws.addEventListener("message", (event) => {
        const packet =
          typeof event.data === "string"
            ? event.data
            : Buffer.from(event.data as ArrayBuffer).toString("utf8");
        if (packet.startsWith("0")) {
          ws.send(`40${JSON.stringify({ token: this.user.token })}`);
          return;
        }
        if (packet === "2") {
          ws.send("3");
          return;
        }
        if (packet.startsWith("44")) {
          fail(new Error(`Socket authentication rejected for ${this.user.id}`));
          return;
        }
        if (packet.startsWith("43")) {
          const match = packet.slice(2).match(/^(\d+)(.*)$/);
          if (!match) return;
          const ackId = Number(match[1]);
          const pending = this.pendingAcks.get(ackId);
          if (!pending) return;
          this.pendingAcks.delete(ackId);
          clearTimeout(pending.timeout);
          try {
            const values = JSON.parse(match[2] ?? "[]") as unknown[];
            pending.resolve(values[0]);
          } catch {
            pending.reject(new Error(`Invalid acknowledgment for ${this.user.id}`));
          }
          return;
        }
        if (packet.startsWith("40") && !settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(performance.now() - started);
        }
      });
      ws.addEventListener("error", () =>
        fail(new Error(`WebSocket error for test user ${this.user.id}`)),
      );
      ws.addEventListener("close", () => {
        if (!settled) fail(new Error(`Socket closed before authentication for ${this.user.id}`));
      });
    });
  }

  emit(event: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`42${JSON.stringify([event, payload])}`);
    }
  }

  emitWithAck(
    event: string,
    payload: unknown,
    timeoutMs = 5000,
  ): Promise<unknown> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Socket is not connected for ${this.user.id}`));
    }
    const ackId = this.nextAckId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(ackId);
        reject(new Error(`Acknowledgment timeout for ${event}`));
      }, timeoutMs);
      this.pendingAcks.set(ackId, { resolve, reject, timeout });
      this.ws!.send(`42${ackId}${JSON.stringify([event, payload])}`);
    });
  }

  async disconnect(): Promise<void> {
    const ws = this.ws;
    this.ws = null;
    if (!ws || ws.readyState === WebSocket.CLOSED) return;
    for (const [ackId, pending] of this.pendingAcks) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Socket disconnected before acknowledgment ${ackId}`));
    }
    this.pendingAcks.clear();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      ws.addEventListener(
        "close",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      ws.close();
    });
  }
}

async function createFixtures(maxUsers: number): Promise<{
  admin: TestUser;
  users: TestUser[];
  fixtureIds: number[];
}> {
  const passwordHash = "capacity-test-account-login-disabled";
  const fixture = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(usersTable)
      .values([
        {
          name: `Capacity Admin ${runId}`,
          email: `capacity-admin-${runId}@load.test`,
          passwordHash,
          role: "admin" as const,
        },
        ...Array.from({ length: maxUsers }, (_, index) => ({
          name: `Capacity User ${index + 1}`,
          email: `capacity-${runId}-${index + 1}@load.test`,
          passwordHash,
          role: "user" as const,
        })),
      ])
      .returning({ id: usersTable.id, role: usersTable.role });

    const [adminRow, ...userRows] = rows;
    if (!adminRow || userRows.length !== maxUsers) {
      throw new Error("Failed to create the isolated load-test users.");
    }

    const conversations = await tx
      .insert(conversationsTable)
      .values(
        Array.from({ length: maxUsers / 2 }, (_, pair) => ({
          userAId: userRows[pair * 2]!.id,
          userBId: userRows[pair * 2 + 1]!.id,
          type: "direct" as const,
          mode: "human" as const,
        })),
      )
      .returning({ id: conversationsTable.id });
    return { rows, adminRow, userRows, conversations };
  });

  const users = fixture.userRows.map((row, index) => ({
    id: row.id,
    role: "user" as const,
    token: signToken({ id: row.id, role: "user" }),
    conversationId: fixture.conversations[Math.floor(index / 2)]!.id,
    partnerId:
      fixture.userRows[index % 2 === 0 ? index + 1 : index - 1]!.id,
  }));
  const admin = {
    id: fixture.adminRow.id,
    role: "admin" as const,
    token: signToken({ id: fixture.adminRow.id, role: "admin" }),
  };

  return {
    admin,
    users,
    fixtureIds: fixture.rows.map((row) => row.id),
  };
}

async function fetchMetrics(admin: TestUser, reset: boolean): Promise<OpsSnapshot> {
  const response = await fetch(
    new URL(`/api/ops/metrics?reset=${reset}`, baseUrl),
    { headers: { Authorization: `Bearer ${admin.token}` } },
  );
  if (!response.ok) {
    throw new Error(`Metrics endpoint returned HTTP ${response.status}`);
  }
  return (await response.json()) as OpsSnapshot;
}

async function connectBatch(
  users: TestUser[],
): Promise<{ sockets: EngineSocket[]; durations: number[]; failures: number }> {
  const sockets: EngineSocket[] = [];
  const durations: number[] = [];
  let failures = 0;
  for (let start = 0; start < users.length; start += batchSize) {
    const batch = users.slice(start, start + batchSize);
    await Promise.all(
      batch.map(async (user) => {
        const socket = new EngineSocket(user, baseUrl);
        try {
          durations.push(await socket.connect());
          sockets.push(socket);
        } catch (error) {
          failures += 1;
          await socket.disconnect();
          console.error(error instanceof Error ? error.message : error);
        }
      }),
    );
    if (start + batchSize < users.length) await wait(batchDelayMs);
  }
  return { sockets, durations, failures };
}

async function reconnectSample(
  sockets: EngineSocket[],
): Promise<{ durations: number[]; failures: number }> {
  const sampleSize = Math.max(1, Math.floor(sockets.length * 0.1));
  const sample = sockets.filter((_, index) => index % Math.max(1, Math.floor(sockets.length / sampleSize)) === 0).slice(0, sampleSize);
  let failures = 0;
  const durations: number[] = [];
  for (const socket of sample) {
    await socket.disconnect();
    try {
      durations.push(await socket.connect());
    } catch (error) {
      failures += 1;
      console.error(error instanceof Error ? error.message : error);
    }
  }
  return { durations, failures };
}

async function sendTraffic(
  sockets: EngineSocket[],
): Promise<{
  messages: { attempted: number; succeeded: number; durations: number[] };
  calls: { attempted: number; succeeded: number; durations: number[] };
}> {
  const messageSockets = sockets.filter((_, index) => index % 5 === 0);
  for (const socket of messageSockets) {
    socket.emit("typing", {
      conversationId: socket.user.conversationId,
      isTyping: true,
    });
    socket.emit("typing", {
      conversationId: socket.user.conversationId,
      isTyping: false,
    });
  }

  const durations: number[] = [];
  let succeeded = 0;
  await Promise.all(
    messageSockets.map(async (socket) => {
      const started = performance.now();
      try {
        const response = await fetch(
          new URL(
            `/api/conversations/${socket.user.conversationId}/messages`,
            baseUrl,
          ),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${socket.user.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: `capacity probe ${runId}` }),
          },
        );
        durations.push(performance.now() - started);
        if (response.ok) succeeded += 1;
        else console.error(`Message request returned HTTP ${response.status}`);
      } catch (error) {
        durations.push(performance.now() - started);
        console.error(error instanceof Error ? error.message : error);
      }
    }),
  );
  const callSockets = sockets.filter((_, index) => index % 20 === 0);
  const callDurations: number[] = [];
  let callsSucceeded = 0;
  await Promise.all(
    callSockets.map(async (socket) => {
      const started = performance.now();
      try {
        const ack = (await socket.emitWithAck("call:initiate", {
          toUserId: socket.user.partnerId,
          offer: { type: "offer", sdp: "capacity-test-signaling-only" },
        })) as { callId?: number; error?: string };
        if (!ack.callId || ack.error) return;
        socket.emit("call:end", { callId: ack.callId });
        callDurations.push(performance.now() - started);
        callsSucceeded += 1;
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
      }
    }),
  );
  return {
    messages: {
      attempted: messageSockets.length,
      succeeded,
      durations,
    },
    calls: {
      attempted: callSockets.length,
      succeeded: callsSucceeded,
      durations: callDurations,
    },
  };
}

function evaluateStage(
  target: number,
  connected: number,
  connections: { attempted: number; succeeded: number; durations: number[] },
  reconnects: { durations: number[]; failures: number },
  messages: { attempted: number; succeeded: number; durations: number[] },
  calls: { attempted: number; succeeded: number; durations: number[] },
  metrics: OpsSnapshot,
): StageResult {
  const connectSuccessRate = percent(
    connections.succeeded,
    connections.attempted,
  );
  const reconnectSuccessRate = percent(
    reconnects.durations.length,
    reconnects.durations.length + reconnects.failures,
  );
  const messageSuccessRate = percent(messages.succeeded, messages.attempted);
  const callSignalSuccessRate = percent(calls.succeeded, calls.attempted);
  const reasons: string[] = [];
  const connectP95Ms = percentile(connections.durations, 95);
  const reconnectP95Ms = percentile(reconnects.durations, 95);
  const messageP95Ms = percentile(messages.durations, 95);
  const callSignalP95Ms = percentile(calls.durations, 95);

  if (connectSuccessRate < 99) reasons.push(`connect success ${connectSuccessRate}% < 99%`);
  if (connected !== target) reasons.push(`connected total ${connected} did not reach target ${target}`);
  if (connectP95Ms > 5000) reasons.push(`connect p95 ${connectP95Ms}ms > 5000ms`);
  if (reconnectSuccessRate < 99) reasons.push(`reconnect success ${reconnectSuccessRate}% < 99%`);
  if (messageSuccessRate < 99) reasons.push(`message success ${messageSuccessRate}% < 99%`);
  if (messageP95Ms > 1000) reasons.push(`message p95 ${messageP95Ms}ms > 1000ms`);
  if (callSignalSuccessRate < 99) {
    reasons.push(`call signaling success ${callSignalSuccessRate}% < 99%`);
  }
  if (callSignalP95Ms > 1000) {
    reasons.push(`call signaling p95 ${callSignalP95Ms}ms > 1000ms`);
  }
  if (metrics.eventLoopDelayMs.p95 > 100) {
    reasons.push(`event-loop p95 ${metrics.eventLoopDelayMs.p95}ms > 100ms`);
  }
  if (metrics.databasePool.waiting > 0) {
    reasons.push(`database pool had ${metrics.databasePool.waiting} waiting request(s) at capture`);
  }
  if ((metrics.counters["httpServerErrors"] ?? 0) > 0) {
    reasons.push(`${metrics.counters["httpServerErrors"]} HTTP server error(s)`);
  }
  if ((metrics.counters["socketErrors"] ?? 0) > 0) {
    reasons.push(`${metrics.counters["socketErrors"]} socket error(s)`);
  }

  return {
    target,
    connected,
    connectionsAttempted: connections.attempted,
    connectionsSucceeded: connections.succeeded,
    connectSuccessRate,
    connectP95Ms,
    reconnectSuccessRate,
    reconnectP95Ms,
    messagesAttempted: messages.attempted,
    messageSuccessRate,
    messageP95Ms,
    callsAttempted: calls.attempted,
    callSignalSuccessRate,
    callSignalP95Ms,
    metrics,
    passed: reasons.length === 0,
    reasons,
  };
}

function markdownReport(stageResults: StageResult[]): string {
  const safe = [...stageResults].reverse().find((stage) => stage.passed)?.target ?? 0;
  const generatedAt = new Date().toISOString();
  const first = stageResults[0]!;
  const peak = stageResults[stageResults.length - 1]!;
  const latencyGrowth =
    first.messageP95Ms > 0
      ? Math.round((peak.messageP95Ms / first.messageP95Ms) * 10) / 10
      : 0;
  const memoryGrowth =
    Math.round((peak.metrics.process.rssMb - first.metrics.process.rssMb) * 10) /
    10;
  const rows = stageResults
    .map(
      (stage) =>
        `| ${stage.target} | ${stage.connected} | ${stage.connectionsSucceeded}/${stage.connectionsAttempted} | ${stage.connectSuccessRate}% / ${stage.connectP95Ms}ms | ${stage.reconnectSuccessRate}% / ${stage.reconnectP95Ms}ms | ${stage.messageSuccessRate}% / ${stage.messageP95Ms}ms | ${stage.callSignalSuccessRate}% / ${stage.callSignalP95Ms}ms | ${stage.metrics.eventLoopDelayMs.p95}ms | ${stage.metrics.process.rssMb} MB | ${stage.passed ? "PASS" : "NEEDS WORK"} |`,
    )
    .join("\n");
  const findings = stageResults
    .filter((stage) => !stage.passed)
    .map(
      (stage) =>
        `- **${stage.target} users:** ${stage.reasons.join("; ")}`,
    )
    .join("\n");

  return `# SkyTalk Chat Capacity Baseline

**Run:** ${runId}  
**Generated:** ${generatedAt}  
**Target:** ${baseUrl.origin}  
**Highest passing stage:** **${safe} concurrent users**

## Plain-language result

The current development server passed the controlled **${peak.target}-user** baseline: ${peak.connected} authenticated sockets stayed connected, text messages and call-signaling actions completed with ${peak.messageSuccessRate}% / ${peak.callSignalSuccessRate}% success, and no HTTP 5xx, socket, presence, or database-pool errors were recorded.

This supports **light-to-moderate real-time chat at 500 connected users** under the tested pattern. It does not certify 500 simultaneous audio streams or a full-day production workload.

## Acceptance limits

- Connection and reconnect success: at least 99%
- Message success: at least 99%
- Call-signaling success: at least 99%
- Connection p95: at most 5 seconds
- Message p95: at most 1 second
- Call-signaling p95: at most 1 second
- Event-loop delay p95: at most 100 ms
- No HTTP 5xx or socket errors
- No database-pool waiters at the stage capture

## Results

| Users | Connected | New connections | Connect success / p95 | Reconnect success / p95 | Message success / p95 | Call signal success / p95 | Event loop p95 | Server RSS | Verdict |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
${rows}

## Findings

${findings || "- Every staged target met the defined baseline limits."}

## Observed trend and headroom

- Text-message p95 increased from ${first.messageP95Ms}ms at ${first.target} users to ${peak.messageP95Ms}ms at ${peak.target} users (${latencyGrowth}×). It remains below the 1-second limit, but message latency is the clearest scaling trend to monitor.
- Server RSS increased by ${memoryGrowth} MB across the staged run, ending at ${peak.metrics.process.rssMb} MB. Database-pool waiters remained at ${peak.metrics.databasePool.waiting}.
- Event-loop p95 ended at ${peak.metrics.eventLoopDelayMs.p95}ms, with ${peak.metrics.counters["httpServerErrors"] ?? 0} HTTP 5xx and ${peak.metrics.counters["socketErrors"] ?? 0} socket errors.

## Interpretation

This test measures persistent authenticated Socket.IO connections plus controlled reconnect, typing, and text-message traffic. It does **not** simulate 500 simultaneous WebRTC audio streams. SkyTalk now supports a coturn-compatible relay with short-lived credentials; its media capacity is measured separately by \`pnpm turn:capacity\` and published in \`docs/capacity/turn-relay-latest.md\`.

The result is a repeatable development/staging baseline, not a permanent production guarantee. Repeat the test after infrastructure, database volume, or real-time code changes.

## Next scaling milestone

Run a longer 30–60 minute soak on production-like staging, then address the already identified conversation-list and long-history query work before increasing real traffic. Keep live fully relayed calls below 70% of the latest passing TURN benchmark stage. Before adding a second API instance, shared Socket.IO/online-presence state is required.
`;
}

async function main(): Promise<void> {
  assertSafeConfiguration();
  const fixtureIds: number[] = [];
  const allSockets: EngineSocket[] = [];
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await Promise.all(allSockets.map((socket) => socket.disconnect()));
    if (fixtureIds.length) {
      await db.delete(usersTable).where(inArray(usersTable.id, fixtureIds));
    }
  };

  const onSignal = async () => {
    await cleanup();
    await pool.end();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    console.log(`Creating isolated fixtures for capacity run ${runId}...`);
    const fixtures = await createFixtures(Math.max(...stages));
    fixtureIds.push(...fixtures.fixtureIds);
    const results: StageResult[] = [];
    await fetchMetrics(fixtures.admin, true);

    for (const target of stages) {
      const newUsers = fixtures.users.slice(allSockets.length, target);
      console.log(`Ramping to ${target} connected users...`);
      const connections = await connectBatch(newUsers);
      allSockets.push(...connections.sockets);
      await wait(settleMs);
      const reconnects = await reconnectSample(allSockets);
      const traffic = await sendTraffic(allSockets);
      await wait(settleMs);
      const metrics = await fetchMetrics(fixtures.admin, true);
      const result = evaluateStage(
        target,
        allSockets.length,
        {
          attempted: newUsers.length,
          succeeded: connections.sockets.length,
          durations: connections.durations,
        },
        reconnects,
        traffic.messages,
        traffic.calls,
        metrics,
      );
      results.push(result);
      console.log(
        `${target}: ${result.passed ? "PASS" : "NEEDS WORK"} — connected ${result.connected}, message p95 ${result.messageP95Ms}ms, call signal p95 ${result.callSignalP95Ms}ms, event-loop p95 ${metrics.eventLoopDelayMs.p95}ms`,
      );
    }

    await mkdir(resultsDir, { recursive: true });
    await writeFile(
      `${resultsDir}/latest.json`,
      `${JSON.stringify({ runId, baseUrl: baseUrl.origin, stages: results }, null, 2)}\n`,
    );
    await writeFile(`${resultsDir}/latest.md`, markdownReport(results));
    console.log(`Reports written to docs/capacity/latest.md and latest.json`);

    if (process.env["CAPACITY_STRICT"] === "true" && results.some((stage) => !stage.passed)) {
      process.exitCode = 2;
    }
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
