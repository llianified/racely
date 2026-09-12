import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gameActionSchema } from "../lib/game-server";

/**
 * `commandSchema` di lib/game-server.ts adalah sumber kebenaran aksi pemain di
 * TypeScript, tapi `racely_action_receipts.action_type` mengulang daftarnya di
 * SQL. Keduanya pernah menyimpang tanpa suara: 'daily' dan ketiga aksi part
 * lolos typecheck, lolos lint, lolos `pnpm dev` (mode preview tidak menyentuh
 * database), lalu membatalkan seluruh transaksi di produksi.
 *
 * Test ini gagal begitu aksi ke-lima belas ditambahkan tanpa migrasi
 * pendampingnya, jadi kesalahan yang sama tidak bisa terulang diam-diam.
 */

/** 'sync' memang tidak pernah dicatat -- lihat cabang di `performGameAction`. */
const NEVER_RECORDED = new Set(["sync"]);

type UnionShape = {
  shape: { action: { options: { shape: { type: { value: string } } }[] } };
};

function commandTypes() {
  const union = (gameActionSchema as never as UnionShape).shape.action;
  return union.options.map((option) => option.shape.type.value);
}

/**
 * Migrasi berjalan berurutan menurut nama, jadi daftar yang berlaku adalah
 * kemunculan terakhir -- bukan yang di 0001.
 */
function effectiveAllowList() {
  const files = readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let latest: { file: string; ids: string[] } | null = null;
  for (const file of files) {
    const source = readFileSync(`migrations/${file}`, "utf8");
    for (const [, list] of source.matchAll(/action_type IN \(([^)]*)\)/g)) {
      latest = {
        file,
        ids: list
          .split(",")
          .map((value) => value.trim().replace(/^'|'$/g, ""))
          .filter(Boolean),
      };
    }
  }
  return latest;
}

describe("Receipt action types stay in sync with commandSchema", () => {
  it("records every command the server can execute, except sync", () => {
    const expected = commandTypes()
      .filter((type) => !NEVER_RECORDED.has(type))
      .sort();
    const allowed = effectiveAllowList();

    expect(allowed).not.toBeNull();
    expect([...allowed!.ids].sort()).toEqual(expected);
  });

  it("never lists a type the server cannot produce", () => {
    const known = new Set(commandTypes());
    for (const id of effectiveAllowList()!.ids) expect(known.has(id)).toBe(true);
  });

  it("keeps sync out of the allow list", () => {
    expect(effectiveAllowList()!.ids).not.toContain("sync");
  });
});
