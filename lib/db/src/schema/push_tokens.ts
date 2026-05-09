import { pgTable, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const pushTokensTable = pgTable(
  "push_tokens",
  {
    token: varchar("token", { length: 256 }).primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("push_tokens_user_token_idx").on(table.userId, table.token)],
);

export type PushToken = typeof pushTokensTable.$inferSelect;
