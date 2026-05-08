import { pgTable, varchar, serial, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const friendshipsTable = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    requesterId: varchar("requester_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    addresseeId: varchar("addressee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_friendship_pair").on(table.requesterId, table.addresseeId),
    index("idx_friendship_addressee").on(table.addresseeId, table.status),
    index("idx_friendship_requester").on(table.requesterId, table.status),
  ],
);

export type Friendship = typeof friendshipsTable.$inferSelect;
