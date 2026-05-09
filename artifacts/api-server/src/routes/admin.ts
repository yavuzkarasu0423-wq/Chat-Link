import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  userReportsTable,
  userBansTable,
  profilesTable,
  usersTable,
  userRolesTable,
  coinBalancesTable,
  coinTransactionsTable,
  matchHistoryTable,
  adminAuditLogsTable,
  broadcasterProfilesTable,
  broadcasterEarningsTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql, ilike, or } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [role] = await db
    .select()
    .from(userRolesTable)
    .where(and(eq(userRolesTable.userId, req.userId), eq(userRolesTable.role, "admin")))
    .limit(1);
  if (!role) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.use(requireAuth, requireAdmin);

function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

async function auditLog(
  req: Request,
  action: string,
  targetUserId?: string,
  details?: Record<string, unknown>,
) {
  try {
    await db.insert(adminAuditLogsTable).values({
      adminId: req.userId!,
      action,
      targetUserId: targetUserId ?? null,
      details: details ?? null,
      ip: getIp(req),
    });
  } catch {
    logger.warn({ action, targetUserId }, "audit log insert failed");
  }
}

// ─── Stats / Dashboard ──────────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  const [{ userCount }] = await db
    .select({ userCount: sql<number>`count(*)::int` })
    .from(usersTable);

  const [{ openReports }] = await db
    .select({ openReports: sql<number>`count(*)::int` })
    .from(userReportsTable)
    .where(eq(userReportsTable.status, "open"));

  const [{ matchCount }] = await db
    .select({ matchCount: sql<number>`count(*)::int` })
    .from(matchHistoryTable);

  const [{ totalCoins }] = await db
    .select({ totalCoins: sql<number>`coalesce(sum(balance),0)::int` })
    .from(coinBalancesTable);

  const [{ activeBans }] = await db
    .select({ activeBans: sql<number>`count(*)::int` })
    .from(userBansTable)
    .where(sql`${userBansTable.expiresAt} IS NULL OR ${userBansTable.expiresAt} > NOW()`);

  res.json({ userCount, openReports, matchCount, totalCoins, activeBans });
});

// GET /api/admin/dashboard?days=N
router.get("/dashboard", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 14), 7), 90);

  const userGrowth = await db.execute(sql`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           count(*)::int AS count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY day ORDER BY day
  `);

  const matchGrowth = await db.execute(sql`
    SELECT date_trunc('day', started_at AT TIME ZONE 'UTC')::date AS day,
           count(*)::int AS count
    FROM match_history
    WHERE started_at >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY day ORDER BY day
  `);

  const coinFlow = await db.execute(sql`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           sum(CASE WHEN amount > 0 THEN amount ELSE 0 END)::int AS earned,
           sum(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)::int AS spent
    FROM coin_transactions
    WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY day ORDER BY day
  `);

  res.json({
    userGrowth: userGrowth.rows,
    matchGrowth: matchGrowth.rows,
    coinFlow: coinFlow.rows,
  });
});

// GET /api/admin/stats/demographics
router.get("/stats/demographics", async (_req, res) => {
  const byCountry = await db.execute(sql`
    SELECT COALESCE(country, 'Bilinmiyor') as country, count(*)::int as count
    FROM profiles GROUP BY country ORDER BY count DESC LIMIT 20
  `);
  const byGender = await db.execute(sql`
    SELECT COALESCE(gender, 'Belirtilmemiş') as gender, count(*)::int as count
    FROM profiles GROUP BY gender ORDER BY count DESC
  `);
  const byAge = await db.execute(sql`
    SELECT
      CASE
        WHEN age < 18 THEN '<18'
        WHEN age BETWEEN 18 AND 24 THEN '18-24'
        WHEN age BETWEEN 25 AND 34 THEN '25-34'
        WHEN age BETWEEN 35 AND 44 THEN '35-44'
        ELSE '45+'
      END as range,
      count(*)::int as count
    FROM profiles WHERE age IS NOT NULL
    GROUP BY range ORDER BY min(age)
  `);
  res.json({ byCountry: byCountry.rows, byGender: byGender.rows, byAge: byAge.rows });
});

// ─── Reports ────────────────────────────────────────────────────────────────

router.get("/reports", async (req, res) => {
  const status = req.query.status === "resolved" ? "resolved" : "open";
  const offset = Number(req.query.offset ?? 0);
  const reports = await db
    .select()
    .from(userReportsTable)
    .where(eq(userReportsTable.status, status))
    .orderBy(desc(userReportsTable.createdAt))
    .limit(100)
    .offset(offset);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(userReportsTable)
    .where(eq(userReportsTable.status, status));
  res.json({ reports, total });
});

