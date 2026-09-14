import { describe, expect, it } from "vitest";
import { countUpValue } from "@/components/game/shell/use-count-up";

describe("countUpValue", () => {
  it("berangkat dari nilai lama dan mendarat tepat di nilai baru", () => {
    expect(countUpValue(1_000, 6_000, 0)).toBe(1_000);
    expect(countUpValue(1_000, 6_000, 1)).toBe(6_000);
  });

  it("tidak pernah melewati nilai akhir walau progresnya kebablasan", () => {
    expect(countUpValue(1_000, 6_000, 1.5)).toBe(6_000);
    expect(countUpValue(1_000, 6_000, -0.5)).toBe(1_000);
  });

  it("naik monoton di sepanjang animasi", () => {
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const value = countUpValue(0, 200_000, t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("melesat di awal lalu melambat -- separuh waktu sudah lewat separuh jarak", () => {
    expect(countUpValue(0, 1_000, 0.5)).toBeGreaterThan(500);
  });

  it("juga menghitung turun saat koin dibelanjakan", () => {
    expect(countUpValue(8_000, 3_000, 0)).toBe(8_000);
    expect(countUpValue(8_000, 3_000, 0.5)).toBeLessThan(5_500);
    expect(countUpValue(8_000, 3_000, 1)).toBe(3_000);
  });

  it("tetap bulat sepanjang animasi saat kedua ujungnya bulat", () => {
    for (let t = 0; t <= 1; t += 0.017) {
      expect(Number.isInteger(countUpValue(28_265, 28_285, t))).toBe(true);
    }
  });

  it("dibulatkan ke dua desimal saat ujungnya memang pecahan", () => {
    const value = countUpValue(0, 33.33, 0.37);
    expect(value).toBe(Math.round(value * 100) / 100);
  });
});
