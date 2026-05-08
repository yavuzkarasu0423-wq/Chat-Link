import { pgTable, varchar, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const coinTransactionsTable = pgTable(
  "coin_transactions",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    relatedUserId: varchar("related_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_coin_tx_user").on(table.userId, table.createdAt),
  ],
);

export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;
