import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAR_CATALOG, CAR_MODEL_IDS } from "../lib/car-catalog";

/**
 * `lib/car-catalog.ts` is the single source of truth for cars in TypeScript, but the
 * database CHECK constraint has to repeat the ids in SQL. This test fails the moment a
 * new car is added to the catalog without a matching migration.
 *
 * SELURUH migrasi dibaca, bukan `0001` saja. Rute "mobil baru" di AGENTS.md
 * memasang constraint-nya lewat migrasi BARU (langkah 3) dan baru kemudian
 * menyelaraskan `0001` (langkah 4), jadi versi yang hanya melirik `0001` buta
 * terhadap migrasi 000N yang melebarkan daftar id -- persis bentuk yang
 * membuat produksi menyimpan `car_model` yang tidak ada di katalog.
 *
 * Yang TIDAK bisa dijangkau test ini: database yang sudah ter-deploy. Migrasi
 * bersifat additive dan tidak pernah di-un-apply, jadi kode yang di-rollback
 * membawa serta katalog DAN SQL-nya -- keduanya kembali cocok, test hijau,
 * sementara constraint di EC2 masih yang lebar dan barisnya masih menyimpan id
 * lama. Satu-satunya penjaga untuk keadaan itu adalah normalisasi saat membaca
 * di `stateFromRow` (lihat `tests/player-row-normalisation.test.ts`).
 */
function modelsInCheck(source: string) {
  const matches = [
    ...source.matchAll(/car_model IN \(([^)]*)\)/g),
  ].map(([, list]) =>
    list
      .split(",")
      .map((value) => value.trim().replace(/^'|'$/g, ""))
      .sort(),
  );
  return matches;
}

/** Setiap daftar `car_model IN (...)` di migrasi mana pun, berikut asalnya. */
function everyCheck() {
  return readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .flatMap((file) =>
      modelsInCheck(readFileSync(`migrations/${file}`, "utf8")).map((ids) => ({
        file,
        ids,
      })),
    );
}

describe("Car catalog stays consistent across code and database", () => {
  it("keeps every CHECK constraint in sync with CAR_MODEL_IDS", () => {
    const expected = [...CAR_MODEL_IDS].sort();
    const checks = everyCheck();
    expect(checks.length).toBeGreaterThan(0);
    // Dipetakan lebih dulu supaya kegagalannya menyebut FILE-nya, bukan sekadar
    // "array tidak sama" tanpa petunjuk migrasi mana yang menyimpang.
    expect(checks.map(({ file, ids }) => ({ file, ids }))).toEqual(
      checks.map(({ file }) => ({ file, ids: expected })),
    );
  });

  it("gives every model a default color that exists in its own palette", () => {
    for (const id of CAR_MODEL_IDS) {
      const car = CAR_CATALOG[id];
      expect(car.colors.map((choice) => choice.color)).toContain(
        car.defaultColor,
      );
      expect(car.name.length).toBeGreaterThan(0);
    }
  });
});
