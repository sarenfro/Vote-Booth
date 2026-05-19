// NOTE: Per EC policy, ballots are linked to the casting member via member_id
// so the Executive Committee can audit per-voter choices. The cast_vote()
// Postgres function is the only intended writer for this table.
import { pgTable, serial, integer, jsonb, timestamp, text } from "drizzle-orm/pg-core";
import { elections } from "./elections";
import { members } from "./members";

export const ballots = pgTable("ballots", {
  id: serial("id").primaryKey(),
  electionId: integer("election_id")
    .notNull()
    .references(() => elections.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => members.id),
  payload: jsonb("payload").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Ballot = typeof ballots.$inferSelect;
