import { pgTable, serial, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const matchHistoryTable = pgTable("match_history", {
  id: serial("id").primaryKey(),
  userAId: varchar("user_a_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  userBId: varchar("user_b_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
});

export type MatchHistory = typeof matchHistoryTable.$inferSelect;