router.post("/reports/:id/resolve", async (req, res) => {
  await db
    .update(userReportsTable)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(userReportsTable.id, Number(req.params.id)));
  await auditLog(req, "report_resolve", undefined, { reportId: req.params.id });
  res.json({ ok: true });
});

router.post("/reports/resolve-all", async (req, res) => {
  const result = await db
    .update(userReportsTable)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(userReportsTable.status, "open"))
    .returning({ id: userReportsTable.id });
  await auditLog(req, "report_resolve_all", undefined, { count: result.length });
  res.json({ ok: true, resolved: result.length });
});

// ─── Ban ────────────────────────────────────────────────────────────────────

router.post("/ban", async (req, res) => {
  const { userId, durationHours } = req.body as { userId: string; durationHours?: number };
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const expiresAt = durationHours ? new Date(Date.now() + durationHours * 3600 * 1000) : null;
  await db
    .insert(userBansTable)
    .values({ blockerId: req.userId!, blockedId: userId, expiresAt })
    .onConflictDoUpdate({
      target: [userBansTable.blockerId, userBansTable.blockedId],
      set: { expiresAt },
    });
  logger.warn(
    { adminId: req.userId, action: "ban", targetUserId: userId, durationHours: durationHours ?? "permanent" },
    "Admin ban action",
  );
  await auditLog(req, "ban", userId, { durationHours: durationHours ?? "permanent" });
  res.json({ ok: true });
});

router.get("/bans", async (_req, res) => {
  const bans = await db
    .select({
      id: userBansTable.id,
      blockerId: userBansTable.blockerId,
      blockedId: userBansTable.blockedId,
      expiresAt: userBansTable.expiresAt,
      createdAt: userBansTable.createdAt,
      displayName: profilesTable.displayName,
    })
    .from(userBansTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, userBansTable.blockedId))
    .where(sql`${userBansTable.expiresAt} IS NULL OR ${userBansTable.expiresAt} > NOW()`)
    .orderBy(desc(userBansTable.createdAt))
    .limit(200);
  res.json({ bans });
});

router.delete("/bans/:id", async (req, res) => {
  await db.delete(userBansTable).where(eq(userBansTable.id, Number(req.params.id)));
  await auditLog(req, "ban_remove", undefined, { banId: req.params.id });
  res.json({ ok: true });
});

// ─── Users ──────────────────────────────────────────────────────────────────

router.get("/users", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const country = typeof req.query.country === "string" ? req.query.country.trim() : "";
  const gender = typeof req.query.gender === "string" ? req.query.gender.trim() : "";

  const conditions = [];
  if (q) {
    conditions.push(
      or(
        ilike(profilesTable.displayName, `%${q}%`),
        ilike(usersTable.email, `%${q}%`),
        eq(usersTable.id, q),
      ),
    );
  }
  if (country) conditions.push(eq(profilesTable.country, country));
  if (gender) conditions.push(eq(profilesTable.gender, gender));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: profilesTable.displayName,
      country: profilesTable.country,
      age: profilesTable.age,
      gender: profilesTable.gender,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(q ? 100 : 500);

  res.json({ users });
});

// GET /api/admin/users/:id
router.get("/users/:id", async (req, res) => {
  const userId = req.params.id;
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: profilesTable.displayName,
      country: profilesTable.country,
      age: profilesTable.age,
      gender: profilesTable.gender,
      bio: profilesTable.bio,
      photoUrl: profilesTable.photoUrl,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const [coinRow] = await db
    .select({ balance: coinBalancesTable.balance })
    .from(coinBalancesTable)
    .where(eq(coinBalancesTable.userId, userId))
    .limit(1);

  const [{ matchCount }] = await db
    .select({ matchCount: sql<number>`count(*)::int` })
    .from(matchHistoryTable)
    .where(or(eq(matchHistoryTable.userAId, userId), eq(matchHistoryTable.userBId, userId)));

  const [{ reportCount }] = await db
    .select({ reportCount: sql<number>`count(*)::int` })
    .from(userReportsTable)
    .where(eq(userReportsTable.reportedId, userId));

  const [roleRow] = await db
    .select()
    .from(userRolesTable)
    .where(and(eq(userRolesTable.userId, userId), eq(userRolesTable.role, "admin")))
    .limit(1);

  const [banRow] = await db
    .select({ id: userBansTable.id, expiresAt: userBansTable.expiresAt })
    .from(userBansTable)
    .where(
      and(
        eq(userBansTable.blockedId, userId),
        sql`${userBansTable.expiresAt} IS NULL OR ${userBansTable.expiresAt} > NOW()`,
      ),
    )
    .limit(1);

  const recentTxns = await db
    .select({ id: coinTransactionsTable.id, amount: coinTransactionsTable.amount, reason: coinTransactionsTable.reason, createdAt: coinTransactionsTable.createdAt })
    .from(coinTransactionsTable)
    .where(eq(coinTransactionsTable.userId, userId))
    .orderBy(desc(coinTransactionsTable.createdAt))
    .limit(5);

  const recentMatches = await db.execute(sql`
    SELECT mh.id, mh.duration_seconds as "durationSeconds", mh.started_at as "startedAt",
           CASE WHEN mh.user_a_id = ${userId} THEN pb.display_name ELSE pa.display_name END as "partnerName"
    FROM match_history mh
    LEFT JOIN profiles pa ON pa.user_id = mh.user_a_id
    LEFT JOIN profiles pb ON pb.user_id = mh.user_b_id
    WHERE mh.user_a_id = ${userId} OR mh.user_b_id = ${userId}
    ORDER BY mh.started_at DESC LIMIT 5
  `);

  res.json({
    user: {
      ...user,
      coinBalance: coinRow?.balance ?? 0,
      matchCount,
      reportCount,
      isAdmin: !!roleRow,
      activeBan: banRow ?? null,
      recentTxns,
      recentMatches: recentMatches.rows,
    },
  });
});

