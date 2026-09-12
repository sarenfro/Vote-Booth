import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { members } from "./members";
import { nominationPositions } from "./nomination_positions";

export const nominationStatusEnum = pgEnum("nomination_status", [
  "pending",
  "accepted",
  "declined",
]);

export const nominations = pgTable("nominations", {
  id: serial("id").primaryKey(),
  positionId: integer("position_id")
    .notNull()
    .references(() => nominationPositions.id),
  nominatorId: text("nominator_id")
    .notNull()
    .references(() => members.id),
  nomineeId: text("nominee_id")
    .notNull()
    .references(() => members.id),
  reason: text("reason").notNull(),
  revealNominator: boolean("reveal_nominator").notNull().default(false),
  status: nominationStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNominationSchema = createInsertSchema(nominations).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertNomination = z.infer<typeof insertNominationSchema>;
export type Nomination = typeof nominations.$inferSelect;
