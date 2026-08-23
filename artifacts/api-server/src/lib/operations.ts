import { monitorEventLoopDelay } from "node:perf_hooks";

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

const counterNames = [
  "httpRequests",
  "httpServerErrors",
  "messageSendAttempts",
  "messageSendRejected",
  "messageSendErrors",
  "socketConnectionsAccepted",
  "socketConnectionsRejected",
  "socketDisconnects",
  "socketErrors",
  "typingEvents",
  "callSignalAttempts",
  "callSignalRejected",
  "callSignalErrors",
  "turnCredentialRequests",
  "turnCredentialFailures",
  "callIceRestarts",
  "callQualityReports",
  "callRelayQualityReports",
  "callQualityDegraded",
  "presenceErrors",
] as const;

export type OperationalCounterName = (typeof counterNames)[number];
export type OperationalCounters = Record<OperationalCounterName, number>;

function emptyCounters(): OperationalCounters {
  return Object.fromEntries(counterNames.map((name) => [name, 0])) as OperationalCounters;
}

let counters = emptyCounters();
let cpuBaseline = process.cpuUsage();

export function incrementOperationalCounter(
  name: OperationalCounterName,
  amount = 1,
): void {
  counters[name] += amount;
}

function milliseconds(nanoseconds: number): number {
  if (!Number.isFinite(nanoseconds)) return 0;
  return Math.round((nanoseconds / 1e6) * 100) / 100;
}

export function getOperationalSnapshot(reset = false) {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage(cpuBaseline);
  const snapshot = {
    capturedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    process: {
      rssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
      heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10,
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
    },
    eventLoopDelayMs: {
      mean: milliseconds(eventLoop.mean),
      p50: milliseconds(eventLoop.percentile(50)),
      p95: milliseconds(eventLoop.percentile(95)),
      p99: milliseconds(eventLoop.percentile(99)),
      max: milliseconds(eventLoop.max),
    },
    counters: { ...counters },
  };

  if (reset) {
    counters = emptyCounters();
    cpuBaseline = process.cpuUsage();
    eventLoop.reset();
  }

  return snapshot;
}