// ─── Coins ──────────────────────────────────────────────────────────────────

router.post("/coins/distribute", async (req, res) => {
  const { userId, amount, reason } = req.body as { userId?: string; amount?: number; reason?: string };
  if (!userId || !amount || amount <= 0 || amount > 1_000_000) {
    res.status(400).json({ error: "Geçersiz parametreler (userId, amount 1-1000000)" });
    return;
  }
  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!existingUser) {
    res.status(404).json({ error: "Kullanıcı bulunamadı" });
    return;
  }
  await db
    .insert(coinBalancesTable)
    .values({ userId, balance: amount })
    .onConflictDoUpdate({
      target: [coinBalancesTable.userId],
      set: { balance: sql`${coinBalancesTable.balance} + ${amount}` },
    });
  await db.insert(coinTransactionsTable).values({
    userId,
    amount,
    reason: reason?.trim() || "Yönetici coin dağıtımı",
  });
  await auditLog(req, "coin_distribute", userId, { amount, reason });
  res.json({ ok: true });
});

router.post("/coins/deduct", async (req, res) => {
  const { userId, amount, reason } = req.body as { userId?: string; amount?: number; reason?: string };
  if (!userId || !amount || amount <= 0) {
    res.status(400).json({ error: "Geçersiz parametreler" });
    return;
  }
  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!existingUser) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }
  await db
    .insert(coinBalancesTable)
    .values({ userId, balance: 0 })
    .onConflictDoUpdate({
      target: [coinBalancesTable.userId],
      set: { balance: sql`GREATEST(0, ${coinBalancesTable.balance} - ${amount})` },
    });
  await db.insert(coinTransactionsTable).values({
    userId,
    amount: -amount,
    reason: reason?.trim() || "Yönetici coin düşürme",
  });
  await auditLog(req, "coin_deduct", userId, { amount, reason });
  res.json({ ok: true });
});

router.post("/coins/reset", async (req, res) => {
  const { userId, reason } = req.body as { userId?: string; reason?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!existingUser) { res.status(404).json({ error: "Kullanıcı bulunamadı" }); return; }
  const [prev] = await db.select({ balance: coinBalancesTable.balance }).from(coinBalancesTable).where(eq(coinBalancesTable.userId, userId)).limit(1);
  const prevBalance = prev?.balance ?? 0;
  await db.insert(coinBalancesTable).values({ userId, balance: 0 })
    .onConflictDoUpdate({ target: [coinBalancesTable.userId], set: { balance: 0 } });
  if (prevBalance > 0) {
    await db.insert(coinTransactionsTable).values({
      userId,
      amount: -prevBalance,
      reason: reason?.trim() || "Yönetici coin sıfırlama",
    });
  }
  await auditLog(req, "coin_reset", userId, { prevBalance, reason });
  res.json({ ok: true, prevBalance });
});

// GET /api/admin/coins/transactions
router.get("/coins/transactions", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 500);
  const offset = Number(req.query.offset ?? 0);

  const txns = await db
    .select({
      id: coinTransactionsTable.id,
      userId: coinTransactionsTable.userId,
      amount: coinTransactionsTable.amount,
      reason: coinTransactionsTable.reason,
      createdAt: coinTransactionsTable.createdAt,
      displayName: profilesTable.displayName,
    })
    .from(coinTransactionsTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, coinTransactionsTable.userId))
    .orderBy(desc(coinTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(coinTransactionsTable);

  res.json({ transactions: txns, total });
});

