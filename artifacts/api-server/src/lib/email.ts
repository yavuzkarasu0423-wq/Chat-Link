import { Resend } from "resend";
import { logger } from "./logger";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!resend) {
  logger.warn("RESEND_API_KEY not set — emails disabled");
}

// Resend ücretsiz planda sadece onboarding@resend.dev'den gönderilebilir.
// Kendi domain'ini doğruladıktan sonra FROM adresini değiştir.
const FROM = "1v1 Chat <onboarding@resend.dev>";

export async function sendWelcomeEmail(to: string, displayName: string) {
  if (!resend || !to) return;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "1v1 Chat'e Hoş Geldin! 🎉",
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:32px 24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:28px">1v1 Chat</h1>
            <p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:15px">Bire Bir Görüntülü Sohbet</p>
          </div>
          <div style="padding:32px 24px">
            <h2 style="color:#111827;margin:0 0 12px">Merhaba, ${displayName}! 👋</h2>
            <p style="color:#6b7280;line-height:1.6;margin:0 0 20px">
              1v1 Chat'e hoş geldin! Artık dünyanın dört bir yanından insanlarla görüntülü sohbet edebilirsin.
            </p>
            <ul style="color:#374151;line-height:2;padding-left:20px;margin:0 0 24px">
              <li>🎥 Anında görüntülü sohbet</li>
              <li>🌍 Ülke ve cinsiyet filtresi</li>
              <li>🎁 Hediye gönder, altın kazan</li>
              <li>👥 Arkadaş edinip DM at</li>
            </ul>
            <a href="https://1v1chat.replit.app" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:14px 28px;border-radius:50px;font-weight:700;font-size:15px">
              Hemen Başla →
            </a>
          </div>
          <div style="padding:16px 24px;background:#f9fafb;text-align:center">
            <p style="color:#9ca3af;font-size:12px;margin:0">1v1 Chat — Güvenli, anonim görüntülü sohbet</p>
          </div>
        </div>
      `,
    });
    logger.info({ to }, "Welcome email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send welcome email");
  }
}

export async function sendDmNotificationEmail(
  to: string,
  fromName: string,
  preview: string,
) {
  if (!resend || !to) return;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${fromName} sana mesaj gönderdi 💬`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">Yeni Mesaj 💬</h1>
          </div>
          <div style="padding:28px 24px">
            <p style="color:#111827;font-size:16px;margin:0 0 12px"><strong>${fromName}</strong> sana mesaj gönderdi:</p>
            <div style="background:#f3f4f6;border-radius:12px;padding:16px;color:#374151;font-style:italic;margin:0 0 24px">
              "${preview.slice(0, 120)}${preview.length > 120 ? "…" : ""}"
            </div>
            <a href="https://1v1chat.replit.app" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 24px;border-radius:50px;font-weight:700">
              Mesajı Gör →
            </a>
          </div>
        </div>
      `,
    });
    logger.info({ to, fromName }, "DM notification email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send DM notification email");
  }
}

export async function sendFriendRequestEmail(
  to: string,
  fromName: string,
) {
  if (!resend || !to) return;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${fromName} arkadaşlık isteği gönderdi 👥`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">Arkadaşlık İsteği 👥</h1>
          </div>
          <div style="padding:28px 24px">
            <p style="color:#111827;font-size:16px;margin:0 0 20px">
              <strong>${fromName}</strong> sana arkadaşlık isteği gönderdi!
            </p>
            <a href="https://1v1chat.replit.app" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 24px;border-radius:50px;font-weight:700">
              İsteği Kabul Et →
            </a>
          </div>
        </div>
      `,
    });
    logger.info({ to, fromName }, "Friend request email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send friend request email");
  }
}

export async function sendAdminEmail(to: string, subject: string, body: string) {
  if (!resend || !to) return;
  const safe = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:20px 24px;border-radius:12px;margin-bottom:20px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:20px">1v1 Chat Yönetim</h1>
        </div>
        <div style="color:#374151;line-height:1.7;font-size:15px">${safe}</div>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb">
          <p style="color:#9ca3af;font-size:12px;margin:0">Bu e-posta 1v1 Chat yöneticileri tarafından gönderilmiştir.</p>
        </div>
      </div>`,
    });
    logger.info({ to, subject }, "Admin email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send admin email");
  }
}

export async function sendVerificationEmail(to: string, code: string) {
  if (!resend || !to) return;
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `1v1 Chat — Doğrulama Kodu: ${code}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">E-posta Doğrulama</h1>
          </div>
          <div style="padding:28px 24px;text-align:center">
            <p style="color:#6b7280;margin:0 0 20px">Aşağıdaki kodu uygulamaya gir:</p>
            <div style="font-size:40px;font-weight:900;letter-spacing:10px;color:#10b981;background:#f0fdf4;border-radius:12px;padding:20px;margin:0 0 20px">
              ${code}
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0">Bu kod 10 dakika geçerlidir. Eğer bu isteği sen yapmadıysan dikkate alma.</p>
          </div>
        </div>
      `,
    });
    logger.info({ to }, "Verification email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send verification email");
  }
}
