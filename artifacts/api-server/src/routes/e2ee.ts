import { Router, type IRouter } from "express";
import {
  db,
  e2eeDevicesTable,
  e2eePrekeysTable,
  usersTable,
} from "@workspace/db";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { PublishE2eeKeysBody } from "@workspace/api-zod";
import { type AuthenticatedRequest, requireAuth } from "../lib/auth";

const router: IRouter = Router();

// E2EE is a staff-only feature (encrypted chats are staff direct & group
// chats). Blocking the "user" role prevents customers from harvesting the
// key directory or draining one-time prekeys.
function requireStaff(req: AuthenticatedRequest, res: import("express").Response): boolean {
  if (req.auth!.role === "user") {
    res.status(403).json({ error: "Not available" });
    return false;
  }
  return true;
}

// E2EE key directory. The server only ever stores PUBLIC key material:
// identity keys, signed prekeys, and one-time prekeys. Private keys never
// leave the client (browser IndexedDB). Customers ("user" role) never use
// E2EE — encrypted chats are staff direct & group chats only — but there is
// no harm in any authenticated user publishing keys.

async function keyStatus(userId: number) {
  const [device] = await db
    .select()
    .from(e2eeDevicesTable)
    .where(eq(e2eeDevicesTable.userId, userId));
  const [n] = await db
    .select({ n: count() })
    .from(e2eePrekeysTable)
    .where(eq(e2eePrekeysTable.userId, userId));
  return {
    published: !!device,
    registrationId: device?.registrationId ?? null,
    identityKey: device?.identityKey ?? null,
    oneTimePrekeyCount: n?.n ?? 0,
  };
}

router.get("/e2ee/keys", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireStaff(req, res)) return;
  res.json(await keyStatus(req.auth!.sub));
});

router.post("/e2ee/keys", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireStaff(req, res)) return;
  const parsed = PublishE2eeKeysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid key bundle" });
    return;
  }
  const meId = req.auth!.sub;
  const {
    registrationId,
    identityKey,
    signedPrekeyId,
    signedPrekeyPub,
    signedPrekeySignature,
    oneTimePrekeys,
  } = parsed.data;

  // A user has one logical device. Re-publishing with a DIFFERENT identity
  // key means the user reset their keys (cleared browser storage / new
  // browser) — old prekeys belong to the lost private identity and must go.
  const [existing] = await db
    .select()
    .from(e2eeDevicesTable)
    .where(eq(e2eeDevicesTable.userId, meId));
  if (existing && existing.identityKey !== identityKey) {
    await db.delete(e2eePrekeysTable).where(eq(e2eePrekeysTable.userId, meId));
  }
  await db
    .insert(e2eeDevicesTable)
    .values({
      userId: meId,
      registrationId,
      identityKey,
      signedPrekeyId,
      signedPrekeyPub,
      signedPrekeySignature,
    })
    .onConflictDoUpdate({
      target: e2eeDevicesTable.userId,
      set: {
        registrationId,
        identityKey,
        signedPrekeyId,
        signedPrekeyPub,
        signedPrekeySignature,
        updatedAt: new Date(),
      },
    });
  if (oneTimePrekeys?.length) {
    await db
      .insert(e2eePrekeysTable)
      .values(
        oneTimePrekeys.map((k) => ({
          userId: meId,
          keyId: k.keyId,
          pubKey: k.pubKey,
        })),
      )
      .onConflictDoNothing();
  }
  res.json(await keyStatus(meId));
});

// Fetch prekey bundles to start Signal sessions with other users.
// Consumes (deletes) one one-time prekey per requested user, atomically, so
// two concurrent fetchers never receive the same one-time prekey.
router.get("/e2ee/bundles", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireStaff(req, res)) return;
  const raw = String(req.query["userIds"] ?? "");
  const userIds = [
    ...new Set(
      raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  if (!userIds.length || userIds.length > 50) {
    res.status(400).json({ error: "userIds is required (comma-separated ids)" });
    return;
  }
  // Only staff-visible active users can be looked up.
  const activeIds = new Set(
    (
      await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(inArray(usersTable.id, userIds), eq(usersTable.isActive, true)))
    ).map((r) => r.id),
  );
  const devices = await db
    .select()
    .from(e2eeDevicesTable)
    .where(inArray(e2eeDevicesTable.userId, userIds));
  const bundles = [];
  for (const device of devices) {
    if (!activeIds.has(device.userId)) continue;
    // Atomically claim one one-time prekey (DELETE ... RETURNING is atomic).
    const [claimed] = await db
      .delete(e2eePrekeysTable)
      .where(
        eq(
          e2eePrekeysTable.id,
          sql`(select id from e2ee_prekeys where user_id = ${device.userId} order by id limit 1 for update skip locked)`,
        ),
      )
      .returning();
    bundles.push({
      userId: device.userId,
      registrationId: device.registrationId,
      identityKey: device.identityKey,
      signedPrekeyId: device.signedPrekeyId,
      signedPrekeyPub: device.signedPrekeyPub,
      signedPrekeySignature: device.signedPrekeySignature,
      preKeyId: claimed?.keyId ?? null,
      preKeyPub: claimed?.pubKey ?? null,
    });
  }
  res.json(bundles);
});

export default router;
