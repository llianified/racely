import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAR_CATALOG, CAR_MODEL_IDS, PREMIUM_CAR_IDS } from "../lib/car-catalog";

/**
 * `lib/car-catalog.ts` is the single source of truth for cars in TypeScript, but the
 * database CHECK constraints have to repeat the ids in SQL. Every migration is scanned,
 * not just 0001: since the collection shipped, the id list is spelled out four times --
 * twice in 0001, once more when 0010 recreates the car_model constraint, and once in the
 * owned_cars allowlist. A stale owned_cars list is the expensive one: the catalog would
 * offer a car the database then refuses to record as owned.
 */
const MIGRATIONS = "migrations";
const sources = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(`${MIGRATIONS}/${name}`, "utf8") }));

function quotedLists(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].map(([, list]) =>
    list
      .split(",")
      .map((value) => value.trim().replace(/^["\']|["\']$/g, ""))
      .sort(),
  );
}

describe("Car catalog stays consistent across code and database", () => {
  const expected = [...CAR_MODEL_IDS].sort();

  it("keeps every car_model CHECK constraint in sync with CAR_MODEL_IDS", () => {
    const found = sources.flatMap(({ name, sql }) =>
      quotedLists(sql, /car_model IN \(([^)]*)\)/g).map((list) => ({ name, list })),
    );
    expect(found.length).toBeGreaterThan(0);
    for (const { name, list } of found) expect(list, name).toEqual(expected);
  });

  it("keeps the owned_cars allowlist in sync with CAR_MODEL_IDS", () => {
    const found = sources.flatMap(({ name, sql }) =>
      quotedLists(sql, /owned_cars <@ \'\[([^\]]*)\]\'/g).map((list) => ({ name, list })),
    );
    expect(found.length).toBeGreaterThan(0);
    for (const { name, list } of found) expect(list, name).toEqual(expected);
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

  it("gives every collection car the tagline its catalog card renders", () => {
    for (const id of PREMIUM_CAR_IDS) {
      expect(CAR_CATALOG[id].tagline.length, id).toBeGreaterThan(0);
    }
  });
});
