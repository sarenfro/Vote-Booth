import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { elections } from "./elections";
import { members } from "./members";

export const ballotDocuments = pgTable("ballot_documents", {
  id: serial("id").primaryKey(),
  electionId: integer("election_id")
    .notNull()
    .references(() => elections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedBy: integer("uploaded_by").references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BallotDocument = typeof ballotDocuments.$inferSelect;
