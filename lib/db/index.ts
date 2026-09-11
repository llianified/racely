import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const configuredConnectionString = process.env.DATABASE_URL;

if (!configuredConnectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const connectionUrl = new URL(configuredConnectionString);
if (connectionUrl.searchParams.get("sslmode") === "require") {
  connectionUrl.searchParams.set("sslmode", "verify-full");
}
const connectionString = connectionUrl.toString();

const globalForDatabase = globalThis as unknown as {
  racelyPool?: Pool;
  racelyPoolAttached?: boolean;
};

export const pool =
  globalForDatabase.racelyPool ??
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForDatabase.racelyPool = pool;

if (!globalForDatabase.racelyPoolAttached) {
  attachDatabasePool(pool);
  globalForDatabase.racelyPoolAttached = true;
}

export const db = drizzle(pool, { schema });
