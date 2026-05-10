import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { friendshipsTable, profilesTable, usersTable } from "@workspace/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendFriendRequestEmail } from "../lib/email";
import { notifyUser } from "../lib/socketio";
import { sendPushToUser } from "../lib/push";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        eq(friendshipsTable.requesterId, req.userId!),
        eq(friendshipsTable.addresseeId, req.userId!),
      ),
    );

  // Bug 8 fix: N+1 → toplu profil sorgusu
  const peerIds = rows.map((row) => (row.requesterId === req.userId ? row.addresseeId : row.requesterId));
  const uniquePeerIds = [...new Set(peerIds)];

  const profiles = uniquePeerIds.length > 0
    ? await db
        .select({ userId: profilesTable.userId, displayName: profilesTable.displayName, photoUrl: profilesTable.photoUrl, country: profilesTable.country })
        .from(profilesTable)
        .where(inArray(profilesTable.userId, uniquePeerIds))
    : [];
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const friends = rows.map((row) => {
    const peerId = row.requesterId === req.userId ? row.addresseeId : row.requesterId;
    const profile = profileMap.get(peerId);
    return {
      userId: peerId,
      displayName: profile?.displayName ?? "Unknown",
      photoUrl: profile?.photoUrl ?? null,
      country: profile?.country ?? null,
      status: row.status,
      direction: row.requesterId === req.userId ? "outgoing" : "incoming",
    };
  });

  res.json({ friends });
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = z.object({ peerId: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  if (parsed.data.peerId === req.userId) {
    res.status(400).json({ error: "Kendinize arkadaşlık isteği gönderemezsiniz" });
    return;
  }

  await db
    .insert(friendshipsTable)
    .values({ requesterId: req.userId!, addresseeId: parsed.data.peerId })
    .onConflictDoNothing();

  // Anlık socket + e-posta bildirimi (arka planda)
  void (async () => {
    const [fromProfile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.userId!)).limit(1);
    const fromName = fromProfile?.displayName ?? "Biri";

    notifyUser(parsed.data.peerId, "friend-request", {
      fromUserId: req.userId!,
      fromDisplayName: fromName,
      fromPhotoUrl: fromProfile?.photoUrl ?? null,
    });

    void sendPushToUser(parsed.data.peerId, {
      title: "Yeni arkadaşlık isteği",
      body: `${fromName} seninle arkadaş olmak istiyor`,
      data: { kind: "friend-request", fromUserId: req.userId! },
      channelId: "friends",
    });

    const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.peerId)).limit(1);
    if (toUser?.email && fromProfile) {
      await sendFriendRequestEmail(toUser.email, fromProfile.displayName);
    }
  })();

  res.json({ ok: true });
});

router.post("/:peerId/accept", requireAuth, async (req, res) => {
  const peerId = String(req.params.peerId);
  await db
    .update(friendshipsTable)
    .set({ status: "accepted" })
    .where(
      and(
        eq(friendshipsTable.requesterId, peerId),
        eq(friendshipsTable.addresseeId, req.userId!),
        eq(friendshipsTable.status, "pending"),
      ),
    );

  // İsteği gönderene kabul edildi bildirimi
  void (async () => {
    const [acceptorProfile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.userId!)).limit(1);
    notifyUser(peerId, "friend-accepted", {
      byUserId: req.userId!,
      byDisplayName: acceptorProfile?.displayName ?? "Biri",
      byPhotoUrl: acceptorProfile?.photoUrl ?? null,
    });
  })();

  res.json({ ok: true });
});

router.delete("/:peerId", requireAuth, async (req, res) => {
  const peerId = String(req.params.peerId);
  await db
    .delete(friendshipsTable)
    .where(
      or(
        and(eq(friendshipsTable.requesterId, req.userId!), eq(friendshipsTable.addresseeId, peerId)),
        and(eq(friendshipsTable.requesterId, peerId), eq(friendshipsTable.addresseeId, req.userId!)),
      ),
    );
  res.json({ ok: true });
});

export default router;
