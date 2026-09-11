import { existsSync, readFileSync } from "node:fs";

/**
 * Database-backed tests need DATABASE_URL, which lives outside the repo in v0 and in the
 * shell on EC2. Nothing here is ever logged; only the keys are copied into process.env.
 */
const candidates = [
  "/vercel/share/.env.project",
  ".env.test.local",
  ".env.development.local",
];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue
      .trim()
      .replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}
