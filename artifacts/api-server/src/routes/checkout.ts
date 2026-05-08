import { Router } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { coinBalancesTable, coinTransactionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

const COIN_PACKAGES: Record<string, { coins: number; price: number }> = {
  pkg_450:   { coins: 450,   price: 129 },
  pkg_1800:  { coins: 1800,  price: 479 },
  pkg_3500:  { coins: 3500,  price: 883 },
  pkg_7000:  { coins: 7000,  price: 1675 },
  pkg_15000: { coins: 15000, price: 3528 },
  pkg_35000: { coins: 35000, price: 8048 },
};

// POST /api/checkout/session — Stripe Checkout oturumu oluştur
router.post("/session", requireAuth, async (req, res) => {
  if (!STRIPE_KEY) {
    res.status(503).json({ error: "Stripe entegrasyonu henüz aktif değil" });
    return;
  }

  const { packageId } = req.body as { packageId: string };
  const pkg = COIN_PACKAGES[packageId];
  if (!pkg) {
    res.status(400).json({ error: "Geçersiz paket" });
    return;
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_KEY);

    const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
    const baseUrl = domains[0] ? `https://${domains[0]}` : "http://localhost:80";
    const basePath = process.env.BASE_PATH ?? "";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "try",
            product_data: {
              name: `${pkg.coins.toLocaleString()} Coin`,
              description: `1v1 Chat için ${pkg.coins.toLocaleString()} sanal para`,
            },
            unit_amount: pkg.price * 100, // kuruş cinsinden
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.userId!,
        packageId,
        coins: String(pkg.coins),
      },
      success_url: `${baseUrl}${basePath}?stripe_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}${basePath}?stripe_cancel=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: "Ödeme oturumu oluşturulamadı" });
  }
});

// POST /api/checkout/webhook — Stripe webhook (ödeme tamamlandı)
router.post(
  "/webhook",
  (req, _res, next) => {
    // Raw body Stripe imza doğrulama için gerekli — express.json'dan önce çalıştır
    next();
  },
  async (req, res) => {
    if (!STRIPE_KEY) {
      res.status(503).json({ error: "Stripe devre dışı" });
      return;
    }

    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || !sig) {
      res.status(400).json({ error: "Webhook secret eksik" });
      return;
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(STRIPE_KEY);
      const event = stripe.webhooks.constructEvent(req.body as string, sig, webhookSecret);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const coins = Number(session.metadata?.coins ?? 0);

        if (userId && coins > 0) {
          await db
            .insert(coinBalancesTable)
            .values({ userId, balance: coins })
            .onConflictDoUpdate({
              target: coinBalancesTable.userId,
              set: { balance: sql`${coinBalancesTable.balance} + ${coins}` },
            });

          await db.insert(coinTransactionsTable).values({
            userId,
            amount: coins,
            reason: `💳 Stripe satın alma (+${coins.toLocaleString()} coin)`,
          });
        }
      }

      res.json({ received: true });
    } catch {
      res.status(400).json({ error: "Webhook doğrulama başarısız" });
    }
  },
);

// GET /api/checkout/verify?session_id=... — Başarılı ödeme sonrası doğrula
router.get("/verify", requireAuth, async (req, res) => {
  if (!STRIPE_KEY) {
    res.status(503).json({ error: "Stripe devre dışı" });
    return;
  }

  const { session_id } = req.query as { session_id?: string };
  if (!session_id) {
    res.status(400).json({ error: "session_id gerekli" });
    return;
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (
      session.payment_status === "paid" &&
      session.metadata?.userId === req.userId
    ) {
      const coins = Number(session.metadata?.coins ?? 0);
      const [existing] = await db
        .select()
        .from(coinTransactionsTable)
        .where(
          sql`${coinTransactionsTable.reason} LIKE '%' || ${session_id} || '%'`,
        )
        .limit(1);

      if (!existing && coins > 0) {
        await db
          .insert(coinBalancesTable)
          .values({ userId: req.userId!, balance: coins })
          .onConflictDoUpdate({
            target: coinBalancesTable.userId,
            set: { balance: sql`${coinBalancesTable.balance} + ${coins}` },
          });

        await db.insert(coinTransactionsTable).values({
          userId: req.userId!,
          amount: coins,
          reason: `💳 Stripe satın alma [${session_id}]`,
        });
      }

      res.json({ ok: true, coins, alreadyCredited: !!existing });
    } else {
      res.status(402).json({ error: "Ödeme tamamlanmamış" });
    }
  } catch {
    res.status(500).json({ error: "Doğrulama başarısız" });
  }
});

export default router;
