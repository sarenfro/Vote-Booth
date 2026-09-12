import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { members } from "./members";
import { elections } from "./elections";

export const nominationPositionStatusEnum = pgEnum("nomination_position_status", [
  "draft",
  "open",
  "closed",
]);

export const nominationPositions = pgTable("nomination_positions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  cohorts: text("cohorts").array(),
  status: nominationPositionStatusEnum("status").notNull().default("draft"),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  linkedElectionId: integer("linked_election_id").references(() => elections.id),
  createdBy: text("created_by").references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNominationPositionSchema = createInsertSchema(nominationPositions).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertNominationPosition = z.infer<typeof insertNominationPositionSchema>;
export type NominationPosition = typeof nominationPositions.$inferSelect;
