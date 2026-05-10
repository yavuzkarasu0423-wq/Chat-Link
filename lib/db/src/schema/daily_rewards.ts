import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const dailyRewardsTable = pgTable("daily_rewards", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  totalClaimed: integer("total_claimed").notNull().default(0),
  lastClaimedAt: timestamp("last_claimed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DailyReward = typeof dailyRewardsTable.$inferSelect;

// 7-day reward ladder (resets after day 7)
export const DAILY_REWARD_LADDER = [10, 20, 30, 50, 80, 120, 200] as const;

export function rewardForStreak(streak: number): number {
  const idx = ((streak - 1) % DAILY_REWARD_LADDER.length + DAILY_REWARD_LADDER.length) % DAILY_REWARD_LADDER.length;
  return DAILY_REWARD_LADDER[idx];
}
