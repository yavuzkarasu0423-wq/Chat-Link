import { pgTable, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    userId: varchar("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    plan: varchar("plan", { length: 16 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 64 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 64 }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    monthlyCoinsLastGivenAt: timestamp("monthly_coins_last_given_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("subscriptions_status_idx").on(table.status)],
);

export type Subscription = typeof subscriptionsTable.$inferSelect;

export type VipPlan = "bronze" | "silver" | "gold";

export interface VipPlanDef {
  id: VipPlan;
  name: string;
  priceTry: number;
  monthlyCoins: number;
  perks: string[];
}

export const VIP_PLANS: Record<VipPlan, VipPlanDef> = {
  bronze: {
    id: "bronze",
    name: "Bronz VIP",
    priceTry: 49,
    monthlyCoins: 500,
    perks: [
      "Cinsiyet filtresi ücretsiz",
      "Aylık 500 bedava coin",
      "Bronz rozet 🥉",
      "Reklamsız deneyim",
    ],
  },
  silver: {
    id: "silver",
    name: "Gümüş VIP",
    priceTry: 149,
    monthlyCoins: 2000,
    perks: [
      "Tüm filtreler ücretsiz (cinsiyet + ülke)",
      "Aylık 2.000 bedava coin",
      "Gümüş rozet 🥈",
      "Görünmez mod (online'ken offline görün)",
      "Eşleşmede önceliklendirme",
      "DM'de okundu bilgisini gizle",
    ],
  },
  gold: {
    id: "gold",
    name: "Altın VIP",
    priceTry: 399,
    monthlyCoins: 8000,
    perks: [
      "Tüm filtreler + sınırsız ülke seçimi",
      "Aylık 8.000 bedava coin",
      "Altın rozet 🥇",
      "Görünmez mod",
      "En yüksek eşleşme önceliği",
      "DM okundu/yazıyor gizleme",
      "Sınırsız profil fotoğrafı (yakında)",
      "Profil ziyaretçilerini gör (yakında)",
      "Premium destek",
    ],
  },
};

export function isVipActive(sub: Subscription | undefined | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) return false;
  return true;
}
