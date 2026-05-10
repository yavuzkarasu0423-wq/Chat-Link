import { pgTable, varchar, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Profile visits — used by the "Beni kim ziyaret etti?" feature (VIP perk).
 * Unique on (visitorId, profileId) so repeat visits update the timestamp/count
 * instead of producing one row per page-view.
 */
export const profileVisitsTable = pgTable(
  "profile_visits",
  {
    visitorId: varchar("visitor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    visitCount: integer("visit_count").notNull().default(1),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("profile_visits_pair_uniq").on(table.visitorId, table.profileId),
    index("profile_visits_profile_idx").on(table.profileId, table.lastVisitedAt),
  ],
);

export type ProfileVisit = typeof profileVisitsTable.$inferSelect;
