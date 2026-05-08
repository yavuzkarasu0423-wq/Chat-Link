import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { emailVerificationsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendVerificationEmail } from "../lib/email";

const router = Router();

function randomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// E-posta doğrulama kodu gönder
router.post("/verify/send", requireAuth, async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçerli bir e-posta adresi gir" });
    return;
  }
  const { email } = parsed.data;
  const code = randomCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 dakika

  await db
    .insert(emailVerificationsTable)
    .values({ userId: req.userId!, email, code, expiresAt })
    .onConflictDoUpdate({
      target: emailVerificationsTable.userId,
      set: { email, code, expiresAt, verified: false },
    });

  await sendVerificationEmail(email, code);
  res.json({ ok: true });
});

// Kodu doğrula
router.post("/verify/confirm", requireAuth, async (req, res) => {
  const parsed = z.object({ code: z.string().length(6) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz kod" });
    return;
  }

  const [row] = await db
    .select()
    .from(emailVerificationsTable)
    .where(eq(emailVerificationsTable.userId, req.userId!))
    .limit(1);

  if (!row || row.code !== parsed.data.code) {
    res.status(400).json({ error: "Kod hatalı" });
    return;
  }
  if (new Date() > row.expiresAt) {
    res.status(400).json({ error: "Kodun süresi dolmuş, tekrar gönder" });
    return;
  }

  // Doğrulandı — kullanıcının e-postasını güncelle
  await db.update(emailVerificationsTable)
    .set({ verified: true })
    .where(eq(emailVerificationsTable.userId, req.userId!));

  await db.update(usersTable)
    .set({ email: row.email })
    .where(eq(usersTable.id, req.userId!));

  res.json({ ok: true, email: row.email });
});

// Doğrulama durumunu sorgula
router.get("/verify/status", requireAuth, async (req, res) => {
  const [row] = await db
    .select()
    .from(emailVerificationsTable)
    .where(eq(emailVerificationsTable.userId, req.userId!))
    .limit(1);
  res.json({ verified: row?.verified ?? false, email: row?.email ?? null });
});

export default router;
