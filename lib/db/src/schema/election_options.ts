import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { elections } from "./elections";

export const electionOptions = pgTable("election_options", {
  id: serial("id").primaryKey(),
  electionId: integer("election_id")
    .notNull()
    .references(() => elections.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  orderIndex: integer("order_index").notNull(),
});

export const insertElectionOptionSchema = createInsertSchema(electionOptions).omit({ id: true });
export type InsertElectionOption = z.infer<typeof insertElectionOptionSchema>;
export type ElectionOption = typeof electionOptions.$inferSelect;