// ─── Live Users ──────────────────────────────────────────────────────────────

router.get("/live-users", async (_req, res) => {
  const { getLiveUserIds } = await import("../lib/socketio");
  const liveIds = getLiveUserIds();

  if (liveIds.length === 0) {
    res.json({ users: [], count: 0 });
    return;
  }

  const { inArray } = await import("drizzle-orm");
  const profiles = await db
    .select({
      userId: profilesTable.userId,
      displayName: profilesTable.displayName,
      country: profilesTable.country,
      age: profilesTable.age,
      gender: profilesTable.gender,
      photoUrl: profilesTable.photoUrl,
    })
    .from(profilesTable)
    .where(inArray(profilesTable.userId, liveIds));

  res.json({ users: profiles, count: liveIds.length });
});

// ─── Announce ────────────────────────────────────────────────────────────────

router.post("/announce", async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: "text gerekli" }); return; }
  const { broadcastAnnouncement } = await import("../lib/socketio");
  broadcastAnnouncement(text.trim());
  await auditLog(req, "announce", undefined, { text: text.trim().slice(0, 200) });
  res.json({ ok: true });
});

// ─── Matches ─────────────────────────────────────────────────────────────────

router.get("/matches", async (req, res) => {
  const limit = 50;
  const offset = Number(req.query.offset ?? 0);
  const userFilter = typeof req.query.userId === "string" ? req.query.userId.trim() : null;

  const rows = await db.execute(sql`
    SELECT
      mh.id,
      mh.user_a_id as "userAId",
      mh.user_b_id as "userBId",
      pa.display_name as "userAName",
      pb.display_name as "userBName",
      mh.duration_seconds as "durationSeconds",
      mh.started_at as "startedAt",
      mh.ended_at as "endedAt"
    FROM match_history mh
    LEFT JOIN profiles pa ON pa.user_id = mh.user_a_id
    LEFT JOIN profiles pb ON pb.user_id = mh.user_b_id
    ${userFilter ? sql`WHERE mh.user_a_id = ${userFilter} OR mh.user_b_id = ${userFilter}` : sql``}
    ORDER BY mh.started_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRows = await db.execute(sql`
    SELECT count(*)::int as total FROM match_history
    ${userFilter ? sql`WHERE user_a_id = ${userFilter} OR user_b_id = ${userFilter}` : sql``}
  `);

  res.json({ matches: rows.rows, total: (countRows.rows[0] as { total: number }).total });
});

// ─── Roles ──────────────────────────────────────────────────────────────────

router.get("/roles", async (_req, res) => {
  const roles = await db
    .select({
      userId: userRolesTable.userId,
      role: userRolesTable.role,
      displayName: profilesTable.displayName,
    })
    .from(userRolesTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, userRolesTable.userId))
    .where(eq(userRolesTable.role, "admin"));
  res.json({ roles });
});

router.post("/roles", async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  await db.insert(userRolesTable).values({ userId, role: "admin" }).onConflictDoNothing();
  await auditLog(req, "role_grant", userId);
  res.json({ ok: true });
});

router.delete("/roles/:userId", async (req, res) => {
  const userId = String(req.params.userId);
  await db.delete(userRolesTable).where(
    and(eq(userRolesTable.userId, userId), eq(userRolesTable.role, "admin")),
  );
  await auditLog(req, "role_revoke", userId);
  res.json({ ok: true });
});

// ─── Email ───────────────────────────────────────────────────────────────────

router.post("/email/send", async (req, res) => {
  const { userId, subject, body } = req.body as { userId?: string; subject?: string; body?: string };
  if (!userId || !subject?.trim() || !body?.trim()) {
    res.status(400).json({ error: "userId, subject ve body gerekli" });
    return;
  }
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user?.email) { res.status(404).json({ error: "Kullanıcı veya e-posta bulunamadı" }); return; }
  const { sendAdminEmail } = await import("../lib/email");
  await sendAdminEmail(user.email, subject.trim(), body.trim());
  await auditLog(req, "email_send", userId, { subject: subject.trim() });
  res.json({ ok: true });
});

// ─── Audit Log ──────────────────────────────────────────────────────────────

router.get("/audit-log", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  const logs = await db
    .select({
      id: adminAuditLogsTable.id,
      adminId: adminAuditLogsTable.adminId,
      action: adminAuditLogsTable.action,
      targetUserId: adminAuditLogsTable.targetUserId,
      details: adminAuditLogsTable.details,
      ip: adminAuditLogsTable.ip,
      createdAt: adminAuditLogsTable.createdAt,
      adminName: profilesTable.displayName,
    })
    .from(adminAuditLogsTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, adminAuditLogsTable.adminId))
    .orderBy(desc(adminAuditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(adminAuditLogsTable);

  res.json({ logs, total });
});

// ─── Revenue ────────────────────────────────────────────────────────────────

router.get("/revenue", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 30), 7), 90);

  const purchaseStatsResult = await db.execute(sql`
    SELECT count(*)::int as total_purchases,
           coalesce(sum(amount),0)::int as total_coins_sold
    FROM coin_transactions
    WHERE reason LIKE '%Stripe%'
  `);

  const dailyPurchases = await db.execute(sql`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           count(*)::int AS purchases,
           coalesce(sum(amount),0)::int AS coins
    FROM coin_transactions
    WHERE reason LIKE '%Stripe%'
      AND created_at >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY day ORDER BY day
  `);

  const topBuyers = await db.execute(sql`
    SELECT ct.user_id as "userId", p.display_name as "displayName",
           count(*)::int as purchases,
           coalesce(sum(ct.amount),0)::int as "totalCoins"
    FROM coin_transactions ct
    LEFT JOIN profiles p ON p.user_id = ct.user_id
    WHERE ct.reason LIKE '%Stripe%'
    GROUP BY ct.user_id, p.display_name
    ORDER BY purchases DESC
    LIMIT 10
  `);

  const row = purchaseStatsResult.rows[0] as { total_purchases: number; total_coins_sold: number } | undefined;
  res.json({
    totalPurchases: row?.total_purchases ?? 0,
    totalCoinsSold: row?.total_coins_sold ?? 0,
    dailyPurchases: dailyPurchases.rows,
    topBuyers: topBuyers.rows,
  });
});

// ─── Photo Moderation ────────────────────────────────────────────────────────

router.get("/photos", async (_req, res) => {
  const photos = await db
    .select({
      userId: profilesTable.userId,
      displayName: profilesTable.displayName,
      photoUrl: profilesTable.photoUrl,
      country: profilesTable.country,
      age: profilesTable.age,
      gender: profilesTable.gender,
    })
    .from(profilesTable)
    .where(sql`${profilesTable.photoUrl} IS NOT NULL AND ${profilesTable.photoUrl} != ''`)
    .orderBy(desc(profilesTable.userId))
    .limit(300);
  res.json({ photos });
});

router.delete("/photos/:userId", async (req, res) => {
  await db.update(profilesTable).set({ photoUrl: null }).where(eq(profilesTable.userId, req.params.userId));
  await auditLog(req, "photo_clear", req.params.userId);
  res.json({ ok: true });
});

// ─── Gifts Stats ─────────────────────────────────────────────────────────────

router.get("/gifts/stats", async (_req, res) => {
  const totalsResult = await db.execute(sql`
    SELECT count(*)::int as total_gifts,
           coalesce(sum(ABS(amount)),0)::int as total_coins_gifted
    FROM coin_transactions
    WHERE amount < 0
      AND (reason LIKE '%hediye%' OR reason LIKE '%gift%' OR reason LIKE '%🎁%')
  `);

  const topSenders = await db.execute(sql`
    SELECT ct.user_id as "userId", p.display_name as "displayName",
           count(*)::int as gifts,
           coalesce(sum(ABS(ct.amount)),0)::int as "totalCoins"
    FROM coin_transactions ct
    LEFT JOIN profiles p ON p.user_id = ct.user_id
    WHERE ct.amount < 0
      AND (ct.reason LIKE '%hediye%' OR ct.reason LIKE '%gift%' OR ct.reason LIKE '%🎁%')
    GROUP BY ct.user_id, p.display_name
    ORDER BY gifts DESC LIMIT 10
  `);

  const topReceivers = await db.execute(sql`
    SELECT ct.user_id as "userId", p.display_name as "displayName",
           count(*)::int as gifts,
           coalesce(sum(ct.amount),0)::int as "totalCoins"
    FROM coin_transactions ct
    LEFT JOIN profiles p ON p.user_id = ct.user_id
    WHERE ct.amount > 0
      AND (ct.reason LIKE '%hediye%' OR ct.reason LIKE '%gift%' OR ct.reason LIKE '%🎁%')
    GROUP BY ct.user_id, p.display_name
    ORDER BY gifts DESC LIMIT 10
  `);

  const dailyGifts = await db.execute(sql`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           count(*)::int AS gifts
    FROM coin_transactions
    WHERE amount < 0
      AND (reason LIKE '%hediye%' OR reason LIKE '%gift%' OR reason LIKE '%🎁%')
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY day ORDER BY day
  `);

  const t = totalsResult.rows[0] as { total_gifts: number; total_coins_gifted: number } | undefined;
  res.json({
    totalGifts: t?.total_gifts ?? 0,
    totalCoinsGifted: t?.total_coins_gifted ?? 0,
    topSenders: topSenders.rows,
    topReceivers: topReceivers.rows,
    dailyGifts: dailyGifts.rows,
  });
});

// ─── Retention ───────────────────────────────────────────────────────────────

router.get("/retention", async (_req, res) => {
  const dau = await db.execute(sql`
    SELECT count(DISTINCT user_a_id)::int AS count
    FROM match_history WHERE started_at >= date_trunc('day', NOW())
  `);
  const wau = await db.execute(sql`
    SELECT count(DISTINCT user_a_id)::int AS count
    FROM match_history WHERE started_at >= NOW() - INTERVAL '7 days'
  `);
  const mau = await db.execute(sql`
    SELECT count(DISTINCT user_a_id)::int AS count
    FROM match_history WHERE started_at >= NOW() - INTERVAL '30 days'
  `);

  const newUsersByDay = await db.execute(sql`
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
           count(*)::int as count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY day ORDER BY day
  `);

  const activeByDay = await db.execute(sql`
    SELECT date_trunc('day', started_at AT TIME ZONE 'UTC')::date AS day,
           count(DISTINCT user_a_id)::int as count
    FROM match_history
    WHERE started_at >= NOW() - INTERVAL '30 days'
    GROUP BY day ORDER BY day
  `);

  const avgMatchDuration = await db.execute(sql`
    SELECT coalesce(avg(duration_seconds)::int, 0) AS avg_secs
    FROM match_history WHERE duration_seconds IS NOT NULL
  `);

  const avgRow = avgMatchDuration.rows[0] as { avg_secs: number } | undefined;

  res.json({
    dau: (dau.rows[0] as { count: number })?.count ?? 0,
    wau: (wau.rows[0] as { count: number })?.count ?? 0,
    mau: (mau.rows[0] as { count: number })?.count ?? 0,
    avgMatchDurationSecs: avgRow?.avg_secs ?? 0,
    newUsersByDay: newUsersByDay.rows,
    activeByDay: activeByDay.rows,
  });
});

// ─── Pending Tasks Summary ────────────────────────────────────────────────────

router.get("/pending", async (_req, res) => {
  const [{ openReports }] = await db
    .select({ openReports: sql<number>`count(*)::int` })
    .from(userReportsTable).where(eq(userReportsTable.status, "open"));

  const [{ activeBans }] = await db
    .select({ activeBans: sql<number>`count(*)::int` })
    .from(userBansTable)
    .where(sql`${userBansTable.expiresAt} IS NULL OR ${userBansTable.expiresAt} > NOW()`);

  const [{ newUsersToday }] = await db
    .select({ newUsersToday: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(sql`${usersTable.createdAt} >= date_trunc('day', NOW())`);

  const [{ matchesToday }] = await db
    .select({ matchesToday: sql<number>`count(*)::int` })
    .from(matchHistoryTable)
    .where(sql`${matchHistoryTable.startedAt} >= date_trunc('day', NOW())`);

  const [{ purchasesToday }] = await db
    .select({ purchasesToday: sql<number>`count(*)::int` })
    .from(coinTransactionsTable)
    .where(sql`${coinTransactionsTable.reason} LIKE '%Stripe%' AND ${coinTransactionsTable.createdAt} >= date_trunc('day', NOW())`);

  res.json({ openReports, activeBans, newUsersToday, matchesToday, purchasesToday });
});

// ─── Coin Packages ────────────────────────────────────────────────────────────

const adminCoinPackages = [
  { id: "pkg_450",   coins: 450,   price: 129,  label: "Başlangıç" },
  { id: "pkg_1800",  coins: 1800,  price: 479,  label: "Temel" },
  { id: "pkg_3500",  coins: 3500,  price: 883,  label: "Orta" },
  { id: "pkg_7000",  coins: 7000,  price: 1675, label: "Büyük" },
  { id: "pkg_15000", coins: 15000, price: 3528, label: "Süper" },
  { id: "pkg_35000", coins: 35000, price: 8048, label: "Mega" },
];

router.get("/packages", async (_req, res) => {
  res.json({ packages: adminCoinPackages });
});

router.put("/packages/:id", async (req, res) => {
  const pkg = adminCoinPackages.find((p) => p.id === req.params.id);
  if (!pkg) { res.status(404).json({ error: "Paket bulunamadı" }); return; }
  const { coins, price, label } = req.body as { coins?: number; price?: number; label?: string };
  if (coins && coins > 0) pkg.coins = coins;
  if (price && price > 0) pkg.price = price;
  if (label?.trim()) pkg.label = label.trim();
  await auditLog(req, "package_update", undefined, { id: req.params.id, coins, price, label });
  res.json({ ok: true, package: pkg });
});

// ─── System Health ────────────────────────────────────────────────────────────

router.get("/health", async (_req, res) => {
  const { getLiveUserIds } = await import("../lib/socketio");
  const liveCount = getLiveUserIds().length;

  let dbOk = false;
  let dbLatencyMs = 0;
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - start;
    dbOk = true;
  } catch { /* db down */ }

  const mem = process.memoryUsage();
  res.json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    liveUsers: liveCount,
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    memory: {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
    },
  });
});

// ─── Broadcaster Admin Routes ────────────────────────────────────────────────

// GET /api/admin/broadcasters — tüm yayıncılar
router.get("/broadcasters", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      bp.user_id          AS "userId",
      bp.full_name        AS "fullName",
      bp.iban,
      bp.bank_name        AS "bankName",
      bp.coin_rate_kurus  AS "coinRateKurus",
      bp.platform_cut_percent AS "platformCutPercent",
      bp.is_active        AS "isActive",
      bp.notes,
      bp.created_at       AS "createdAt",
      p.display_name      AS "displayName",
      p.photo_url         AS "photoUrl",
      COALESCE((
        SELECT SUM(ct.amount) FROM coin_transactions ct
        WHERE ct.user_id = bp.user_id
          AND ct.amount > 0
          AND (ct.reason LIKE '%hediye%' OR ct.reason LIKE '%gift%' OR ct.reason LIKE '%🎁%')
          AND ct.created_at >= date_trunc('week', NOW())
      ), 0)::int           AS "coinsThisWeek",
      COALESCE((
        SELECT SUM(ct.amount) FROM coin_transactions ct
        WHERE ct.user_id = bp.user_id
          AND ct.amount > 0
          AND (ct.reason LIKE '%hediye%' OR ct.reason LIKE '%gift%' OR ct.reason LIKE '%🎁%')
      ), 0)::int           AS "totalCoins"
    FROM broadcaster_profiles bp
    LEFT JOIN profiles p ON p.user_id = bp.user_id
    ORDER BY bp.created_at DESC
  `);
  res.json({ broadcasters: rows.rows });
});

