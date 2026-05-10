import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

const router = Router();

const registerSchema = z.object({
  token: z.string().min(10).max(256),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

// POST /api/push/register — store an Expo push token for the current user
router.post("/register", requireAuth, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const { token, platform } = parsed.data;
  await db
    .insert(pushTokensTable)
    .values({
      token,
      userId: req.userId!,
      platform: platform ?? "unknown",
    })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: {
        userId: req.userId!,
        platform: platform ?? "unknown",
        updatedAt: new Date(),
      },
    });
  res.json({ ok: true });
});

const unregisterSchema = z.object({ token: z.string().min(10).max(256) });

// POST /api/push/unregister — remove a token (on logout)
router.post("/unregister", requireAuth, async (req, res) => {
  const parsed = unregisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  await db
    .delete(pushTokensTable)
    .where(
      and(
        eq(pushTokensTable.token, parsed.data.token),
        eq(pushTokensTable.userId, req.userId!),
      ),
    );
  res.json({ ok: true });
});

export default router;
