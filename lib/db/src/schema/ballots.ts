// ANONYMITY GUARANTEE: This table intentionally has NO voter_id column and NO
// foreign key to members or voter_log. The separation between ballots (what was
// voted) and voter_log (who voted) is the core privacy guarantee.
// Direct inserts into this table should be done only via the cast_vote()
// Postgres function, never via ORM insert.
import { pgTable, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { elections } from "./elections";

export const ballots = pgTable("ballots", {
  id: serial("id").primaryKey(),
  electionId: integer("election_id")
    .notNull()
    .references(() => elections.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Ballot = typeof ballots.$inferSelect;
