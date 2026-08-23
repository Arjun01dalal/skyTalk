import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import dgram, { type Socket } from "node:dgram";
import { fileURLToPath } from "node:url";

const MAGIC_COOKIE = 0x2112a442;
const ATTR = {
  username: 0x0006,
  messageIntegrity: 0x0008,
  errorCode: 0x0009,
  lifetime: 0x000d,
  xorPeerAddress: 0x0012,
  data: 0x0013,
  realm: 0x0014,
  nonce: 0x0015,
  xorRelayedAddress: 0x0016,
  requestedTransport: 0x0019,
} as const;
const TYPE = {
  allocate: 0x0003,
  createPermission: 0x0008,
  sendIndication: 0x0016,
  dataIndication: 0x0017,
} as const;
const PAYLOAD_MAGIC = 0x5354594b; // "STYK"
const AUDIO_PACKET_INTERVAL_MS = 20;
const AUDIO_PAYLOAD_BYTES = 160;
const CONFIRMATION = "RUN_REAL_TURN_RELAY_BENCHMARK";
const host = process.env["TURN_BENCHMARK_HOST"] ?? "";
const port = Number(process.env["TURN_BENCHMARK_PORT"] ?? 3478);
const sessions = Number(process.env["TURN_BENCHMARK_SESSIONS"] ?? 10);
const messagesPerSession = Number(process.env["TURN_BENCHMARK_MESSAGES"] ?? 1500);
const rootDir = fileURLToPath(new URL("../../../../", import.meta.url));
const reportDir = `${rootDir}docs/capacity`;

type Attribute = { type: number; value: Buffer };
type RelayAddress = { address: string; port: number };
type StunMessage = { type: number; transactionId: Buffer; attributes: Attribute[] };

function paddedLength(length: number): number {
  return (length + 3) & ~3;
}

function encodeAttributes(attributes: Attribute[]): Buffer {
  return Buffer.concat(attributes.map(({ type, value }) => {
    const padded = Buffer.alloc(paddedLength(value.length));
    value.copy(padded);
    const header = Buffer.alloc(4);
    header.writeUInt16BE(type, 0);
    header.writeUInt16BE(value.length, 2);
    return Buffer.concat([header, padded]);
  }));
}

function encodeMessage(
  type: number,
  transactionId: Buffer,
  attributes: Attribute[],
  username?: string,
  password?: string | Buffer,
): Buffer {
  const unsigned = encodeAttributes(attributes);
  const integrityHeader = username && password ? Buffer.from([0, ATTR.messageIntegrity, 0, 20]) : Buffer.alloc(0);
  const length = unsigned.length + integrityHeader.length + (password ? 20 : 0);
  const header = Buffer.alloc(20);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(length, 2);
  header.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(header, 8);
  if (!username || !password) return Buffer.concat([header, unsigned]);

  const integrity = createHmac("sha1", password)
    .update(Buffer.concat([header, unsigned]))
    .digest();
  return Buffer.concat([header, unsigned, integrityHeader, integrity]);
}

function decodeMessage(packet: Buffer): StunMessage | null {
  if (packet.length < 20 || packet.readUInt32BE(4) !== MAGIC_COOKIE) return null;
  const length = packet.readUInt16BE(2);
  if (packet.length < 20 + length) return null;
  const attributes: Attribute[] = [];
  let offset = 20;
  const end = 20 + length;
  while (offset + 4 <= end) {
    const type = packet.readUInt16BE(offset);
    const size = packet.readUInt16BE(offset + 2);
    const valueStart = offset + 4;
    const valueEnd = valueStart + size;
    if (valueEnd > end) return null;
    attributes.push({ type, value: packet.subarray(valueStart, valueEnd) });
    offset = valueStart + paddedLength(size);
  }
  return { type: packet.readUInt16BE(0), transactionId: packet.subarray(8, 20), attributes };
}

function attribute(message: StunMessage, type: number): Buffer | undefined {
  return message.attributes.find((candidate) => candidate.type === type)?.value;
}

function stringAttribute(type: number, value: string): Attribute {
  return { type, value: Buffer.from(value, "utf8") };
}

function xorAddress(type: number, address: RelayAddress, transactionId: Buffer): Attribute {
  const octets = address.address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    throw new Error(`TURN benchmark currently supports IPv4 relay addresses only, received ${address.address}.`);
  }
  const value = Buffer.alloc(8);
  value.writeUInt8(0, 0);
  value.writeUInt8(1, 1);
  value.writeUInt16BE(address.port ^ (MAGIC_COOKIE >>> 16), 2);
  const cookie = Buffer.alloc(4);
  cookie.writeUInt32BE(MAGIC_COOKIE);
  for (let index = 0; index < 4; index += 1) value[4 + index] = octets[index]! ^ cookie[index]!;
  return { type, value };
}

