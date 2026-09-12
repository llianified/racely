/**
 * node-postgres only negotiates TLS when the DSN asks for it: a URL with no
 * `sslmode` connects in plaintext, which would put the whole session -- player
 * ids, balances, withdrawal account numbers -- on the wire in the clear.
 *
 * Force `verify-full` for every remote host. `require` and `prefer` are already
 * treated as aliases for `verify-full` by node-postgres, which also emits a
 * deprecation warning for them, so normalising here keeps the logs quiet too.
 *
 * Kept dependency-free on purpose: scripts/migrate.mjs runs under plain node and
 * mirrors this rule, and tests/database-url.test.ts asserts the two stay in sync.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);
const UPGRADABLE_SSL_MODES = new Set(["require", "prefer"]);

export function normalizeDatabaseUrl(url: URL): URL {
  if (LOCAL_HOSTS.has(url.hostname)) return url;
  const sslmode = url.searchParams.get("sslmode");
  if (!sslmode || UPGRADABLE_SSL_MODES.has(sslmode)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url;
}
