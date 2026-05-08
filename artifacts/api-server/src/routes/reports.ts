import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { userReportsTable } from "@workspace/db/schema";
import { z } from "zod";

const router = Router();

const reportSchema = z.object({
  reportedUserId: z.string(),
  reason: z.string().min(1).max(64),
  notes: z.string().max(1000).optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  await db.insert(userReportsTable).values({
    reporterId: req.userId!,
    reportedId: parsed.data.reportedUserId,
    reason: parsed.data.reason,
    notes: parsed.data.notes ?? null,
  });
  res.json({ ok: true });
});

export default router;
