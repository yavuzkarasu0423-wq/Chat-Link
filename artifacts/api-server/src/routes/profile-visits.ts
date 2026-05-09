import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  profileVisitsTable,
  profilesTable,
  subscriptionsTable,
  isVipActive,
} from "@workspace/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";

const router = Router();

/**
 * POST /api/profile-visits/:userId — record that the caller viewed userId's profile.
 * Idempotent per pair; repeat visits within a short cooldown only update the timestamp.
 */
router.post("/:userId", requireAuth, async (req, res) => {
  const visitorId = req.userId!;
  const profileId = String(req.params.userId);
  if (visitorId === profileId) {
    res.json({ ok: true, self: true });
    return;
  }
  await db
    .insert(profileVisitsTable)
    .values({ visitorId, profileId })
    .onConflictDoUpdate({
      target: [profileVisitsTable.visitorId, profileVisitsTable.profileId],
      set: {
        visitCount: sql`${profileVisitsTable.visitCount} + 1`,
        lastVisitedAt: new Date(),
      },
    });
  res.json({ ok: true });
});

/**
 * GET /api/profile-visits — last 50 unique visitors to my profile (VIP only).
 * Non-VIP users get a teaser count without identities.
 */
router.get("/", requireAuth, async (req, res) => {
  const myId = req.userId!;

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, myId))
    .limit(1);
  const vip = isVipActive(sub);

  const [{ totalCount } = { totalCount: 0 }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(profileVisitsTable)
    .where(eq(profileVisitsTable.profileId, myId));

  if (!vip) {
    res.json({
      vip: false,
      totalVisitors: totalCount,
      visitors: [],
      message: "Ziyaretçilerinizin kim olduğunu görmek için VIP olun 👑",
    });
    return;
  }

  const rows = await db
    .select()
    .from(profileVisitsTable)
    .where(eq(profileVisitsTable.profileId, myId))
    .orderBy(desc(profileVisitsTable.lastVisitedAt))
    .limit(50);

  const visitorIds = rows.map((r) => r.visitorId);
  const profiles = visitorIds.length
    ? await db
        .select({
          userId: profilesTable.userId,
          displayName: profilesTable.displayName,
          photoUrl: profilesTable.photoUrl,
          country: profilesTable.country,
          age: profilesTable.age,
        })
        .from(profilesTable)
        .where(inArray(profilesTable.userId, visitorIds))
    : [];
  const pmap = new Map(profiles.map((p) => [p.userId, p]));

  const visitors = rows.map((r) => {
    const p = pmap.get(r.visitorId);
    return {
      userId: r.visitorId,
      displayName: p?.displayName ?? "Anonim",
      photoUrl: p?.photoUrl ?? null,
      country: p?.country ?? null,
      age: p?.age ?? null,
      visitCount: r.visitCount,
      lastVisitedAt: r.lastVisitedAt.toISOString(),
    };
  });

  res.json({ vip: true, totalVisitors: totalCount, visitors });
});

export default router;
