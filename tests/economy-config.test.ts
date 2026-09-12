import { describe, expect, it } from "vitest";
import {
  DEFAULT_ECONOMY,
  UPGRADE_LEVEL_CEILING,
  boostCooldownSeconds,
  economyConfigSchema,
  economyFieldKeys,
  lapRewardAt,
  lapSecondsAt,
  resolveEconomyConfig,
  upgradeCostAt,
} from "../lib/economy-config";
import { projectEconomy } from "../lib/economy-projection";

const E = DEFAULT_ECONOMY;

describe("Config ekonomi", () => {
  it("menerima nilai bawaannya sendiri", () => {
    expect(economyConfigSchema.safeParse(E).success).toBe(true);
  });

  it("menolak field asing, supaya salah tulis tidak lolos diam-diam", () => {
    const parsed = economyConfigSchema.safeParse({ ...E, coinToIdrr: 100 });
    expect(parsed.success).toBe(false);
  });

  it("menolak penarikan maksimum di bawah minimum", () => {
    const parsed = economyConfigSchema.safeParse({
      ...E,
      minWithdrawCoins: 500,
      maxWithdrawCoins: 100,
    });
    expect(parsed.success).toBe(false);
  });

  /**
   * `CHECK (engine_level BETWEEN 1 AND 10)` di migrasi 0001 adalah batas
   * sebenarnya. Config yang mengizinkan level 11 akan membuat upgrade ke-11
   * ditolak database, bukan ditolak aturan permainan -- 500, bukan 409.
   */
  it("mengunci level maksimum pada batas yang dijaga database", () => {
    expect(UPGRADE_LEVEL_CEILING).toBe(10);
    expect(
      economyConfigSchema.safeParse({ ...E, maxUpgradeLevel: 11 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, maxUpgradeLevel: 10 }).success,
    ).toBe(true);
  });

  /**
   * `amount_idr` dihitung di JavaScript sebelum masuk kolom bigint. Batas
   * per-field saja masih mengizinkan hasil kali di atas 2^53, tempat rupiah
   * mulai kehilangan presisi tanpa error apa pun.
   */
  it("menolak kombinasi nilai koin dan batas penarikan yang melampaui presisi", () => {
    expect(
      economyConfigSchema.safeParse({
        ...E,
        coinToIdr: 10_000_000,
        maxWithdrawCoins: 1_000_000_000,
      }).success,
    ).toBe(false);
    // Kombinasi yang masih aman tetap diterima.
    expect(
      economyConfigSchema.safeParse({
        ...E,
        coinToIdr: 1_000,
        maxWithdrawCoins: 1_000_000,
      }).success,
    ).toBe(true);
  });

  it("menolak angka yang membuat putaran tidak pernah selesai", () => {
    expect(
      economyConfigSchema.safeParse({ ...E, lapBaseSeconds: 0 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, offlineRate: 1.5 }).success,
    ).toBe(false);
    expect(
      economyConfigSchema.safeParse({ ...E, dailyRewards: [] }).success,
    ).toBe(false);
  });

  describe("resolveEconomyConfig", () => {
    it("mengisi field yang hilang dari baris lama dengan bawaannya", () => {
      const resolved = resolveEconomyConfig({ coinToIdr: 250 });
      expect(resolved.coinToIdr).toBe(250);
      expect(resolved.starterGift).toBe(E.starterGift);
      expect(Object.keys(resolved).sort()).toEqual(
        [...economyFieldKeys].sort(),
      );
    });

    it("jatuh ke bawaan untuk baris yang rusak, bukan melempar", () => {
      // Satu baris config yang tidak terbaca tidak boleh mematikan permainan.
      expect(resolveEconomyConfig(null)).toEqual(E);
      expect(resolveEconomyConfig("bukan objek")).toEqual(E);
      expect(resolveEconomyConfig([1, 2, 3])).toEqual(E);
      expect(resolveEconomyConfig({ coinToIdr: -5 })).toEqual(E);
    });
  });

  it("menurunkan cooldown boost, bukan menyimpannya sebagai angka ketiga", () => {
    expect(boostCooldownSeconds(E)).toBe(
      E.boostDurationSeconds + E.batteryRechargeSeconds,
    );
    const cepat = { ...E, boostDurationSeconds: 4, batteryRechargeSeconds: 6 };
    expect(boostCooldownSeconds(cepat)).toBe(10);
  });

  it("memakai satu rumus untuk laju, hadiah, dan biaya", () => {
    const levels = { engine: 1, tires: 1, battery: 1 };
    expect(lapSecondsAt(E, levels, false)).toBe(8);
    expect(lapSecondsAt(E, levels, true)).toBe(8 / E.boostMultiplier);
    expect(lapRewardAt(E, 1, 0)).toBe(0.05);
    expect(lapRewardAt(E, 10, 1)).toBe(0.16);
    expect(upgradeCostAt(E, "engine", 1)).toBe(25);
  });
});

