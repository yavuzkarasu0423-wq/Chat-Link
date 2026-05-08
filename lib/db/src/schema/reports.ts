import { pgTable, varchar, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const userReportsTable = pgTable(
  "user_reports",
  {
    id: serial("id").primaryKey(),
    reporterId: varchar("reporter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reportedId: varchar("reported_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 64 }).notNull(),
    notes: text("notes"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_report_reported").on(table.reportedId, table.status),
    index("idx_report_reporter").on(table.reporterId),
  ],
);

export type UserReport = typeof userReportsTable.$inferSelect;

export const userRolesTable = pgTable("user_roles", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRole = typeof userRolesTable.$inferSelect;
