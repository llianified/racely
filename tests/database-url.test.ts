import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "../lib/db/connection-url";

const normalize = (value: string) =>
  normalizeDatabaseUrl(new URL(value)).toString();
const sslmode = (value: string) =>
  new URL(normalize(value)).searchParams.get("sslmode");

describe("Remote database connections always negotiate verified TLS", () => {
  it("adds verify-full when the DSN says nothing about SSL", () => {
    expect(sslmode("postgresql://u:p@db.neon.tech/racely")).toBe("verify-full");
  });

  it("upgrades the modes node-postgres treats as aliases", () => {
    expect(sslmode("postgresql://u:p@db.neon.tech/racely?sslmode=require")).toBe(
      "verify-full",
    );
    expect(sslmode("postgresql://u:p@db.neon.tech/racely?sslmode=prefer")).toBe(
      "verify-full",
    );
  });

  it("leaves a deliberate stricter or looser choice alone", () => {
    expect(
      sslmode("postgresql://u:p@db.neon.tech/racely?sslmode=verify-full"),
    ).toBe("verify-full");
    expect(
      sslmode("postgresql://u:p@db.neon.tech/racely?sslmode=no-verify"),
    ).toBe("no-verify");
  });

  it("keeps a local socket plaintext so dev and tests still connect", () => {
    expect(sslmode("postgresql://racely@127.0.0.1:55432/racely")).toBeNull();
    expect(sslmode("postgresql://racely@localhost:5432/racely")).toBeNull();
    expect(sslmode("postgresql://racely@[::1]:5432/racely")).toBeNull();
  });

  it("preserves every other connection parameter", () => {
    const result = new URL(
      normalize("postgresql://u:p@db.neon.tech/racely?application_name=racely"),
    );
    expect(result.searchParams.get("application_name")).toBe("racely");
    expect(result.pathname).toBe("/racely");
    expect(result.username).toBe("u");
  });

  it("keeps the standalone migration script on the same rule", () => {
    // scripts/migrate.mjs runs under plain node and cannot import the .ts helper,
    // so the duplicate has to be kept honest here.
    const source = readFileSync("scripts/migrate.mjs", "utf8");
    expect(source).toContain('"127.0.0.1"');
    expect(source).toContain('sslmode === "require"');
    expect(source).toContain('sslmode === "prefer"');
    expect(source).toContain('connectionUrl.searchParams.set("sslmode", "verify-full")');
  });
});
