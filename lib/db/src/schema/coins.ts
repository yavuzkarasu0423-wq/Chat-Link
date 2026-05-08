import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const coinBalancesTable = pgTable("coin_balances", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(100),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CoinBalance = typeof coinBalancesTable.$inferSelect;
