import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  subscriptionsTable,
  coinBalancesTable,
  coinTransactionsTable,
  usersTable,
  processedStripeEventsTable,
  VIP_PLANS,
  isVipActive,
  type VipPlan,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();
const STRIPE_KEY = process.env["STRIPE_SECRET_KEY"];
const WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"];

// GET /api/subscription/plans — public list of plans
router.get("/plans", (_req, res) => {
  res.json({ plans: Object.values(VIP_PLANS), stripeEnabled: Boolean(STRIPE_KEY) });
});

// GET /api/subscription/me — current user's VIP status
router.get("/me", requireAuth, async (req, res) => {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, req.userId!))
    .limit(1);
  const active = isVipActive(sub);
  res.json({
    active,
    plan: active ? (sub?.plan as VipPlan) : null,
    status: sub?.status ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
  });
});

// POST /api/subscription/checkout — create a Stripe Checkout session for the chosen plan
router.post("/checkout", requireAuth, async (req, res) => {
  if (!STRIPE_KEY) {
    res.status(503).json({ error: "VIP üyelik henüz aktif değil. Lütfen daha sonra tekrar deneyin." });
    return;
  }
  const planId = String(req.body?.plan ?? "") as VipPlan;
  const plan = VIP_PLANS[planId];
  if (!plan) {
    res.status(400).json({ error: "Geçersiz plan" });
    return;
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_KEY);

    const domains = process.env["REPLIT_DOMAINS"]?.split(",") ?? [];
    const baseUrl = domains[0] ? `https://${domains[0]}` : "http://localhost:80";
    const basePath = process.env["BASE_PATH"] ?? "";

    // Find or create stripe customer
    const [existingSub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, req.userId!))
      .limit(1);
    let customerId = existingSub?.stripeCustomerId ?? undefined;
    if (!customerId) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        metadata: { userId: req.userId! },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "try",
            recurring: { interval: "month" },
            product_data: {
              name: `${plan.name} — 1v1 Chat`,
              description: plan.perks.join(" • "),
            },
            unit_amount: plan.priceTry * 100,
          },
          quantity: 1,
        },
      ],
      metadata: { userId: req.userId!, plan: plan.id },
      subscription_data: {
        metadata: { userId: req.userId!, plan: plan.id },
      },
      success_url: `${baseUrl}${basePath}?vip_success=1&plan=${plan.id}`,
      cancel_url: `${baseUrl}${basePath}?vip_cancel=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "VIP checkout failed");
    res.status(500).json({ error: "VIP ödeme oturumu oluşturulamadı" });
  }
});

// POST /api/subscription/cancel — cancel at period end
router.post("/cancel", requireAuth, async (req, res) => {
  if (!STRIPE_KEY) {
    res.status(503).json({ error: "Stripe devre dışı" });
    return;
  }
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, req.userId!))
    .limit(1);
  if (!sub?.stripeSubscriptionId) {
    res.status(404).json({ error: "Aktif abonelik bulunamadı" });
    return;
  }
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_KEY);
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "VIP cancel failed");
    res.status(500).json({ error: "İptal başarısız" });
  }
});

// Helper to apply a successful subscription event to DB.
// All writes (subscription upsert + monthly-coin grant + history + last-given timestamp)
// happen in a single transaction so partial failures cannot leave inconsistent state.
async function applyActiveSubscription(opts: {
  userId: string;
  plan: VipPlan;
  customerId: string;
  subscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
}) {
  const planDef = VIP_PLANS[opts.plan];
  if (!planDef) return;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, opts.userId))
      .limit(1);

    await tx
      .insert(subscriptionsTable)
      .values({
        userId: opts.userId,
        plan: opts.plan,
        status: opts.status,
        stripeCustomerId: opts.customerId,
        stripeSubscriptionId: opts.subscriptionId,
        currentPeriodEnd: opts.currentPeriodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: {
          plan: opts.plan,
          status: opts.status,
          stripeCustomerId: opts.customerId,
          stripeSubscriptionId: opts.subscriptionId,
          currentPeriodEnd: opts.currentPeriodEnd,
        },
      });

    const lastGiven = existing?.monthlyCoinsLastGivenAt;
    const shouldAward = !lastGiven || Date.now() - lastGiven.getTime() > 28 * 24 * 60 * 60 * 1000;
    if (shouldAward && planDef.monthlyCoins > 0) {
      await tx
        .insert(coinBalancesTable)
        .values({ userId: opts.userId, balance: planDef.monthlyCoins })
        .onConflictDoUpdate({
          target: coinBalancesTable.userId,
          set: { balance: sql`${coinBalancesTable.balance} + ${planDef.monthlyCoins}` },
        });
      await tx.insert(coinTransactionsTable).values({
        userId: opts.userId,
        amount: planDef.monthlyCoins,
        reason: `👑 ${planDef.name} aylık coin (+${planDef.monthlyCoins})`,
      });
      await tx
        .update(subscriptionsTable)
        .set({ monthlyCoinsLastGivenAt: new Date() })
        .where(eq(subscriptionsTable.userId, opts.userId));
    }
  });
}

/**
 * Idempotency: try to record this Stripe event id. Returns true the first time,
 * false if Stripe re-delivered the same event (do not re-process).
 */
async function markEventProcessed(eventId: string, eventType: string): Promise<boolean> {
  const inserted = await db
    .insert(processedStripeEventsTable)
    .values({ eventId, eventType })
    .onConflictDoNothing({ target: processedStripeEventsTable.eventId })
    .returning({ eventId: processedStripeEventsTable.eventId });
  return inserted.length > 0;
}

// POST /api/subscription/webhook — Stripe subscription events
// NOTE: app.ts mounts express.raw() on this path BEFORE express.json() so req.body is a Buffer.
const webhookHandler = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  if (!STRIPE_KEY || !WEBHOOK_SECRET) {
    res.status(503).json({ error: "Webhook devre dışı" });
    return;
  }
  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    res.status(400).json({ error: "Missing signature" });
    return;
  }
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_KEY);
    const event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      WEBHOOK_SECRET,
    );

    // Idempotency: only process each Stripe event id once
    const fresh = await markEventProcessed(event.id, event.type);
    if (!fresh) {
      res.json({ received: true, duplicate: true });
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const userId = session.metadata?.["userId"];
        const plan = session.metadata?.["plan"] as VipPlan | undefined;
        if (userId && plan && VIP_PLANS[plan]) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          const periodEndUnix =
            (sub as unknown as { current_period_end?: number }).current_period_end ??
            Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
          await applyActiveSubscription({
            userId,
            plan,
            customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? "",
            subscriptionId: subId,
            status: sub.status,
            currentPeriodEnd: new Date(periodEndUnix * 1000),
          });
        }
      }
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created"
    ) {
      const sub = event.data.object;
      const userId = sub.metadata?.["userId"];
      const plan = sub.metadata?.["plan"] as VipPlan | undefined;
      if (userId && plan && VIP_PLANS[plan]) {
        const periodEndUnix =
          (sub as unknown as { current_period_end?: number }).current_period_end ??
          Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        await applyActiveSubscription({
          userId,
          plan,
          customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          subscriptionId: sub.id,
          status: sub.status,
          currentPeriodEnd: new Date(periodEndUnix * 1000),
        });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const userId = sub.metadata?.["userId"];
      if (userId) {
        await db
          .update(subscriptionsTable)
          .set({ status: "canceled" })
          .where(eq(subscriptionsTable.userId, userId));
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err }, "VIP webhook failed");
    res.status(400).json({ error: "Webhook doğrulama başarısız" });
  }
};

router.post("/webhook", webhookHandler);

export default router;
