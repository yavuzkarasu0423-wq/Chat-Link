import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * Idempotency log for processed Stripe webhook events.
 * The Stripe event id is the primary key; double-delivery becomes a no-op.
 */
export const processedStripeEventsTable = pgTable("processed_stripe_events", {
  eventId: varchar("event_id", { length: 128 }).primaryKey(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProcessedStripeEvent = typeof processedStripeEventsTable.$inferSelect;
