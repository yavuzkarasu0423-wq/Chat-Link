import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { dmMessagesTable, profilesTable, usersTable } from "@workspace/db/schema";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendDmNotificationEmail } from "../lib/email";
import { notifyUser } from "../lib/socketio";
import { sendPushToUser } from "../lib/push";

const router = Router();

/** Mesaj satırını mobile/web uyumlu formata çevir */
function mapMessage(m: {
  id: number;
  fromUserId: string;
  toUserId: string;
  text: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
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
    attachmentUrl: m.attachmentUrl ?? null,
    attachmentType: m.attachmentType ?? null,
    read: m.read,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
  };
}

/** Limit attachment payloads to ~700KB of base64 to keep DB rows reasonable. */
const MAX_ATTACHMENT_LEN = 700_000;
const ALLOWED_ATTACHMENT_TYPES = ["image"] as const;
type AttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

const attachmentSchema = z
  .object({
    attachmentUrl: z.string().min(8).max(MAX_ATTACHMENT_LEN).optional().nullable(),
    attachmentType: z.enum(ALLOWED_ATTACHMENT_TYPES).optional().nullable(),
  })
  .refine(
    (d) => (d.attachmentUrl ? Boolean(d.attachmentType) : true),
    { message: "attachmentType required when attachmentUrl present" },
  );

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
async function sendDm(
  fromUserId: string,
  toUserId: string,
  text: string,
  attachment?: { url: string; type: AttachmentType } | null,
) {
  const [message] = await db
    .insert(dmMessagesTable)
    .values({
      fromUserId,
      toUserId,
      text,
      attachmentUrl: attachment?.url ?? null,
      attachmentType: attachment?.type ?? null,
    })
    .returning();

  void (async () => {
    const [fromProfile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, fromUserId)).limit(1);
    const fromName = fromProfile?.displayName ?? "Biri";
    const previewText = attachment ? "📷 Fotoğraf gönderdi" : text.slice(0, 80);
    notifyUser(toUserId, "dm-received", {
      fromUserId,
      fromDisplayName: fromName,
      preview: previewText,
    });
    void sendPushToUser(toUserId, {
      title: fromName,
      body: previewText,
      data: { kind: "dm", fromUserId },
      channelId: "messages",
    });
    const [toUser] = await db.select().from(usersTable).where(eq(usersTable.id, toUserId)).limit(1);
    if (toUser?.email && fromProfile && !attachment) {
      await sendDmNotificationEmail(toUser.email, fromProfile.displayName, text);
    }
  })();

  return message;
}

// POST /api/dms — web uyumlu (body: { toUserId, body, attachmentUrl?, attachmentType? })
router.post("/", requireAuth, async (req, res) => {
  const parsed = z
    .object({
      toUserId: z.string(),
      body: z.string().max(2000).optional().default(""),
      attachmentUrl: z.string().min(8).max(MAX_ATTACHMENT_LEN).optional().nullable(),
      attachmentType: z.enum(ALLOWED_ATTACHMENT_TYPES).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const { toUserId, body, attachmentUrl, attachmentType } = parsed.data;
  if (!body && !attachmentUrl) {
    res.status(400).json({ error: "Mesaj veya ek gerekli" });
    return;
  }
  const attachment = attachmentUrl && attachmentType ? { url: attachmentUrl, type: attachmentType } : null;
  const text = body || (attachment ? "📷 Fotoğraf" : "");
  const message = await sendDm(req.userId!, toUserId, text, attachment);
  res.json({ message: mapMessage(message) });
});

// POST /api/dms/:toUserId — mobil uyumlu (body: { content, attachmentUrl?, attachmentType? })
router.post("/:toUserId", requireAuth, async (req, res) => {
  const parsed = z
    .object({
      content: z.string().max(2000).optional().default(""),
      attachmentUrl: z.string().min(8).max(MAX_ATTACHMENT_LEN).optional().nullable(),
      attachmentType: z.enum(ALLOWED_ATTACHMENT_TYPES).optional().nullable(),
    })
    .merge(attachmentSchema.unwrap())
    .partial()
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const content = parsed.data.content ?? "";
  const attachmentUrl = parsed.data.attachmentUrl ?? null;
  const attachmentType = parsed.data.attachmentType ?? null;
  if (!content && !attachmentUrl) {
    res.status(400).json({ error: "Mesaj veya ek gerekli" });
    return;
  }
  const attachment = attachmentUrl && attachmentType ? { url: attachmentUrl, type: attachmentType } : null;
  const text = content || (attachment ? "📷 Fotoğraf" : "");
  const message = await sendDm(req.userId!, String(req.params.toUserId), text, attachment);
  res.json({ message: mapMessage(message) });
});

export default router;
