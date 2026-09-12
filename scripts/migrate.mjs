import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(projectRoot, "migrations");
const rawConnectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!rawConnectionString) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
  process.exit(1);
}

let connectionUrl;
try {
  connectionUrl = new URL(rawConnectionString);
} catch {
  console.error("The configured database URL is invalid.");
  process.exit(1);
}

// Mirrors lib/db/index.ts: a DSN without `sslmode` would migrate over a
// plaintext connection, so force verified TLS for every remote host.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);
if (!LOCAL_HOSTS.has(connectionUrl.hostname)) {
  const sslmode = connectionUrl.searchParams.get("sslmode");
  if (!sslmode || sslmode === "require" || sslmode === "prefer") {
    connectionUrl.searchParams.set("sslmode", "verify-full");
  }
}

const pool = new Pool({
  connectionString: connectionUrl.toString(),
  max: 1,
  connectionTimeoutMillis: 10_000,
});

let client;
try {
  client = await pool.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS racely_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query("SELECT pg_advisory_lock(hashtext('racely_schema_migrations'))");

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (await client.query("SELECT id FROM racely_schema_migrations")).rows.map(
      (row) => row.id,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const source = await readFile(path.join(migrationsDirectory, file), "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    await client.query("BEGIN");
    try {
      for (const statement of statements) await client.query(statement);
      await client.query(
        "INSERT INTO racely_schema_migrations (id) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log("Database schema is up to date.");
} catch (error) {
  // Postgres errors can echo back the DSN, so scrub anything URL-shaped before printing.
  const detail = (error instanceof Error ? error.message : String(error))
    .replace(/[a-z+]+:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(password|sslmode|user)=\S+/gi, "$1=[redacted]");
  console.error(`Database migration failed: ${detail}`);
  process.exitCode = 1;
} finally {
  if (client) {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('racely_schema_migrations'))")
      .catch(() => undefined);
    client.release();
  }
  await pool.end();
}
