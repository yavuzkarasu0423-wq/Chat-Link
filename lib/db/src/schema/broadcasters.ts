import { pgTable, varchar, integer, text, timestamp, serial, boolean, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const broadcasterProfilesTable = pgTable("broadcaster_profiles", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  iban: varchar("iban", { length: 34 }).notNull(),
  bankName: varchar("bank_name", { length: 100 }),
  coinRateKurus: integer("coin_rate_kurus").notNull().default(5),
  platformCutPercent: integer("platform_cut_percent").notNull().default(50),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const broadcasterEarningsTable = pgTable("broadcaster_earnings", {
  id: serial("id").primaryKey(),
  broadcasterId: varchar("broadcaster_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
  weekEnd: timestamp("week_end", { withTimezone: true }).notNull(),
  totalCoins: integer("total_coins").notNull().default(0),
  totalTlKurus: integer("total_tl_kurus").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentNote: text("payment_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BroadcasterProfile = typeof broadcasterProfilesTable.$inferSelect;
export type BroadcasterEarnings = typeof broadcasterEarningsTable.$inferSelect;
