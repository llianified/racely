import { describe, expect, it } from "vitest";
import {
  calculateRaceSettlement,
  dailyCheckIn,
  dailyRewardFor,
  racingDayKey,
  referralActivityQualified,
} from "../lib/game-economy";
import { INITIAL_GAME, batteryTelemetry, formatDuration, gameReducer, lapReward, lapSeconds, modificationPartName, modificationPreview, racePosition } from "../lib/game";
import { DEFAULT_ECONOMY, upgradeCostAt } from "../lib/economy-config";

/**
 * Angka ekonomi sekarang bisa disetel dari panel admin, jadi berkas ini mengunci
 * nilai BAWAAN-nya: tabel di bawah diturunkan dari DEFAULT_ECONOMY, dan default
 * yang bergeser tanpa sengaja akan memerahkan test ini.
 */
const E = DEFAULT_ECONOMY;

const start = new Date("2026-09-11T00:00:00.000Z");

function settlementInput(
  overrides: Partial<Parameters<typeof calculateRaceSettlement>[0]> = {},
) {
  return {
    progress: 0,
    levels: { engine: 1, tires: 1, battery: 1 },
    circuit: 0,
    economy: E,
    lastSettledAt: start,
    boostEndsAt: null,
    ...overrides,
  };
}

describe("Referral activity qualification", () => {
  const days = ["2026-09-10", "2026-09-12", "2026-09-15"];
  const upgraded = { engine: 2, tires: 2, battery: 2 };

  it("requires both distinct check-in days and actual level increases", () => {
    expect(referralActivityQualified([], upgraded, E)).toBe(false);
    expect(referralActivityQualified(days.slice(0, 2), upgraded, E)).toBe(false);
    expect(referralActivityQualified(days, { engine: 1, tires: 1, battery: 1 }, E)).toBe(false);
    expect(referralActivityQualified(days, { engine: 2, tires: 2, battery: 1 }, E)).toBe(false);
    expect(referralActivityQualified(days, upgraded, E)).toBe(true);
  });

  it("counts a day once, accepts non-consecutive days, and aggregates all components", () => {
    expect(referralActivityQualified(Array(10).fill(days[0]), upgraded, E)).toBe(false);
    expect(referralActivityQualified([...days, ...days], upgraded, E)).toBe(true);
    for (const component of ["engine", "tires", "battery"] as const) {
      expect(referralActivityQualified(days, { engine: 1, tires: 1, battery: 1, [component]: 4 }, E)).toBe(true);
    }
  });

  it("uses WIB day boundaries rather than repeated requests or UTC dates", () => {
    const before = racingDayKey(new Date("2026-09-12T16:59:59Z"));
    const after = racingDayKey(new Date("2026-09-12T17:00:00Z"));
    expect(referralActivityQualified([before, before, before], upgraded, E)).toBe(false);
    expect(referralActivityQualified([before, after, "2026-09-14"], upgraded, E)).toBe(true);
  });

  it("uses live activity thresholds and ignores the retired lap threshold", () => {
    expect(referralActivityQualified(days, upgraded, { ...E, referralActiveDays: 4 })).toBe(false);
    expect(referralActivityQualified(days, upgraded, { ...E, referralUpgradeTarget: 4 })).toBe(false);
    expect(referralActivityQualified(days, upgraded, { ...E, referralMilestoneLaps: 10_000_000 })).toBe(true);
    expect(referralActivityQualified([], upgraded, { ...E, referralMilestoneLaps: 0 })).toBe(false);
  });
});

