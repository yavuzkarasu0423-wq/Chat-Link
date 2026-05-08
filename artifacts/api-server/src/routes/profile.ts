import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { profilesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendWelcomeEmail } from "../lib/email";

const router = Router();

const upsertSchema = z.object({
  displayName: z.string().min(1).max(64),
  age: z.number().int().min(18, { message: "18 yaşından büyük olmanız gerekmektedir" }).max(120),
  gender: z.string().min(1),
  country: z.string().min(1),
  bio: z.string().max(500).optional(),
  interests: z.array(z.string()).optional(),
  photoUrl: z.string().max(2_000_000).optional().nullable(),
});

// Bug 1 fix: /me alias — Landing.tsx calls /api/profile/me
router.get(["/", "/me"], requireAuth, async (req, res) => {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, req.userId!))
    .limit(1);
  if (!profile) {
    res.status(404).json({ error: "No profile" });
    return;
  }
  res.json({ profile });
});

router.put(["/", "/me"], requireAuth, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }
  const data = parsed.data;

  const [existing] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.userId, req.userId!))
    .limit(1);
  const isNew = !existing;

  const [profile] = await db
    .insert(profilesTable)
    .values({
      userId: req.userId!,
      displayName: data.displayName,
      age: data.age,
      gender: data.gender,
      country: data.country,
      bio: data.bio ?? null,
      interests: data.interests ?? [],
      photoUrl: data.photoUrl ?? null,
    })
    .onConflictDoUpdate({
      target: profilesTable.userId,
      set: {
        displayName: data.displayName,
        age: data.age,
        gender: data.gender,
        country: data.country,
        bio: data.bio ?? null,
        interests: data.interests ?? [],
        photoUrl: data.photoUrl ?? null,
      },
    })
    .returning();

  if (isNew) {
    void (async () => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
      if (user?.email) {
        await sendWelcomeEmail(user.email, data.displayName);
      }
    })();
  }

  res.json({ profile });
});

// Herkese açık profil — video görüşmede partner profili çekmek için
router.get("/:userId", requireAuth, async (req, res) => {
  const userId = String(req.params.userId);
  const [profile] = await db
    .select({
      displayName: profilesTable.displayName,
      age: profilesTable.age,
      gender: profilesTable.gender,
      country: profilesTable.country,
      interests: profilesTable.interests,
      photoUrl: profilesTable.photoUrl,
    })
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  if (!profile) {
    res.status(404).json({ error: "No profile" });
    return;
  }
  res.json({ profile });
});

export default router;
