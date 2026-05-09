import { pgTable, serial, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Referral records. Each referred user has at most one row (referredId UNIQUE).
 * The referral code is simply the referrer's user id, so no extra "code" column
 * is required.
 */
export const referralsTable = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerId: varchar("referrer_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    referredId: varchar("referred_id")
      .notNull()
      .unique()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    coinsAwarded: integer("coins_awarded").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("referrals_referrer_idx").on(table.referrerId)],
);

export type Referral = typeof referralsTable.$inferSelect;

/** Both sides receive this many coins on a successful referral claim. */
export const REFERRAL_REWARD_COINS = 100;
