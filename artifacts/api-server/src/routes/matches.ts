import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { matchHistoryTable, profilesTable } from "@workspace/db/schema";
import { sql, desc } from "drizzle-orm";

const router = Router();

// GET /api/matches/stats — toplam görüşme ve süre istatistikleri
router.get("/stats", requireAuth, async (req, res) => {
  const myId = req.userId!;

  const [stats] = await db
    .select({
      totalMatches: sql<number>`count(*)::int`,
      totalSeconds: sql<number>`coalesce(sum(${matchHistoryTable.durationSeconds}), 0)::int`,
      uniquePeers: sql<number>`count(distinct case when ${matchHistoryTable.userAId} = ${myId} then ${matchHistoryTable.userBId} else ${matchHistoryTable.userAId} end)::int`,
    })
    .from(matchHistoryTable)
    .where(
      sql`${matchHistoryTable.userAId} = ${myId} OR ${matchHistoryTable.userBId} = ${myId}`,
    );

  res.json({
    totalMatches: stats?.totalMatches ?? 0,
    totalSeconds: stats?.totalSeconds ?? 0,
    uniquePeers: stats?.uniquePeers ?? 0,
  });
});

// GET /api/matches — son 20 görüşme
router.get("/", requireAuth, async (req, res) => {
  const myId = req.userId!;

  const rows = await db
    .select()
    .from(matchHistoryTable)
    .where(
      sql`${matchHistoryTable.userAId} = ${myId} OR ${matchHistoryTable.userBId} = ${myId}`,
    )
    .orderBy(desc(matchHistoryTable.startedAt))
    .limit(20);

  const matches = await Promise.all(
    rows.map(async (r) => {
      const peerId = r.userAId === myId ? r.userBId : r.userAId;
      const [profile] = await db
        .select({ displayName: profilesTable.displayName, photoUrl: profilesTable.photoUrl })
        .from(profilesTable)
        .where(sql`${profilesTable.userId} = ${peerId}`)
        .limit(1);
      return {
        id: r.id,
        peerId,
        displayName: profile?.displayName ?? "Anonim",
        photoUrl: profile?.photoUrl ?? null,
        createdAt: r.startedAt,
        durationSeconds: r.durationSeconds ?? 0,
      };
    }),
  );

  res.json({ matches });
});

export default router;
