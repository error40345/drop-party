import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dropsTable } from "./drops";

export const claimsTable = pgTable("claims", {
  id: serial("id").primaryKey(),
  dropId: integer("drop_id").notNull().references(() => dropsTable.id),
  claimerAddress: text("claimer_address").notNull(),
  amount: text("amount").notNull(),
  txHash: text("tx_hash"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("claims_drop_claimer_unique").on(table.dropId, table.claimerAddress),
]);

export const insertClaimSchema = createInsertSchema(claimsTable).omit({ id: true, claimedAt: true });
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claimsTable.$inferSelect;
