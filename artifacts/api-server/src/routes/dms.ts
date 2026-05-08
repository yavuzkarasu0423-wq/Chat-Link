import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { dmMessagesTable, profilesTable, usersTable } from "@workspace/db/schema";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendDmNotificationEmail } from "../lib/email";
import { notifyUser } from "../lib/socketio";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const myId = req.userId!;
  const msgs = await db
    .select()
    .from(dmMessagesTable)
    .where(or(eq(dmMessagesTable.fromUserId, myId), eq(dmMessagesTable.toUserId, myId)))
    .orderBy(desc(dmMessagesTable.createdAt));

  const peerMap = new Map<string, typeof msgs[0]>();
  for (const m of msgs) {
    const peerId = m.fromUserId === myId ? m.toUserId : m.fromUserId;
    if (!peerMap.has(peerId)) peerMap.set(peerId, m);
  }

  const peerIds = Array.from(peerMap.keys());
  if (peerIds.length === 0) { res.json({ threads: [] }); return; }

  // Bug 8 fix: N+1 → toplu profil sorgusu
  const profiles = await db
    .select({ userId: profilesTable.userId, displayName: profilesTable.displayName, photoUrl: profilesTable.photoUrl })
    .from(profilesTable)
    .where(inArray(profilesTable.userId, peerIds));
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  // Bug 8 fix: N+1 → GROUP BY ile toplu okunmamış sayısı
  const unreadRows = await db
    .select({ fromUserId: dmMessagesTable.fromUserId, count: sql<number>`count(*)::int` })
    .from(dmMessagesTable)
    .where(and(eq(dmMessagesTable.toUserId, myId), eq(dmMessagesTable.read, false)))
    .groupBy(dmMessagesTable.fromUserId);
  const unreadMap = new Map(unreadRows.map((r) => [r.fromUserId, r.count]));

  const threads = Array.from(peerMap.entries()).map(([peerId, lastMsg]) => {
    const profile = profileMap.get(peerId);
    return {
      peerId,
      displayName: profile?.displayName ?? "Unknown",
      photoUrl: profile?.photoUrl ?? null,
      preview: lastMsg.text.slice(0, 80),
      unread: unreadMap.get(peerId) ?? 0,
      lastAt: lastMsg.createdAt instanceof Date ? lastMsg.createdAt.toISOString() : String(lastMsg.createdAt),
    };
  });

  res.json({ threads });
});

router.get("/:peerId", requireAuth, async (req, res) => {
  const myId = req.userId!;
  const peerId = req.params.peerId;
  const messages = await db
    .select()
    .from(dmMessagesTable)
    .where(
      sql`(${dmMessagesTable.fromUserId} = ${myId} AND ${dmMessagesTable.toUserId} = ${peerId})
       OR (${dmMessagesTable.fromUserId} = ${peerId} AND ${dmMessagesTable.toUserId} = ${myId})`,
    )
    .orderBy(dmMessagesTable.createdAt);

  await db
    .update(dmMessagesTable)
    .set({ read: true })
    .where(
      sql`${dmMessagesTable.fromUserId} = ${peerId} AND ${dmMessagesTable.toUserId} = ${myId}`,
    );

  res.json({ messages });
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = z.object({ toUserId: z.string(), body: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  const [message] = await db
    .insert(dmMessagesTable)
    .values({ fromUserId: req.userId!, toUserId: parsed.data.toUserId, text: parsed.data.body })
    .returning();

  // Anlık socket bildirimi
  void (async () => {
    const [fromProfile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.userId!)).limit(1);
    const fromName = fromProfile?.displayName ?? "Biri";
    notifyUser(parsed.data.toUserId, "dm-received", {
      fromUserId: req.userId!,
      fromDisplayName: fromName,
      preview: parsed.data.body.slice(0, 80),
    });

    // E-posta bildirimi (arka planda)
    const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.toUserId)).limit(1);
    if (toUser?.email && fromProfile) {
      await sendDmNotificationEmail(toUser.email, fromProfile.displayName, parsed.data.body);
    }
  })();

  res.json({ message });
});

export default router;
