import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { coinTransactionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/history", requireAuth, async (req, res) => {
  const transactions = await db
    .select()
    .from(coinTransactionsTable)
    .where(eq(coinTransactionsTable.userId, req.userId!))
    .orderBy(desc(coinTransactionsTable.createdAt))
    .limit(100);
  res.json({ transactions });
});

export default router;
