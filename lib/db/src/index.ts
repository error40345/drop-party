import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep pool small for serverless environments where many instances can
  // run simultaneously. Each Vercel function instance reuses this pool.
  max: 5,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
