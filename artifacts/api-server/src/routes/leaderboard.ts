import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { coinTransactionsTable, profilesTable, subscriptionsTable } from "@workspace/db/schema";
import { sql, desc, eq, inArray } from "drizzle-orm";
import { isVipActive, type VipPlan } from "@workspace/db/schema";

const router = Router();

type Period = "daily" | "weekly" | "all-time";
type Kind = "senders" | "receivers";

function intervalForPeriod(period: Period): string {
  if (period === "daily") return "24 hours";
  if (period === "weekly") return "7 days";
  return "100 years";
}

interface LbRow {
  userId: string;
  total: number;
}

// GET /api/leaderboard?period=daily|weekly|all-time&kind=senders|receivers&limit=50
router.get("/", requireAuth, async (req, res) => {
  const period = ((req.query.period as string) ?? "weekly") as Period;
  const kind = ((req.query.kind as string) ?? "senders") as Kind;
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50));

  if (!["daily", "weekly", "all-time"].includes(period) || !["senders", "receivers"].includes(kind)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  const interval = intervalForPeriod(period);

  // Gift transactions:
  // - "<emoji> hediye gönderildi"  → sender (negative amount)
  // - "<emoji> hediye alındı 🎁"   → receiver (positive amount)
  const reasonPattern = kind === "senders" ? "% hediye gönderildi" : "% hediye alındı 🎁";

  const rows = await db.execute<{ user_id: string; total: number }>(sql`
    SELECT user_id, SUM(ABS(amount))::int AS total
    FROM coin_transactions
    WHERE reason LIKE ${reasonPattern}
      AND created_at >= NOW() - (${interval})::interval
    GROUP BY user_id
    ORDER BY total DESC
    LIMIT ${limit}
  `);

  const lbRows: LbRow[] = (rows.rows ?? []).map((r) => ({ userId: r.user_id, total: Number(r.total) }));
  if (lbRows.length === 0) {
    res.json({ rows: [], myRank: null, myTotal: 0 });
    return;
  }

  const userIds = lbRows.map((r) => r.userId);

  const [profiles, subs] = await Promise.all([
    db
      .select({
        userId: profilesTable.userId,
        displayName: profilesTable.displayName,
        photoUrl: profilesTable.photoUrl,
        country: profilesTable.country,
      })
      .from(profilesTable)
      .where(inArray(profilesTable.userId, userIds)),
    db
      .select()
      .from(subscriptionsTable)
      .where(inArray(subscriptionsTable.userId, userIds)),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.userId, p]));
  const vipMap = new Map<string, VipPlan | null>();
  for (const s of subs) {
    vipMap.set(s.userId, isVipActive(s) ? (s.plan as VipPlan) : null);
  }

  const enriched = lbRows.map((r, i) => {
    const profile = profileMap.get(r.userId);
    return {
      rank: i + 1,
      userId: r.userId,
      total: r.total,
      displayName: profile?.displayName ?? "Anonim",
      photoUrl: profile?.photoUrl ?? null,
      country: profile?.country ?? null,
      vipPlan: vipMap.get(r.userId) ?? null,
    };
  });

  // Compute the requesting user's own rank+total (even if outside top N)
  const [myAgg] = (await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(ABS(amount)), 0)::int AS total
    FROM coin_transactions
    WHERE user_id = ${req.userId!}
      AND reason LIKE ${reasonPattern}
      AND created_at >= NOW() - (${interval})::interval
  `)).rows ?? [];

  const myTotal = Number(myAgg?.total ?? 0);
  let myRank: number | null = null;
  if (myTotal > 0) {
    const [{ rank }] = (await db.execute<{ rank: number }>(sql`
      SELECT (1 + COUNT(*))::int AS rank
      FROM (
        SELECT SUM(ABS(amount))::int AS total
        FROM coin_transactions
        WHERE reason LIKE ${reasonPattern}
          AND created_at >= NOW() - (${interval})::interval
        GROUP BY user_id
      ) sub
      WHERE sub.total > ${myTotal}
    `)).rows ?? [{ rank: null as unknown as number }];
    myRank = rank ? Number(rank) : null;
  }

  res.json({ rows: enriched, myRank, myTotal });
});

export default router;