/**
 * Proyeksi adalah alasan panel ekonomi bisa dipakai tanpa menghitung di kepala.
 * Yang dijaga di sini adalah arahnya, bukan angka persisnya: menaikkan nilai
 * koin harus menaikkan rupiah, dan memperlambat putaran harus menurunkannya.
 */
describe("Proyeksi ekonomi", () => {
  it("menerjemahkan config bawaan jadi rupiah per jam", () => {
    const { rows } = projectEconomy(E);
    expect(rows).toHaveLength(2);
    // Level 1: 0,05 koin tiap 8 detik = 22,5 koin/jam = Rp2.250.
    expect(rows[0].coinsPerHour).toBeCloseTo(22.5);
    expect(rows[0].idrPerHour).toBeCloseTo(2250);
    // Upgrade maksimum jauh lebih cepat DAN lebih mahal per putaran.
    expect(rows[1].coinsPerHour).toBeGreaterThan(rows[0].coinsPerHour);
  });

  it("ikut naik saat nilai koin dinaikkan", () => {
    const mahal = projectEconomy({ ...E, coinToIdr: E.coinToIdr * 2 });
    const dasar = projectEconomy(E);
    expect(mahal.rows[0].idrPerHour).toBeCloseTo(dasar.rows[0].idrPerHour * 2);
    expect(mahal.minWithdrawIdr).toBe(dasar.minWithdrawIdr * 2);
  });

  it("turun saat putaran diperlambat", () => {
    const lambat = projectEconomy({ ...E, lapBaseSeconds: E.lapBaseSeconds * 4 });
    expect(lambat.rows[0].coinsPerHour).toBeCloseTo(22.5 / 4);
  });

  it("menghitung nilai akun baru dan biaya max-out", () => {
    const projection = projectEconomy(E);
    expect(projection.freshAccountIdr).toBe(
      (E.startingBalance + E.starterGift) * E.coinToIdr,
    );
    // Tiga jalur upgrade, sembilan langkah masing-masing.
    let expected = 0;
    for (const key of ["engine", "tires", "battery"] as const) {
      for (let level = 1; level < E.maxUpgradeLevel; level += 1) {
        expected += upgradeCostAt(E, key, level);
      }
    }
    expect(projection.maxOutCost).toBe(expected);
    expect(projection.maxOutIdr).toBe(expected * E.coinToIdr);
  });

  it("tidak pernah membagi nol saat laju disetel ke tak berbayar", () => {
    const gratis = projectEconomy({ ...E, lapRewardBase: 0, lapRewardPerBattery: 0, lapRewardPerCircuit: 0 });
    expect(gratis.rows[0].coinsPerHour).toBe(0);
    expect(gratis.rows[0].hoursToMinWithdraw).toBe(Infinity);
    expect(Number.isNaN(gratis.maxOutHoursAtBase)).toBe(false);
  });
});
