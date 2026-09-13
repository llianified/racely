import { describe, expect, it } from "vitest";
import { DEFAULT_ECONOMY, lapSecondsAt } from "@/lib/economy-config";
import { displaySpeedKmh, formatSpeedKmh } from "@/lib/game";

describe("formatSpeedKmh", () => {
  it("memakai satu desimal dan koma di bawah 100 km/j", () => {
    expect(formatSpeedKmh(0)).toBe("0,0");
    expect(formatSpeedKmh(19.7)).toBe("19,7");
    expect(formatSpeedKmh(24)).toBe("24,0");
    expect(formatSpeedKmh(99.9)).toBe("99,9");
  });

  it("melepas desimal mulai 100 km/j", () => {
    expect(formatSpeedKmh(100)).toBe("100");
    expect(formatSpeedKmh(156)).toBe("156");
    expect(formatSpeedKmh(156.04)).toBe("156");
  });

  it("menguji ambang setelah pembulatan, jadi 99,96 bukan '100,0'", () => {
    // Ambang yang diuji sebelum pembulatan akan mengembalikan lima karakter
    // di sini -- persis kasus yang membuat kolomnya tumpah.
    expect(formatSpeedKmh(99.96)).toBe("100");
  });

  it("laju tercepat yang bisa dicapai pemain tetap empat karakter", () => {
    // Level maksimum + Gaspol: batas atas yang harus muat di kolom HUD.
    const max = DEFAULT_ECONOMY.maxUpgradeLevel;
    const fastest = lapSecondsAt(
      DEFAULT_ECONOMY,
      { engine: max, tires: max, battery: max },
      true,
    );
    const label = formatSpeedKmh(displaySpeedKmh(fastest));
    expect(label).toBe("156");
    expect(label.length).toBeLessThanOrEqual(4);
  });

  it("tidak pernah memakai titik, supaya tidak bentrok dengan pemisah ribuan RPM", () => {
    for (const value of [0, 7.25, 19.7, 99.96, 100, 156]) {
      expect(formatSpeedKmh(value)).not.toContain(".");
    }
  });
});
