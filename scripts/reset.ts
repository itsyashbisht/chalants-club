import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { createDb } from "../src/lib/db/client";
import { assertLocalDatabase } from "../src/lib/db/safety";

/** Drops and recreates the public schema, then applies migrations. Local databases only. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  assertLocalDatabase(url);
  const { db, pool } = createDb(url, 1);
  try {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
    console.log("database reset and migrated");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
