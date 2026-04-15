import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dropsTable = pgTable("drops", {
  id: serial("id").primaryKey(),
  contractAddress: text("contract_address").notNull().unique(),
  creatorAddress: text("creator_address").notNull(),
  title: text("title").notNull(),
  totalAmount: text("total_amount").notNull(),
  amountPerClaim: text("amount_per_claim").notNull(),
  maxClaims: integer("max_claims").notNull(),
  claimedCount: integer("claimed_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  txHash: text("tx_hash"),
  tokenHash: text("token_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDropSchema = createInsertSchema(dropsTable).omit({ id: true, claimedCount: true, createdAt: true, updatedAt: true });
export type InsertDrop = z.infer<typeof insertDropSchema>;
export type Drop = typeof dropsTable.$inferSelect;
