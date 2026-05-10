import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  dailyRewardsTable,
  coinBalancesTable,
  coinTransactionsTable,
  DAILY_REWARD_LADDER,
  rewardForStreak,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

interface StreakComputation {
  streak: number;
  canClaim: boolean;
  hoursUntilNext: number;
  nextReward: number;
}

function computeStreak(state: { currentStreak: number; lastClaimedAt: Date | null }): StreakComputation {
  const now = Date.now();
  if (!state.lastClaimedAt) {
    return { streak: 1, canClaim: true, hoursUntilNext: 0, nextReward: rewardForStreak(1) };
  }
  const lastMs = state.lastClaimedAt.getTime();
  const elapsed = now - lastMs;
  if (elapsed < DAY_MS) {
    return {
      streak: state.currentStreak,
      canClaim: false,
      hoursUntilNext: Math.ceil((DAY_MS - elapsed) / (60 * 60 * 1000)),
      nextReward: rewardForStreak(state.currentStreak + 1),
    };
  }
  // Within 48 hours of last claim → streak continues; otherwise resets to 1
  const newStreak = elapsed < 2 * DAY_MS ? state.currentStreak + 1 : 1;
  return { streak: newStreak, canClaim: true, hoursUntilNext: 0, nextReward: rewardForStreak(newStreak) };
}

async function getOrInit(userId: string) {
  let [row] = await db
    .select()
    .from(dailyRewardsTable)
    .where(eq(dailyRewardsTable.userId, userId))
    .limit(1);
  if (!row) {
    [row] = await db.insert(dailyRewardsTable).values({ userId }).returning();
  }
  return row;
}

// GET /api/daily-reward/status
router.get("/status", requireAuth, async (req, res) => {
  const row = await getOrInit(req.userId!);
  const computation = computeStreak({
    currentStreak: row.currentStreak,
    lastClaimedAt: row.lastClaimedAt,
  });
  res.json({
    currentStreak: row.currentStreak,
    totalClaimed: row.totalClaimed,
    lastClaimedAt: row.lastClaimedAt?.toISOString() ?? null,
    canClaim: computation.canClaim,
    hoursUntilNext: computation.hoursUntilNext,
    nextStreak: computation.canClaim ? computation.streak : row.currentStreak,
    nextReward: computation.canClaim
      ? computation.nextReward
      : rewardForStreak(row.currentStreak + 1),
    ladder: DAILY_REWARD_LADDER,
  });
});

// POST /api/daily-reward/claim
router.post("/claim", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const row = await getOrInit(userId);
  const computation = computeStreak({
    currentStreak: row.currentStreak,
    lastClaimedAt: row.lastClaimedAt,
  });
  if (!computation.canClaim) {
    res.status(409).json({
      error: "Bugün zaten talep ettiniz",
      hoursUntilNext: computation.hoursUntilNext,
    });
    return;
  }

  const reward = computation.nextReward;
  const newStreak = computation.streak;
  const now = new Date();

  // All-or-nothing: optimistic-lock streak update + balance + transaction history in one TX
  const result = await db.transaction(async (tx) => {
    const updateResult = await tx
      .update(dailyRewardsTable)
      .set({
        currentStreak: newStreak,
        totalClaimed: sql`${dailyRewardsTable.totalClaimed} + ${reward}`,
        lastClaimedAt: now,
      })
      .where(
        row.lastClaimedAt
          ? sql`${dailyRewardsTable.userId} = ${userId} AND ${dailyRewardsTable.lastClaimedAt} = ${row.lastClaimedAt}`
          : sql`${dailyRewardsTable.userId} = ${userId} AND ${dailyRewardsTable.lastClaimedAt} IS NULL`,
      )
      .returning();

    if (updateResult.length === 0) return { conflict: true as const };

    await tx
      .insert(coinBalancesTable)
      .values({ userId, balance: reward })
      .onConflictDoUpdate({
        target: coinBalancesTable.userId,
        set: { balance: sql`${coinBalancesTable.balance} + ${reward}` },
      });

    await tx.insert(coinTransactionsTable).values({
      userId,
      amount: reward,
      reason: `🗓️ Günlük ödül (${newStreak}. gün) +${reward} coin`,
    });

    const [bal] = await tx
      .select({ balance: coinBalancesTable.balance })
      .from(coinBalancesTable)
      .where(eq(coinBalancesTable.userId, userId))
      .limit(1);

    return { conflict: false as const, balance: bal?.balance ?? reward };
  });

  if (result.conflict) {
    res.status(409).json({ error: "Bugün zaten talep ettiniz" });
    return;
  }

  res.json({
    ok: true,
    reward,
    newStreak,
    balance: result.balance,
  });
});

export default router;
