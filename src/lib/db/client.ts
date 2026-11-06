import "@/lib/server-guard";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run queries: the pool-backed db or a transaction handle. */
export type DbOrTx = Db | Tx;

type Globals = typeof globalThis & { __chalantsPool?: Pool; __chalantsDb?: Db; __chalantsUrl?: string };
const g = globalThis as Globals;

export function createPool(connectionString: string, max = 5): Pool {
  return new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Postgres returns timestamptz as Date objects by default with pg; keep that.
  });
}

export function createDb(connectionString: string, max = 5): { db: Db; pool: Pool } {
  const pool = createPool(connectionString, max);
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { db, pool };
}

/** Process-wide database handle (survives dev HMR). Uses DATABASE_URL. */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (g.__chalantsDb && g.__chalantsUrl === url) return g.__chalantsDb;
  const { db, pool } = createDb(url, 8);
  g.__chalantsPool = pool;
  g.__chalantsDb = db;
  g.__chalantsUrl = url;
  return db;
}

/** Test/scripts helper to swap the process-wide handle. */
export function setDb(db: Db, pool: Pool, url: string) {
  g.__chalantsDb = db;
  g.__chalantsPool = pool;
  g.__chalantsUrl = url;
}

export async function closeDb() {
  await g.__chalantsPool?.end();
  g.__chalantsPool = undefined;
  g.__chalantsDb = undefined;
  g.__chalantsUrl = undefined;
}

export async function withTx<T>(fn: (tx: Tx) => Promise<T>, db: Db = getDb()): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
