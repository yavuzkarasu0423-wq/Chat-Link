import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const router = Router();

// Bug 6 fix: Map yerine Set — son ping zamanı takip edilir, 60s'den eski girişler temizlenir
const onlineMap = new Map<string, number>(); // userId → lastPingMs

setInterval(() => {
  const now = Date.now();
  for (const [userId, lastPing] of onlineMap.entries()) {
    if (now - lastPing > 60000) onlineMap.delete(userId);
  }
}, 45000);

router.post("/ping", requireAuth, (req, res) => {
  if (req.userId) onlineMap.set(req.userId, Date.now());
  res.json({ ok: true });
});

router.post("/leave", requireAuth, (req, res) => {
  if (req.userId) onlineMap.delete(req.userId);
  res.json({ ok: true });
});

router.get("/online", requireAuth, async (req, res) => {
  const ids = Array.from(onlineMap.keys()).filter((id) => id !== req.userId);
  if (ids.length === 0) {
    res.json({ users: [] });
    return;
  }
  const profiles = await db
    .select({
      userId: profilesTable.userId,
      displayName: profilesTable.displayName,
      age: profilesTable.age,
      gender: profilesTable.gender,
      country: profilesTable.country,
      photoUrl: profilesTable.photoUrl,
    })
    .from(profilesTable)
    .where(inArray(profilesTable.userId, ids));

  res.json({ users: profiles });
});

export default router;
