import { pgTable, varchar, serial, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const dmMessagesTable = pgTable(
  "dm_messages",
  {
    id: serial("id").primaryKey(),
    fromUserId: varchar("from_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    toUserId: varchar("to_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** When set, the message renders as a media attachment. Type discriminates the renderer. */
    attachmentUrl: text("attachment_url"),
    attachmentType: varchar("attachment_type", { length: 16 }),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_dm_pair").on(table.fromUserId, table.toUserId, table.createdAt),
    index("idx_dm_to").on(table.toUserId, table.read),
  ],
);

export type DmMessage = typeof dmMessagesTable.$inferSelect;
