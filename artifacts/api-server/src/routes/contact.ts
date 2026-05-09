import { Router } from "express";
import { sendAdminEmail } from "../lib/email";
import { z } from "zod";

const router = Router();

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  message: z.string().min(1).max(2000),
});

router.post("/", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz form verisi" });
    return;
  }
  const { name, email, message } = parsed.data;
  const adminEmail = process.env.ADMIN_EMAIL ?? "support@1v1chat.me";
  try {
    await sendAdminEmail(
      adminEmail,
      `İletişim Formu: ${name}`,
      `Gönderen: ${name}\nE-posta: ${email}\n\nMesaj:\n${message}`,
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Mesaj gönderilemedi" });
  }
});

export default router;
