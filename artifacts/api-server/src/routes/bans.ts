import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { userBansTable, profilesTable } from "@workspace/db/schema";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(userBansTable)
    .where(
      and(
        eq(userBansTable.blockerId, req.userId!),
        or(
          sql`${userBansTable.expiresAt} IS NULL`,
          sql`${userBansTable.expiresAt} > NOW()`,
        ),
      ),
    );

  if (rows.length === 0) {
    res.json({ blocked: [] });
    return;
  }

  const blockedIds = rows.map((r) => r.blockedId);
  const profiles = await db
    .select({ userId: profilesTable.userId, displayName: profilesTable.displayName, photoUrl: profilesTable.photoUrl })
    .from(profilesTable)
    .where(inArray(profilesTable.userId, blockedIds));
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const blocked = rows.map((row) => ({
    userId: row.blockedId,
    displayName: profileMap.get(row.blockedId)?.displayName ?? "Bilinmeyen Kullanıcı",
    photoUrl: profileMap.get(row.blockedId)?.photoUrl ?? null,
    expiresAt: row.expiresAt,
  }));

  res.json({ blocked });
});

const banSchema = z.object({
  blockedUserId: z.string(),
  durationHours: z.number().int().positive().optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = banSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const { blockedUserId, durationHours } = parsed.data;
  const expiresAt = durationHours ? new Date(Date.now() + durationHours * 3600 * 1000) : null;

  await db
    .insert(userBansTable)
    .values({ blockerId: req.userId!, blockedId: blockedUserId, expiresAt })
    .onConflictDoUpdate({
      target: [userBansTable.blockerId, userBansTable.blockedId],
      set: { expiresAt },
    });

  res.json({ ok: true });
});

router.delete("/:blockedUserId", requireAuth, async (req, res) => {
  const blockedUserId = String(req.params.blockedUserId);
  await db
    .delete(userBansTable)
    .where(
      and(
        eq(userBansTable.blockerId, req.userId!),
        eq(userBansTable.blockedId, blockedUserId),
      ),
    );
  res.json({ ok: true });
});

export default router;