describe("Automatic racing without Gaspol", () => {
  it("never exposes an actionable boost reserve", () => {
    for (const timers of [{ boostLeft: 0, cooldown: 0 }, { boostLeft: 5, cooldown: 30 }, { boostLeft: 20, cooldown: -1 }]) {
      expect(batteryTelemetry({ ...timers, economy: E })).toMatchObject({ percent: 100, canBoost: false, readyIn: 0 });
    }
  });

  it("ignores and clears timers from legacy state", () => {
    const next = gameReducer({ ...INITIAL_GAME, boostLeft: .1, cooldown: 25.1 }, { type: "tick", delta: .5 });
    expect(next.progress).toBeCloseTo(.5 / 8);
    expect(next.boostLeft).toBe(0);
    expect(next.cooldown).toBe(0);
    expect(gameReducer(next, { type: "tick", delta: .5 }).progress).toBeCloseTo(1 / 8);
  });
});

describe("Modification workshop", () => {
  it("simulates a single component without spending coins or mutating progress", () => {
    const state = { ...INITIAL_GAME, balance: 40, boostLeft: 10, levels: { engine: 2, tires: 3, battery: 4 } };
    const original = structuredClone(state);
    const preview = modificationPreview(state, "engine");
    expect(preview.cost).toBe(upgradeCostAt(E, "engine", 2));
    expect(preview.beforeSeconds).toBe(lapSeconds({ ...state, boostLeft: 0 }));
    expect(preview.afterSeconds).toBeLessThan(preview.beforeSeconds);
    expect(preview.afterReward).toBe(preview.beforeReward);
    expect(state).toEqual(original);
  });

  it("shows the correct battery and tire effects on either circuit", () => {
    for (const circuit of [0, 1]) {
      const state = { ...INITIAL_GAME, circuit };
      const battery = modificationPreview(state, "battery");
      expect(battery.afterReward).toBeGreaterThanOrEqual(battery.beforeReward);
      expect(battery.afterSeconds).toBe(battery.beforeSeconds);
      const tires = modificationPreview(state, "tires");
      expect(tires.afterSeconds).toBeLessThan(tires.beforeSeconds);
      expect(tires.afterReward).toBeGreaterThanOrEqual(tires.beforeReward);
    }
  });

  it("shows exact affordability and caps the maximum level", () => {
    expect(modificationPreview({ ...INITIAL_GAME, balance: 4_999.5 }, "engine").shortfall).toBe(.5);
    expect(modificationPreview({ ...INITIAL_GAME, balance: 5_000 }, "engine").shortfall).toBe(0);
    const maxed = modificationPreview({ ...INITIAL_GAME, levels: { engine: 10, tires: 10, battery: 10 } }, "engine");
    expect(maxed).toMatchObject({ maxed: true, nextLevel: 10, cost: 0 });
    expect(maxed.afterSeconds).toBe(maxed.beforeSeconds);
  });

  it("names parts consistently across every tuning tier", () => {
    expect(modificationPartName("engine", 1)).toBe("Motor standar");
    expect(modificationPartName("engine", 2)).toBe("Motor sport");
    expect(modificationPartName("engine", 4)).toBe("Motor sport");
    expect(modificationPartName("engine", 5)).toBe("Motor racing");
    expect(modificationPartName("engine", 7)).toBe("Motor racing");
    expect(modificationPartName("engine", 8)).toBe("Motor pro");
    expect(modificationPartName("engine", 10)).toBe("Motor pro");
  });
});

