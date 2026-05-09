import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  broadcasterProfilesTable,
  broadcasterEarningsTable,
  userRolesTable,
  profilesTable,
  coinTransactionsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, between, gte, lte } from "drizzle-orm";

const router = Router();

// ─── Check broadcaster role ───────────────────────────────────────────────────

async function isBroadcaster(userId: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(userRolesTable)
    .where(and(eq(userRolesTable.userId, userId), eq(userRolesTable.role, "broadcaster")))
    .limit(1);
  return !!row;
}

// ─── GET /api/broadcasters/me — kendi profili ─────────────────────────────────

router.get("/me", requireAuth, async (req, res) => {
  const ok = await isBroadcaster(req.userId!);
  if (!ok) { res.status(403).json({ error: "Yayıncı değilsiniz" }); return; }

  const [profile] = await db
    .select()
    .from(broadcasterProfilesTable)
    .where(eq(broadcasterProfilesTable.userId, req.userId!))
    .limit(1);

  res.json({ profile: profile ?? null });
});

// ─── PUT /api/broadcasters/me — IBAN & banka güncelle ────────────────────────

router.put("/me", requireAuth, async (req, res) => {
  const ok = await isBroadcaster(req.userId!);
  if (!ok) { res.status(403).json({ error: "Yayıncı değilsiniz" }); return; }

  const { fullName, iban, bankName } = req.body as { fullName?: string; iban?: string; bankName?: string };
  if (!fullName?.trim() || !iban?.trim()) {
    res.status(400).json({ error: "Ad Soyad ve IBAN zorunludur" }); return;
  }

  const ibanClean = iban.replace(/\s/g, "").toUpperCase();
  if (!/^TR\d{24}$/.test(ibanClean)) {
    res.status(400).json({ error: "Geçersiz IBAN (TR ile başlamalı, 26 karakter)" }); return;
  }

  await db
    .insert(broadcasterProfilesTable)
    .values({ userId: req.userId!, fullName: fullName.trim(), iban: ibanClean, bankName: bankName?.trim() ?? null })
    .onConflictDoUpdate({
      target: broadcasterProfilesTable.userId,
      set: { fullName: fullName.trim(), iban: ibanClean, bankName: bankName?.trim() ?? null, updatedAt: new Date() },
    });

  res.json({ ok: true });
});

// ─── GET /api/broadcasters/me/earnings — kendi kazanç geçmişi ────────────────

router.get("/me/earnings", requireAuth, async (req, res) => {
  const ok = await isBroadcaster(req.userId!);
  if (!ok) { res.status(403).json({ error: "Yayıncı değilsiniz" }); return; }

  const earnings = await db
    .select()
    .from(broadcasterEarningsTable)
    .where(eq(broadcasterEarningsTable.broadcasterId, req.userId!))
    .orderBy(desc(broadcasterEarningsTable.weekStart))
    .limit(52);

  const pendingCoins = await db.execute(sql`
    SELECT coalesce(sum(amount), 0)::int AS coins
    FROM coin_transactions
    WHERE user_id = ${req.userId}
      AND amount > 0
      AND (reason LIKE '%hediye%' OR reason LIKE '%gift%' OR reason LIKE '%🎁%')
      AND created_at >= date_trunc('week', NOW())
  `);

  const [profile] = await db
    .select({ coinRateKurus: broadcasterProfilesTable.coinRateKurus, platformCutPercent: broadcasterProfilesTable.platformCutPercent })
    .from(broadcasterProfilesTable)
    .where(eq(broadcasterProfilesTable.userId, req.userId!))
    .limit(1);

  const pendingCoinCount = (pendingCoins.rows[0] as { coins: number })?.coins ?? 0;
  const coinRate = profile?.coinRateKurus ?? 5;
  const cut = profile?.platformCutPercent ?? 50;
  const netRate = coinRate * (1 - cut / 100);

  res.json({
    earnings,
    currentWeek: {
      coins: pendingCoinCount,
      estimatedTlKurus: Math.floor(pendingCoinCount * netRate),
    },
  });
});

export default router;
