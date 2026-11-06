import { config as loadEnv } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDb } from "../lib/db/client";
import { assertLocalDatabase } from "../lib/db/safety";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgres://postgres:postgres@localhost:5433/chalants_test";

/** Ensures the test database exists, then recreates the schema from the checked-in migrations. */
export default async function setup() {
  assertLocalDatabase(TEST_DATABASE_URL);
  await ensureDatabase(TEST_DATABASE_URL);
  const { db, pool } = createDb(TEST_DATABASE_URL, 1);
  try {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DATABASE_URL_TEST = TEST_DATABASE_URL;
  Object.assign(process.env, { NODE_ENV: "test" });
}

async function ensureDatabase(url: string) {
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const pool = new Pool({ connectionString: admin.toString(), max: 1 });
  try {
    const existing = await pool.query("select 1 from pg_database where datname = $1", [dbName]);
    if (existing.rowCount === 0) {
      await pool.query(`create database "${dbName.replace(/"/g, "")}"`);
    }
  } finally {
    await pool.end();
  }
}