describe("Racely economy", () => {
  it("keeps the base lap time and upgrade costs", () => {
    expect(lapSeconds(INITIAL_GAME)).toBe(8);
    expect(upgradeCostAt(E, "engine", 1)).toBe(5_000);
    expect(upgradeCostAt(E, "tires", 1)).toBe(3_000);
    expect(upgradeCostAt(E, "battery", 1)).toBe(4_000);
  });

  it("does not invent rivals or position multipliers", () => {
    for (const engine of [1, 2, 3]) {
      const state = { ...INITIAL_GAME, levels: { ...INITIAL_GAME.levels, engine }, boostLeft: 10 };
      expect(racePosition(state)).toBe(1);
      expect(lapReward(state)).toBe(E.lapRewardBase);
    }
  });

  it("settles completed laps and carries fractional progress", () => {
    const result = calculateRaceSettlement(
      settlementInput({ progress: 0.5 }),
      new Date(start.getTime() + 12_000),
    );

    expect(result.completedLaps).toBe(2);
    expect(result.income).toBe(10);
    expect(result.progress).toBeCloseTo(0);
  });

  it("ignores a legacy boost window during settlement", () => {
    const result = calculateRaceSettlement(
      settlementInput({ boostEndsAt: new Date(start.getTime() + 4_000) }),
      new Date(start.getTime() + 8_000),
    );

    expect(result.completedLaps).toBe(1);
    expect(result.income).toBe(5);
    expect(result.progress).toBeCloseTo(0);
  });

  it("reports no offline window while the client is heartbeating", () => {
    const result = calculateRaceSettlement(
      settlementInput(),
      new Date(start.getTime() + E.heartbeatCapSeconds * 1000),
    );

    expect(result.offline).toBeNull();
    expect(result.creditedSeconds).toBe(E.heartbeatCapSeconds);
    expect(result.completedLaps).toBe(15);
    expect(result.income).toBe(75);
  });
});

/**
 * Base settlement state laps every 8s for 5 coins, so the
 * whole table below is derived from those two numbers.
 */
describe("Offline earnings", () => {
  const settleAfter = (seconds: number) =>
    calculateRaceSettlement(
      settlementInput(),
      new Date(start.getTime() + seconds * 1000),
    );

  it("pays ten minutes away past the heartbeat window, at half rate", () => {
    const result = settleAfter(10 * 60);
    // 120s online -> 15 laps; the remaining 480s at half speed -> 30 more.
    expect(result.offline).toEqual({
      awaySeconds: 600,
      creditedSeconds: 480,
      capped: false,
      laps: 30,
      coins: 150,
    });
    expect(result.completedLaps).toBe(45);
    expect(result.income).toBe(225);
    expect(result.creditedSeconds).toBe(600);
  });

  it("still pays every second of an absence that lands exactly on the cap", () => {
    const result = settleAfter(E.offlineCapSeconds);

    expect(result.offline).toMatchObject({
      awaySeconds: E.offlineCapSeconds,
      creditedSeconds: E.offlineCapSeconds - E.heartbeatCapSeconds,
      capped: false,
      laps: 892,
      coins: 4_460,
    });
    expect(result.completedLaps).toBe(907);
    expect(result.income).toBe(4_535);
    expect(result.creditedSeconds).toBe(E.offlineCapSeconds);
  });

  it("truncates a ten hour absence to the four hour cap", () => {
    const result = settleAfter(10 * 60 * 60);

    expect(result.offline).toMatchObject({
      awaySeconds: 10 * 60 * 60,
      creditedSeconds: E.offlineCapSeconds,
      capped: true,
      laps: 900,
      coins: 4_500,
    });
    // A full day away pays exactly the same as the capped four hours.
    expect(settleAfter(24 * 60 * 60).offline).toMatchObject({
      creditedSeconds: E.offlineCapSeconds,
      laps: 900,
      coins: 4_500,
    });
  });

  it("credits offline seconds at exactly half the online lap rate", () => {
    const offline = settleAfter(E.offlineCapSeconds + E.heartbeatCapSeconds);
    const onlineLaps = E.offlineCapSeconds / lapSeconds(INITIAL_GAME);

    expect(offline.offline?.creditedSeconds).toBe(E.offlineCapSeconds);
    expect(offline.offline?.laps).toBe(onlineLaps * E.offlineRate);
    expect(E.offlineRate).toBe(0.5);
  });

  it("never pays a short absence less than the heartbeat window alone", () => {
    const heartbeat = settleAfter(E.heartbeatCapSeconds);
    const justOver = settleAfter(E.heartbeatCapSeconds + 10);

    // 120s full rate (15 laps) + 10s half rate (.625 laps) keeps every lap
    // already earned in the heartbeat window and carries the remainder forward.
    expect(heartbeat.completedLaps).toBe(15);
    expect(justOver.completedLaps).toBe(15);
    expect(justOver.progress).toBeCloseTo(0.625);
    expect(justOver.offline).toMatchObject({ laps: 0, coins: 0 });
  });

  it("does not revive legacy boost bonuses during idle settlement", () => {
    const result = calculateRaceSettlement(
      settlementInput({ boostEndsAt: new Date(start.getTime() + 10_000) }),
      new Date(start.getTime() + 10 * 60 * 1000),
    );

    // 120s normal (15 laps) + 480s offline (30 laps), regardless of legacy timers.
    expect(result.completedLaps).toBe(45);
    expect(result.offline).toMatchObject({ laps: 30, creditedSeconds: 480 });
  });

  it("spells the offline window the way the dialog reads it", () => {
    expect(formatDuration(45)).toBe("45 detik");
    expect(formatDuration(600)).toBe("10 menit");
    expect(formatDuration(E.offlineCapSeconds)).toBe("4 jam");
    expect(formatDuration(4 * 60 * 60 + 25 * 60)).toBe("4 jam 25 menit");
    expect(formatDuration(-1)).toBe("0 detik");
  });
});

