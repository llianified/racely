/**
 * Menghentikan deploy kalau database tertinggal di belakang migrations/.
 *
 * scripts/migrate.mjs sudah menerapkan yang kurang, jadi drift di sini berarti
 * ada yang salah: migrasi dijalankan terhadap database lain, file baru masuk
 * tanpa sempat dijalankan, atau catatan di racely_schema_migrations dirusak.
 * Lebih baik deploy berhenti daripada menyalakan app di atas skema yang salah —
 * itulah kegagalan yang memunculkan "Progres belum bisa dimuat" di produksi.
 */
import { readdir } from "node:fs/promises";
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

// Mirrors scripts/migrate.mjs and lib/db/index.ts: never inspect production
// over a plaintext connection just because the DSN omitted `sslmode`.
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

try {
  const expected = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (await pool.query("SELECT id FROM racely_schema_migrations")).rows.map(
      (row) => row.id,
    ),
  );

  const missing = expected.filter((file) => !applied.has(file));
  if (missing.length > 0) {
    console.error(
      `Schema drift: ${missing.length} migration(s) belum diterapkan: ${missing.join(", ")}`,
    );
    console.error("Deploy dihentikan sebelum restart. Jalankan pnpm run db:migrate.");
    process.exit(1);
  }

  console.log(`Schema verified: ${expected.length} migration(s) applied.`);
} catch (error) {
  const detail = (error instanceof Error ? error.message : String(error))
    .replace(/[a-z+]+:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b(password|sslmode|user)=\S+/gi, "$1=[redacted]");
  console.error(`Schema verification failed: ${detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
