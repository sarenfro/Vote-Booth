import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { members } from "./members";

export const voteTypeEnum = pgEnum("vote_type", [
  "yes_no",
  "plurality",
  "ranked_choice",
  "multi_select",
]);

export const thresholdTypeEnum = pgEnum("threshold_type", [
  "simple_majority",
  "two_thirds",
  "three_quarters",
  "custom",
]);

export const electionStatusEnum = pgEnum("election_status", [
  "draft",
  "open",
  "closed",
]);

export const elections = pgTable("elections", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  voteType: voteTypeEnum("vote_type").notNull(),
  thresholdType: thresholdTypeEnum("threshold_type"),
  thresholdPercent: numeric("threshold_percent", { precision: 5, scale: 2 }),
  quorumCount: integer("quorum_count"),
  eligibleVoterCount: integer("eligible_voter_count"),
  showLiveProgress: boolean("show_live_progress").notNull().default(true),
  maxSelections: integer("max_selections"),
  status: electionStatusEnum("status").notNull().default("draft"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertElectionSchema = createInsertSchema(elections).omit({
  id: true,
  createdAt: true,
  closedAt: true,
  status: true,
});
export type InsertElection = z.infer<typeof insertElectionSchema>;
export type Election = typeof elections.$inferSelect;
