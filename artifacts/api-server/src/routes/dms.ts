import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { dmMessagesTable, profilesTable, usersTable } from "@workspace/db/schema";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendDmNotificationEmail } from "../lib/email";
import { notifyUser } from "../lib/socketio";

const router = Router();

/** Mesaj satırını mobile/web uyumlu formata çevir */
function mapMessage(m: {
  id: number;
  fromUserId: string;
  toUserId: string;
  text: string;
  read: boolean;
  createdAt: Date | string;
}) {
  return {
    id: m.id,
    senderId: m.fromUserId,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    content: m.text,
    text: m.text,
    read: m.read,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
  };
}

// GET /api/dms — thread listesi
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

  const profiles = await db
    .select({ userId: profilesTable.userId, displayName: profilesTable.displayName, photoUrl: profilesTable.photoUrl })
    .from(profilesTable)
    .where(inArray(profilesTable.userId, peerIds));
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const unreadRows = await db
    .select({ fromUserId: dmMessagesTable.fromUserId, count: sql<number>`count(*)::int` })
    .from(dmMessagesTable)
    .where(and(eq(dmMessagesTable.toUserId, myId), eq(dmMessagesTable.read, false)))
    .groupBy(dmMessagesTable.fromUserId);
  const unreadMap = new Map(unreadRows.map((r) => [r.fromUserId, r.count]));

  const threads = Array.from(peerMap.entries()).map(([peerId, lastMsg]) => {
    const profile = profileMap.get(peerId);
    const preview = lastMsg.text.slice(0, 80);
    return {
      userId: peerId,
      peerId,
      displayName: profile?.displayName ?? "Unknown",
      photoUrl: profile?.photoUrl ?? null,
      lastMessage: preview,
      preview,
      unread: unreadMap.get(peerId) ?? 0,
      lastAt: lastMsg.createdAt instanceof Date ? lastMsg.createdAt.toISOString() : String(lastMsg.createdAt),
    };
  });

  res.json({ threads });
});

// GET /api/dms/:peerId — mesaj geçmişi + partner bilgisi
router.get("/:peerId", requireAuth, async (req, res) => {
  const myId = req.userId!;
  const peerId = String(req.params.peerId);

  const [rawMessages, partnerProfile] = await Promise.all([
    db
      .select()
      .from(dmMessagesTable)
      .where(
        sql`(${dmMessagesTable.fromUserId} = ${myId} AND ${dmMessagesTable.toUserId} = ${peerId})
         OR (${dmMessagesTable.fromUserId} = ${peerId} AND ${dmMessagesTable.toUserId} = ${myId})`,
      )
      .orderBy(dmMessagesTable.createdAt),
    db
      .select({ userId: profilesTable.userId, displayName: profilesTable.displayName, photoUrl: profilesTable.photoUrl })
      .from(profilesTable)
      .where(eq(profilesTable.userId, peerId))
      .limit(1),
  ]);

  await db
    .update(dmMessagesTable)
    .set({ read: true })
    .where(
      sql`${dmMessagesTable.fromUserId} = ${peerId} AND ${dmMessagesTable.toUserId} = ${myId}`,
    );

  const messages = rawMessages.map(mapMessage);
  const p = partnerProfile[0];
  const partner = p
    ? { userId: p.userId, peerId: p.userId, displayName: p.displayName, photoUrl: p.photoUrl, lastMessage: "", preview: "", unread: 0, lastAt: "" }
    : null;

  res.json({ messages, partner });
});

/** Mesaj gönderme ortak mantığı */
async function sendDm(fromUserId: string, toUserId: string, text: string) {
  const [message] = await db
    .insert(dmMessagesTable)
    .values({ fromUserId, toUserId, text })
    .returning();

  void (async () => {
    const [fromProfile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, fromUserId)).limit(1);
    const fromName = fromProfile?.displayName ?? "Biri";
    notifyUser(toUserId, "dm-received", {
      fromUserId,
      fromDisplayName: fromName,
      preview: text.slice(0, 80),
    });
    const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, toUserId)).limit(1);
    if (toUser?.email && fromProfile) {
      await sendDmNotificationEmail(toUser.email, fromProfile.displayName, text);
    }
  })();

  return message;
}

// POST /api/dms — web uyumlu (body: { toUserId, body })
router.post("/", requireAuth, async (req, res) => {
  const parsed = z.object({ toUserId: z.string(), body: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const message = await sendDm(req.userId!, parsed.data.toUserId, parsed.data.body);
  res.json({ message: mapMessage(message) });
});

// POST /api/dms/:toUserId — mobil uyumlu (body: { content })
router.post("/:toUserId", requireAuth, async (req, res) => {
  const parsed = z.object({ content: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const message = await sendDm(req.userId!, String(req.params.toUserId), parsed.data.content);
  res.json({ message: mapMessage(message) });
});

export default router;