describe("Check-in harian", () => {
  // 12:00 WIB pada 12 September 2026.
  const siang = new Date("2026-09-12T05:00:00.000Z");
  const cek = (hari: string[], now = siang) => dailyCheckIn(hari, now, E);

  it("mengganti hari tengah malam WIB, bukan UTC", () => {
    expect(racingDayKey(new Date("2026-09-11T16:59:00.000Z"))).toBe("2026-09-11");
    expect(racingDayKey(new Date("2026-09-11T17:00:00.000Z"))).toBe("2026-09-12");
    expect(racingDayKey(siang)).toBe("2026-09-12");
  });

  it("menaik lalu mentok, berapa pun panjang streak", () => {
    expect(E.dailyRewards.map((_, i) => dailyRewardFor(i + 1, E))).toEqual([...E.dailyRewards]);
    expect(dailyRewardFor(8, E)).toBe(5_000);
    expect(dailyRewardFor(365, E)).toBe(5_000);
    // Hari ke-0 dan negatif tetap membayar rung pertama, bukan undefined.
    expect(dailyRewardFor(0, E)).toBe(500);
    expect(dailyRewardFor(-3, E)).toBe(500);
  });

  it("pemain baru langsung bisa klaim hari pertama", () => {
    expect(cek([])).toEqual({ streak: 0, claimedToday: false, reward: 500, nextReward: 750 });
  });

  it("menyambung streak dari kemarin, bukan memulai ulang", () => {
    expect(cek(["2026-09-11"])).toEqual({ streak: 1, claimedToday: false, reward: 750, nextReward: 1_000 });
  });

  it("tidak membayar dua kali di hari yang sama", () => {
    expect(cek(["2026-09-12", "2026-09-11", "2026-09-10"])).toEqual({
      streak: 3, claimedToday: true, reward: 0, nextReward: 1_500,
    });
  });

  it("mereset streak kalau ada hari yang bolong", () => {
    expect(cek(["2026-09-09", "2026-09-08"])).toEqual({
      streak: 0, claimedToday: false, reward: 500, nextReward: 750,
    });
  });

  it("melewati pergantian bulan", () => {
    const awalBulan = new Date("2026-09-01T05:00:00.000Z");
    expect(cek(["2026-08-31", "2026-08-30"], awalBulan)).toMatchObject({ streak: 2, reward: 1_000 });
  });

  it("menahan hadiah di rung terakhir untuk streak panjang", () => {
    const sepuluhHari = Array.from({ length: 10 }, (_, i) => {
      const d = new Date("2026-09-12T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
    expect(cek(sepuluhHari)).toEqual({
      streak: 10, claimedToday: true, reward: 0, nextReward: 5_000,
    });
    // Belum klaim hari ini, streak 7 -> hadiah hari ke-8 tetap 5.000.
    expect(cek(sepuluhHari.slice(1, 8))).toMatchObject({ streak: 7, reward: 5_000 });
  });
});
