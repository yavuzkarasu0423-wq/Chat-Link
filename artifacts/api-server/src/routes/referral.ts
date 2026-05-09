import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  referralsTable,
  coinBalancesTable,
  coinTransactionsTable,
  usersTable,
  profilesTable,
  REFERRAL_REWARD_COINS,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

/**
 * GET /api/referral/me — caller's referral code (= their userId), stats, and link.
 */
router.get("/me", requireAuth, async (req, res) => {
  const myId = req.userId!;

  const [stats] = await db
    .select({
      totalReferred: sql<number>`count(*)::int`,
      coinsEarned: sql<number>`coalesce(sum(${referralsTable.coinsAwarded}), 0)::int`,
    })
    .from(referralsTable)
    .where(eq(referralsTable.referrerId, myId));

  const recent = await db
    .select({
      referredId: referralsTable.referredId,
      createdAt: referralsTable.createdAt,
      displayName: profilesTable.displayName,
      photoUrl: profilesTable.photoUrl,
    })
    .from(referralsTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, referralsTable.referredId))
    .where(eq(referralsTable.referrerId, myId))
    .orderBy(sql`${referralsTable.createdAt} DESC`)
    .limit(20);

  const domains = process.env["REPLIT_DOMAINS"]?.split(",") ?? [];
  const baseUrl = domains[0] ? `https://${domains[0]}` : "";
  const basePath = process.env["BASE_PATH"] ?? "";
  const link = `${baseUrl}${basePath}?ref=${encodeURIComponent(myId)}`;

  res.json({
    code: myId,
    link,
    rewardCoins: REFERRAL_REWARD_COINS,
    totalReferred: stats?.totalReferred ?? 0,
    coinsEarned: stats?.coinsEarned ?? 0,
    recent: recent.map((r) => ({
      userId: r.referredId,
      displayName: r.displayName ?? "Yeni kullanıcı",
      photoUrl: r.photoUrl ?? null,
      joinedAt: r.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/referral/claim — caller redeems a friend's referral code.
 * Constraints:
 *   - not their own code
 *   - code must match an existing user
 *   - caller must not already have a referrer
 * Both sides receive REFERRAL_REWARD_COINS in a single transaction.
 */
router.post("/claim", requireAuth, async (req, res) => {
  const parsed = z.object({ code: z.string().min(1).max(128) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kod" });
    return;
  }
  const myId = req.userId!;
  const referrerId = parsed.data.code.trim();

  if (referrerId === myId) {
    res.status(400).json({ error: "Kendi kodunuzu kullanamazsınız" });
    return;
  }

  const [referrer] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, referrerId)).limit(1);
  if (!referrer) {
    res.status(404).json({ error: "Geçersiz davet kodu" });
    return;
  }

  // Existing claim? referredId is UNIQUE, so a row already exists for this user
  const [existing] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referredId, myId))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Davet kodunuzu daha önce kullandınız" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    // Insert referral row; rely on referredId UNIQUE constraint to prevent double-claim race.
    const [row] = await tx
      .insert(referralsTable)
      .values({ referrerId, referredId: myId, coinsAwarded: REFERRAL_REWARD_COINS })
      .onConflictDoNothing({ target: referralsTable.referredId })
      .returning();
    if (!row) return { conflict: true as const };

    // Credit both sides
    for (const userId of [myId, referrerId]) {
      await tx
        .insert(coinBalancesTable)
        .values({ userId, balance: REFERRAL_REWARD_COINS })
        .onConflictDoUpdate({
          target: coinBalancesTable.userId,
          set: { balance: sql`${coinBalancesTable.balance} + ${REFERRAL_REWARD_COINS}` },
        });
    }
    await tx.insert(coinTransactionsTable).values([
      { userId: myId, amount: REFERRAL_REWARD_COINS, reason: `🎁 Davet bonusu (+${REFERRAL_REWARD_COINS})` },
      { userId: referrerId, amount: REFERRAL_REWARD_COINS, reason: `🎁 Arkadaşını davet ettin (+${REFERRAL_REWARD_COINS})` },
    ]);
    return { conflict: false as const };
  });

  if (result.conflict) {
    res.status(409).json({ error: "Davet kodunuzu daha önce kullandınız" });
    return;
  }
  res.json({ ok: true, reward: REFERRAL_REWARD_COINS });
});

export default router;
