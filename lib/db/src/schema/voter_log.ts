import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { elections } from "./elections";
import { members } from "./members";

export const voterLog = pgTable(
  "voter_log",
  {
    id: serial("id").primaryKey(),
    electionId: integer("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("voter_log_election_member_unique").on(table.electionId, table.memberId)],
);

export const insertVoterLogSchema = createInsertSchema(voterLog).omit({ id: true, votedAt: true });
export type InsertVoterLog = z.infer<typeof insertVoterLogSchema>;
export type VoterLog = typeof voterLog.$inferSelect;
