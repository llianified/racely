import { describe, expect, it } from "vitest";
import { knownCarModel, knownBodyParts } from "@/lib/game-server";
import { CAR_MODEL_IDS } from "@/lib/car-catalog";
import { emptyBodyParts } from "@/lib/car-parts";

/**
 * `car_model` dan `body_parts` dibaca dari Postgres lewat `$type<...>()`, yang
 * hanya berjanji kepada TypeScript dan tidak memeriksa apa pun saat berjalan.
 * Satu baris produksi ber-`car_model` 'ufo-gabut' karena itu lolos utuh ke
 * komponen, dan garasi membaca `CAR_CATALOG['ufo-gabut'].colors` -- undefined --
 * lalu menjatuhkan SELURUH app. Berkas ini mengunci normalisasinya.
 */
describe("knownCarModel", () => {
  it.each(CAR_MODEL_IDS)("meneruskan model yang ada di katalog: %s", (model) => {
    expect(knownCarModel(model)).toBe(model);
  });

  it("meneruskan null apa adanya: pemain yang memang belum memilih", () => {
    expect(knownCarModel(null)).toBeNull();
  });

  /** Baris yang benar-benar ada di produksi saat garasi tumbang. */
  it("menormalkan 'ufo-gabut' menjadi null, bukan meneruskannya", () => {
    expect(knownCarModel("ufo-gabut")).toBeNull();
  });

  it.each(["", "NEO-FALCON", "neo falcon", "__proto__", "constructor"])(
    "menolak %p",
    (model) => {
      expect(knownCarModel(model)).toBeNull();
    },
  );
});

describe("knownBodyParts", () => {
  it("meneruskan koleksi yang sah", () => {
    const parts = { owned: ["gt-wing"], equipped: { spoiler: "gt-wing" } };
    expect(knownBodyParts(parts)).toEqual(parts);
  });

  it("menerima koleksi kosong", () => {
    expect(knownBodyParts(emptyBodyParts())).toEqual(emptyBodyParts());
  });

  /** `PART_CATALOG[id].name` melempar untuk id yang tidak dikenal. */
  it.each([
    { label: "part tak dikenal", value: { owned: ["ufo-wing"], equipped: {} } },
    { label: "part terpasang tanpa dimiliki", value: { owned: [], equipped: { spoiler: "gt-wing" } } },
    { label: "part di slot yang salah", value: { owned: ["gt-wing"], equipped: { hood: "gt-wing" } } },
    { label: "bentuk yang sama sekali lain", value: { nonsense: true } },
    { label: "null", value: null },
    { label: "string", value: "gt-wing" },
  ])("mengganti $label dengan koleksi kosong", ({ value }) => {
    expect(knownBodyParts(value)).toEqual(emptyBodyParts());
  });
});