function decodeXorAddress(value: Buffer): RelayAddress {
  if (value.length < 8 || value.readUInt8(1) !== 1) throw new Error("TURN relay did not return an IPv4 address.");
  const cookie = Buffer.alloc(4);
  cookie.writeUInt32BE(MAGIC_COOKIE);
  const address = Array.from({ length: 4 }, (_, index) => value[4 + index]! ^ cookie[index]!).join(".");
  return { address, port: value.readUInt16BE(2) ^ (MAGIC_COOKIE >>> 16) };
}

function errorText(message: StunMessage): string {
  const value = attribute(message, ATTR.errorCode);
  if (!value || value.length < 4) return "unknown TURN error";
  return `${value[2]}${value[3]} ${value.subarray(4).toString("utf8")}`;
}

class TurnClient {
  readonly socket: Socket = dgram.createSocket("udp4");
  readonly pending = new Map<string, { resolve: (message: StunMessage) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  readonly receivedSequences = new Set<number>();
  duplicatePackets = 0;
  invalidPackets = 0;
  relayAddress: RelayAddress | null = null;
  realm = "";
  nonce = "";
  username = "";
  password = "";
  integrityKey = Buffer.alloc(0);
  isOpen = false;

  constructor(
    private readonly sessionId: number,
    private readonly expectedDirection: number,
    private readonly expectedMessages: number,
  ) {
    this.socket.on("message", (packet) => {
      const message = decodeMessage(packet);
      if (!message) return;
      const key = message.transactionId.toString("hex");
      const pending = this.pending.get(key);
      if (pending) {
        this.pending.delete(key);
        clearTimeout(pending.timeout);
        pending.resolve(message);
        return;
      }
      if (message.type !== TYPE.dataIndication) return;
      const data = attribute(message, ATTR.data);
      if (!data || data.length < 11) {
        this.invalidPackets += 1;
        return;
      }
      if (
        data.readUInt32BE(0) !== PAYLOAD_MAGIC ||
        data.readUInt16BE(4) !== this.sessionId ||
        data.readUInt8(6) !== this.expectedDirection
      ) {
        this.invalidPackets += 1;
        return;
      }
      const sequence = data.readUInt32BE(7);
      // Reject out-of-range sequences so an unexpected packet cannot mask a
      // missing expected one in the aggregate delivery calculation.
      if (sequence >= this.expectedMessages) {
        this.invalidPackets += 1;
        return;
      }
      if (this.receivedSequences.has(sequence)) {
        this.duplicatePackets += 1;
        return;
      }
      this.receivedSequences.add(sequence);
    });
  }

  /** Number of expected sequences [0, expectedMessages) that were never received. */
  get missingPackets(): number {
    return this.expectedMessages - this.receivedSequences.size;
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.bind(0, () => {
        this.socket.off("error", reject);
        this.isOpen = true;
        resolve();
      });
    });
  }

  request(type: number, attributes: Attribute[], authenticated = true): Promise<StunMessage> {
    const transactionId = randomBytes(12);
    const packet = encodeMessage(type, transactionId, attributes, authenticated ? this.username : undefined, authenticated ? this.integrityKey : undefined);
    const key = transactionId.toString("hex");
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`TURN request ${type.toString(16)} timed out`));
      }, 8_000);
      this.pending.set(key, { resolve, reject, timeout });
      this.socket.send(packet, port, host, (error) => {
        if (!error) return;
        this.pending.delete(key);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async allocate(sharedSecret: string, userMarker: string): Promise<void> {
    const requestedTransport = Buffer.alloc(4);
    requestedTransport.writeUInt8(17, 0);
    const baseAttributes = [{ type: ATTR.requestedTransport, value: requestedTransport }];
    const challenge = await this.request(TYPE.allocate, baseAttributes, false);
    const realm = attribute(challenge, ATTR.realm)?.toString("utf8");
    const nonce = attribute(challenge, ATTR.nonce)?.toString("utf8");
    if (!realm || !nonce) throw new Error(`TURN allocation challenge failed: ${errorText(challenge)}`);
    this.realm = realm;
    this.nonce = nonce;
    const expiration = Math.floor(Date.now() / 1000) + 20 * 60;
    this.username = `${expiration}:capacity:${userMarker}`;
    this.password = createHmac("sha1", sharedSecret).update(this.username).digest("base64");
    this.integrityKey = createHash("md5")
      .update(`${this.username}:${this.realm}:${this.password}`)
      .digest();
    const response = await this.request(TYPE.allocate, [
      ...baseAttributes,
      stringAttribute(ATTR.username, this.username),
      stringAttribute(ATTR.realm, this.realm),
      stringAttribute(ATTR.nonce, this.nonce),
    ]);
    const relay = attribute(response, ATTR.xorRelayedAddress);
    if (!relay) throw new Error(`TURN allocation failed: ${errorText(response)}`);
    this.relayAddress = decodeXorAddress(relay);
  }

  async allow(peer: RelayAddress): Promise<void> {
    const response = await this.request(TYPE.createPermission, [
      stringAttribute(ATTR.username, this.username),
      stringAttribute(ATTR.realm, this.realm),
      stringAttribute(ATTR.nonce, this.nonce),
      xorAddress(ATTR.xorPeerAddress, peer, randomBytes(12)),
    ]);
    if (response.type !== 0x0108) throw new Error(`TURN permission failed: ${errorText(response)}`);
  }

  async send(peer: RelayAddress, payload: Buffer): Promise<void> {
    const transactionId = randomBytes(12);
    const packet = encodeMessage(TYPE.sendIndication, transactionId, [
      stringAttribute(ATTR.username, this.username),
      stringAttribute(ATTR.realm, this.realm),
      stringAttribute(ATTR.nonce, this.nonce),
      xorAddress(ATTR.xorPeerAddress, peer, transactionId),
      { type: ATTR.data, value: payload },
    ], this.username, this.integrityKey);
    await new Promise<void>((resolve, reject) => this.socket.send(packet, port, host, (error) => error ? reject(error) : resolve()));
  }

  close(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("TURN client closed"));
    }
    this.pending.clear();
    if (this.isOpen) {
      this.isOpen = false;
      this.socket.close();
    }
  }
}

