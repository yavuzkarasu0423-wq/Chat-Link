import { pgTable, serial, varchar, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const adminAuditLogsTable = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 64 }).notNull(),
  targetUserId: varchar("target_user_id"),
  details: jsonb("details"),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminAuditLog = typeof adminAuditLogsTable.$inferSelect;
