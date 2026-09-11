import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const configuredConnectionString = process.env.DATABASE_URL;
const connectionUrl = configuredConnectionString
  ? new URL(configuredConnectionString)
  : null;

if (connectionUrl?.searchParams.get("sslmode") === "require") {
  connectionUrl.searchParams.set("sslmode", "verify-full");
}

const globalForDatabase = globalThis as unknown as {
  racelyPool?: Pool;
  racelyPoolAttached?: boolean;
};

export const pool = connectionUrl
  ? (globalForDatabase.racelyPool ??
    new Pool({
      connectionString: connectionUrl.toString(),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }))
  : null;

if (pool && process.env.NODE_ENV !== "production") {
  globalForDatabase.racelyPool = pool;
}

if (pool && !globalForDatabase.racelyPoolAttached) {
  attachDatabasePool(pool);
  globalForDatabase.racelyPoolAttached = true;
}

export const db = pool ? drizzle(pool, { schema }) : null;
