import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const configuredConnectionString = process.env.DATABASE_URL;
let connectionUrl: URL | null = null;

if (configuredConnectionString) {
  try {
    connectionUrl = new URL(configuredConnectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }
}

if (connectionUrl?.searchParams.get("sslmode") === "require") {
  connectionUrl.searchParams.set("sslmode", "verify-full");
}

function databasePoolLimit() {
  const parsed = Number(process.env.DATABASE_POOL_MAX ?? 5);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 5;
}

const globalForDatabase = globalThis as unknown as {
  racelyPool?: Pool;
  racelyPoolAttached?: boolean;
};

export const pool = connectionUrl
  ? (globalForDatabase.racelyPool ??
    new Pool({
      connectionString: connectionUrl.toString(),
      max: databasePoolLimit(),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    }))
  : null;

if (pool) {
  globalForDatabase.racelyPool = pool;
}

if (
  pool &&
  process.env.VERCEL &&
  !globalForDatabase.racelyPoolAttached
) {
  attachDatabasePool(pool);
  globalForDatabase.racelyPoolAttached = true;
}

export const db = pool ? drizzle(pool, { schema }) : null;