function assertConfiguration(): string {
  if (process.env["TURN_BENCHMARK_CONFIRM"] !== CONFIRMATION) {
    throw new Error(`Safety confirmation missing. Set TURN_BENCHMARK_CONFIRM=${CONFIRMATION}.`);
  }
  const sharedSecret = process.env["TURN_SHARED_SECRET"];
  if (!sharedSecret || !host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("TURN_SHARED_SECRET, TURN_BENCHMARK_HOST, and a valid TURN_BENCHMARK_PORT are required.");
  }
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 500 || !Number.isInteger(messagesPerSession) || messagesPerSession < 1) {
    throw new Error("TURN_BENCHMARK_SESSIONS must be 1–500 and TURN_BENCHMARK_MESSAGES must be a positive integer.");
  }
  return sharedSecret;
}

async function main(): Promise<void> {
  const sharedSecret = assertConfiguration();
  const started = performance.now();
  const allClients: TurnClient[] = [];
  const setupDurations: number[] = [];
  try {
    const settledPairs = await Promise.allSettled(
      Array.from({ length: sessions }, async (_, index) => {
        const setupStarted = performance.now();
        const sender = new TurnClient(index, 1, messagesPerSession);
        const receiver = new TurnClient(index, 0, messagesPerSession);
        allClients.push(sender, receiver);
        await Promise.all([sender.open(), receiver.open()]);
        await Promise.all([
          sender.allocate(sharedSecret, `${index}-a`),
          receiver.allocate(sharedSecret, `${index}-b`),
        ]);
        await Promise.all([
          sender.allow(receiver.relayAddress!),
          receiver.allow(sender.relayAddress!),
        ]);
        setupDurations.push(performance.now() - setupStarted);
        return { sessionId: index, sender, receiver };
      }),
    );
    const pairs = settledPairs.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const setupFailures = settledPairs.flatMap((result) =>
      result.status === "rejected"
        ? [
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          ]
        : [],
    );
    const setupRate = Math.round((pairs.length / sessions) * 10_000) / 100;
    const sortedSetupDurations = [...setupDurations].sort((a, b) => a - b);
    const setupP95Ms = sortedSetupDurations.length
      ? Math.round(
          sortedSetupDurations[
            Math.ceil(sortedSetupDurations.length * 0.95) - 1
          ]!,
        )
      : 0;

    let sent = 0;
    const payload = (sessionId: number, direction: number, sequence: number) => {
      const packet = Buffer.alloc(AUDIO_PAYLOAD_BYTES, 0x55);
      packet.writeUInt32BE(PAYLOAD_MAGIC, 0);
      packet.writeUInt16BE(sessionId, 4);
      packet.writeUInt8(direction, 6);
      packet.writeUInt32BE(sequence, 7);
      return packet;
    };
    let cadenceMisses = 0;
    const sendStartedAt = performance.now();
    for (let index = 0; index < messagesPerSession; index += 1) {
      await Promise.all(
        pairs.flatMap(({ sessionId, sender, receiver }) => [
          sender.send(receiver.relayAddress!, payload(sessionId, 0, index)),
          receiver.send(sender.relayAddress!, payload(sessionId, 1, index)),
        ]),
      );
      sent += pairs.length * 2;
      const nextScheduledAt =
        sendStartedAt + (index + 1) * AUDIO_PACKET_INTERVAL_MS;
      const waitMs = nextScheduledAt - performance.now();
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else {
        cadenceMisses += 1;
      }
    }
    const sendCompletedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const received = pairs.reduce(
      (total, pair) =>
      total +
      pair.sender.receivedSequences.size +
      pair.receiver.receivedSequences.size,
      0,
    );
    // missingPackets is computed from per-direction expected sequences so that
    // an unexpected packet cannot mask a missing expected one in the aggregate.
    const missingPackets = pairs.reduce(
      (total, pair) =>
        total + pair.sender.missingPackets + pair.receiver.missingPackets,
      0,
    );
    const duplicatePackets = pairs.reduce(
      (total, pair) =>
        total + pair.sender.duplicatePackets + pair.receiver.duplicatePackets,
      0,
    );
    const invalidPackets = pairs.reduce(
      (total, pair) =>
        total + pair.sender.invalidPackets + pair.receiver.invalidPackets,
      0,
    );
    const durationSeconds = (performance.now() - started) / 1000;
    const audioDurationSeconds = (sendCompletedAt - sendStartedAt) / 1000;
    // Delivery rate is based on expected sequences, not sent count, so that
    // missing packets in one direction show up even when aggregate sent == received.
    const expectedTotal = pairs.length * 2 * messagesPerSession;
    const deliveryRate =
      expectedTotal > 0 ? Math.round((received / expectedTotal) * 10_000) / 100 : 0;
    const report = {
      generatedAt: new Date().toISOString(),
      target: `${host}:${port}/udp`,
      sessions,
      sessionsEstablished: pairs.length,
      setupRate,
      setupP95Ms,
      setupFailures: setupFailures.slice(0, 5),
      allocations: sessions * 2,
      payloadBytes: AUDIO_PAYLOAD_BYTES,
      messagesPerSession,
      packetsSent: sent,
      packetsReceived: received,
      missingPackets,
      duplicatePackets,
      invalidPackets,
      cadenceMisses,
      deliveryRate,
      elapsedSeconds: Math.round(durationSeconds * 100) / 100,
      achievedPacketsPerSecondPerDirection:
        pairs.length > 0
          ? Math.round(
              (sent / pairs.length / 2 / audioDurationSeconds) * 100,
            ) / 100
          : 0,
      relayPayloadKbps:
        Math.round(
          ((received * AUDIO_PAYLOAD_BYTES * 8) / 1000 / durationSeconds) * 100,
        ) / 100,
      assumedPayloadKbpsPerCall: 128,
      assumedNetworkKbpsPerCall: 160,
      passed:
        setupRate >= 99 &&
        setupP95Ms <= 5_000 &&
        deliveryRate >= 99 &&
        missingPackets === 0 &&
        duplicatePackets === 0 &&
        invalidPackets === 0 &&
        cadenceMisses === 0 &&
        (pairs.length === 0 ||
          sent / pairs.length / 2 / audioDurationSeconds >= 48),
      acceptance:
        "At least 99% of relay sessions must establish within a 5-second p95, and at least 99% of bidirectional audio-shaped packets must arrive.",
    };
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      `${reportDir}/turn-relay-latest.json`,
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await writeFile(
      `${reportDir}/turn-relay-latest.md`,
      `# SkyTalk TURN Relay Capacity\n\n**Generated:** ${report.generatedAt}  \n**Target:** ${report.target}  \n**Result:** **${report.passed ? "PASS" : "NEEDS WORK"}**\n\n| Target sessions | Established | Setup success / p95 | Allocations | Payload | Sent | Received | Missing | Delivery | Packet rate / direction | Relay payload throughput |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n| ${report.sessions} | ${report.sessionsEstablished} | ${report.setupRate}% / ${report.setupP95Ms}ms | ${report.allocations} | ${report.payloadBytes} bytes | ${report.packetsSent} | ${report.packetsReceived} | ${report.missingPackets} | ${report.deliveryRate}% | ${report.achievedPacketsPerSecondPerDirection} packets/s | ${report.relayPayloadKbps} kbps |\n\nInvalid packets: ${report.invalidPackets}. Duplicate packets: ${report.duplicatePackets}. Cadence misses: ${report.cadenceMisses}.\n\n${report.acceptance}\n\nThe benchmark sends 160-byte packets every 20ms in both directions, modeling 64 kbps of audio payload each way. Capacity planning allows **160 kbps of TURN network egress and 160 kbps ingress per fully relayed call** after UDP/IP overhead.\n`,
    );
    if (!report.passed) process.exitCode = 2;
    console.log(
      `TURN benchmark ${report.passed ? "passed" : "failed"}: ${received}/${sent} relay packets (${deliveryRate}%).`,
    );
  } finally {
    for (const client of allClients) client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});