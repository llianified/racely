import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAR_CATALOG, CAR_MODEL_IDS } from "../lib/car-catalog";

/**
 * `lib/car-catalog.ts` is the single source of truth for cars in TypeScript, but the
 * database CHECK constraint has to repeat the ids in SQL. This test fails the moment a
 * new car is added to the catalog without a matching migration.
 */
const migration = readFileSync("migrations/0001_racely_core.sql", "utf8");

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

describe("Car catalog stays consistent across code and database", () => {
  it("keeps every CHECK constraint in sync with CAR_MODEL_IDS", () => {
    const expected = [...CAR_MODEL_IDS].sort();
    const checks = modelsInCheck(migration);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) expect(check).toEqual(expected);
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
