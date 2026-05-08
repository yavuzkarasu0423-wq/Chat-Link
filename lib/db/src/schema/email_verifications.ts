import { pgTable, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const emailVerificationsTable = pgTable("email_verifications", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  email: varchar("email").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  verified: boolean("verified").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailVerification = typeof emailVerificationsTable.$inferSelect;