// POST /api/admin/broadcasters — yeni yayıncı ekle
router.post("/broadcasters", async (req, res) => {
  const { userId, fullName, iban, bankName, coinRateKurus, platformCutPercent, notes } =
    req.body as { userId: string; fullName: string; iban: string; bankName?: string; coinRateKurus?: number; platformCutPercent?: number; notes?: string };

  if (!userId?.trim() || !fullName?.trim() || !iban?.trim()) {
    res.status(400).json({ error: "userId, fullName, iban zorunlu" }); return;
  }

  const ibanClean = iban.replace(/\s/g, "").toUpperCase();

  await db.insert(broadcasterProfilesTable).values({
    userId: userId.trim(),
    fullName: fullName.trim(),
    iban: ibanClean,
    bankName: bankName?.trim() ?? null,
    coinRateKurus: coinRateKurus ?? 5,
    platformCutPercent: platformCutPercent ?? 50,
    notes: notes?.trim() ?? null,
  }).onConflictDoUpdate({
    target: broadcasterProfilesTable.userId,
    set: {
      fullName: fullName.trim(),
      iban: ibanClean,
      bankName: bankName?.trim() ?? null,
      coinRateKurus: coinRateKurus ?? 5,
      platformCutPercent: platformCutPercent ?? 50,
      notes: notes?.trim() ?? null,
      updatedAt: new Date(),
    },
  });

  // Eğer broadcaster rolü yoksa ekle
  const [existing] = await db.select().from(userRolesTable)
    .where(and(eq(userRolesTable.userId, userId.trim()), eq(userRolesTable.role, "broadcaster")));
  if (!existing) {
    await db.insert(userRolesTable).values({ userId: userId.trim(), role: "broadcaster" });
  }

  await auditLog(req, "broadcaster_add", userId.trim(), { fullName, iban: ibanClean });
  res.json({ ok: true });
});

