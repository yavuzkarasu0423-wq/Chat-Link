import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { coinBalancesTable, coinTransactionsTable, profilesTable } from "@workspace/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { z } from "zod";
import { notifyUser } from "../lib/socketio";

const router = Router();

async function getOrCreateBalance(userId: string) {
  let [row] = await db.select().from(coinBalancesTable).where(eq(coinBalancesTable.userId, userId)).limit(1);
  if (!row) {
    [row] = await db.insert(coinBalancesTable).values({ userId, balance: 100 }).returning();
    await db.insert(coinTransactionsTable).values({ userId, amount: 100, reason: "Hoş geldin bonusu 🎁" });
  }
  return row;
}

// GET /api/coins or /api/coins/me
router.get(["/", "/me"], requireAuth, async (req, res) => {
  const row = await getOrCreateBalance(req.userId!);
  res.json({ balance: row.balance });
});

// GET /api/coins/history — coin geçmişi (CoinHistoryModal için)
router.get("/history", requireAuth, async (req, res) => {
  const transactions = await db
    .select()
    .from(coinTransactionsTable)
    .where(eq(coinTransactionsTable.userId, req.userId!))
    .orderBy(desc(coinTransactionsTable.createdAt))
    .limit(50);
  res.json({ transactions });
});

// POST /api/coins/daily — günlük 50 coin bonus
// Bug 9 fix: Atomik INSERT ... SELECT WHERE NOT EXISTS — race condition önlenir
router.post("/daily", requireAuth, async (req, res) => {
  const amount = 50;

  const inserted = await db.execute(
    sql`INSERT INTO coin_transactions (user_id, amount, reason)
        SELECT ${req.userId!}, ${amount}, 'Günlük bonus 🎁'
        WHERE NOT EXISTS (
          SELECT 1 FROM coin_transactions
          WHERE user_id = ${req.userId!}
            AND reason = 'Günlük bonus 🎁'
            AND created_at > NOW() - INTERVAL '24 hours'
        )`,
  );

  if ((inserted as unknown as { rowCount?: number }).rowCount === 0) {
    res.status(409).json({ error: "Already claimed today" });
    return;
  }

  await db
    .insert(coinBalancesTable)
    .values({ userId: req.userId!, balance: amount })
    .onConflictDoUpdate({
      target: coinBalancesTable.userId,
      set: { balance: sql`${coinBalancesTable.balance} + ${amount}` },
    });

  const [row] = await db.select().from(coinBalancesTable).where(eq(coinBalancesTable.userId, req.userId!)).limit(1);
  res.json({ balance: row.balance, earned: amount });
});

const spendSchema = z.object({
  amount: z.number().int().positive(),
  giftEmoji: z.string().optional(),
  receiverId: z.string().optional(),
});

// POST /api/coins/spend — hediye gönder
router.post("/spend", requireAuth, async (req, res) => {
  const parsed = spendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const { amount, giftEmoji, receiverId } = parsed.data;

  const [row] = await db
    .update(coinBalancesTable)
    .set({ balance: sql`${coinBalancesTable.balance} - ${amount}` })
    .where(
      and(
        eq(coinBalancesTable.userId, req.userId!),
        sql`${coinBalancesTable.balance} >= ${amount}`,
      ),
    )
    .returning();

  if (!row) {
    res.status(402).json({ error: "Insufficient coins" });
    return;
  }

  const reason = giftEmoji ? `${giftEmoji} hediye gönderildi` : "Coin harcandı";
  await db.insert(coinTransactionsTable).values({
    userId: req.userId!,
    amount: -amount,
    reason,
    relatedUserId: receiverId ?? null,
  });

  // Alıcıya %30 coin yatır
  if (receiverId && giftEmoji) {
    const earned = Math.max(1, Math.floor(amount * 0.3));
    await db
      .insert(coinBalancesTable)
      .values({ userId: receiverId, balance: earned })
      .onConflictDoUpdate({
        target: coinBalancesTable.userId,
        set: { balance: sql`${coinBalancesTable.balance} + ${earned}` },
      });
    await db.insert(coinTransactionsTable).values({
      userId: receiverId,
      amount: earned,
      reason: `${giftEmoji} hediye alındı 🎁`,
      relatedUserId: req.userId!,
    });
    // Sender name for receiver's gift overlay
    const [senderProfile] = await db
      .select({ displayName: profilesTable.displayName })
      .from(profilesTable)
      .where(eq(profilesTable.userId, req.userId!))
      .limit(1);
    // Bug 1 fix: Hediye animasyonunu sunucu push eder — istemci socket.emit("gift") kullanmaz
    // Böylece coin harcamadan sahte animasyon gönderme engellenir
    notifyUser(receiverId, "partner-gift", {
      emoji: giftEmoji,
      coins: amount,
      senderName: senderProfile?.displayName ?? "Birisi",
    });
  }

  res.json({ balance: row.balance });
});

export default router;
