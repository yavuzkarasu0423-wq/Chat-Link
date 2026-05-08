import { pgTable, varchar, serial, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const userBansTable = pgTable(
  "user_bans",
  {
    id: serial("id").primaryKey(),
    blockerId: varchar("blocker_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: varchar("blocked_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_block_pair").on(table.blockerId, table.blockedId),
    index("idx_block_blocker").on(table.blockerId),
  ],
);

export type UserBan = typeof userBansTable.$inferSelect;