// PATCH /api/admin/broadcasters/:userId — güncelle
router.patch("/broadcasters/:userId", async (req, res) => {
  const { userId } = req.params;
  const { fullName, iban, bankName, coinRateKurus, platformCutPercent, isActive, notes } =
    req.body as { fullName?: string; iban?: string; bankName?: string; coinRateKurus?: number; platformCutPercent?: number; isActive?: boolean; notes?: string };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (fullName !== undefined) updates.fullName = fullName.trim();
  if (iban !== undefined) updates.iban = iban.replace(/\s/g, "").toUpperCase();
  if (bankName !== undefined) updates.bankName = bankName.trim();
  if (coinRateKurus !== undefined) updates.coinRateKurus = coinRateKurus;
  if (platformCutPercent !== undefined) updates.platformCutPercent = platformCutPercent;
  if (isActive !== undefined) updates.isActive = isActive;
  if (notes !== undefined) updates.notes = notes.trim();

  await db.update(broadcasterProfilesTable).set(updates).where(eq(broadcasterProfilesTable.userId, userId));
  await auditLog(req, "broadcaster_update", userId, updates);
  res.json({ ok: true });
});

// POST /api/admin/broadcasters/earnings/calculate — haftalık kazanç hesapla
router.post("/broadcasters/earnings/calculate", async (req, res) => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Pazar
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const broadcasters = await db.select().from(broadcasterProfilesTable).where(eq(broadcasterProfilesTable.isActive, true));

  let created = 0;
  for (const bc of broadcasters) {
    const coinResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::int AS coins
      FROM coin_transactions
      WHERE user_id = ${bc.userId}
        AND amount > 0
        AND (reason LIKE '%hediye%' OR reason LIKE '%gift%' OR reason LIKE '%🎁%')
        AND created_at BETWEEN ${weekStart.toISOString()} AND ${weekEnd.toISOString()}
    `);
    const coins = (coinResult.rows[0] as { coins: number })?.coins ?? 0;
    if (coins === 0) continue;

    const netRate = bc.coinRateKurus * (1 - bc.platformCutPercent / 100);
    const totalTlKurus = Math.floor(coins * netRate);

    // Eğer bu hafta için zaten kayıt varsa atla
    const [existing] = await db.select().from(broadcasterEarningsTable)
      .where(and(
        eq(broadcasterEarningsTable.broadcasterId, bc.userId),
        eq(broadcasterEarningsTable.weekStart, weekStart),
      )).limit(1);

    if (!existing) {
      await db.insert(broadcasterEarningsTable).values({
        broadcasterId: bc.userId,
        weekStart,
        weekEnd,
        totalCoins: coins,
        totalTlKurus,
        status: "pending",
      });
      created++;
    }
  }

  await auditLog(req, "earnings_calculate", undefined, { week: weekStart.toISOString(), created });
  res.json({ ok: true, created, weekStart: weekStart.toISOString() });
});

// GET /api/admin/broadcasters/earnings — tüm kazanç kayıtları
router.get("/broadcasters/earnings", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;

  const rows = await db.execute(sql`
    SELECT
      be.id,
      be.broadcaster_id   AS "broadcasterId",
      be.week_start       AS "weekStart",
      be.week_end         AS "weekEnd",
      be.total_coins      AS "totalCoins",
      be.total_tl_kurus   AS "totalTlKurus",
      be.status,
      be.paid_at          AS "paidAt",
      be.payment_note     AS "paymentNote",
      bp.full_name        AS "fullName",
      bp.iban,
      bp.bank_name        AS "bankName"
    FROM broadcaster_earnings be
    JOIN broadcaster_profiles bp ON bp.user_id = be.broadcaster_id
    ${status ? sql`WHERE be.status = ${status}` : sql``}
    ORDER BY be.week_start DESC, be.total_tl_kurus DESC
    LIMIT 200
  `);
  res.json({ earnings: rows.rows });
});

// POST /api/admin/broadcasters/earnings/:id/pay — ödeme onayla
router.post("/broadcasters/earnings/:id/pay", async (req, res) => {
  const id = Number(req.params.id);
  const { note } = req.body as { note?: string };

  await db.update(broadcasterEarningsTable)
    .set({ status: "paid", paidAt: new Date(), paymentNote: note?.trim() ?? null, updatedAt: new Date() })
    .where(eq(broadcasterEarningsTable.id, id));

  await auditLog(req, "earnings_pay", undefined, { earningsId: id, note });
  res.json({ ok: true });
});

// POST /api/admin/broadcasters/earnings/:id/cancel — iptal et
router.post("/broadcasters/earnings/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  await db.update(broadcasterEarningsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(broadcasterEarningsTable.id, id));
  await auditLog(req, "earnings_cancel", undefined, { earningsId: id });
  res.json({ ok: true });
});

export default router;
