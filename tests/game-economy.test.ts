import { describe, expect, it } from "vitest";
import {
  calculateRaceSettlement,
  dailyCheckIn,
  dailyRewardFor,
  racingDayKey,
} from "../lib/game-economy";
import { INITIAL_GAME, batteryTelemetry, formatDuration, gameReducer, lapReward, lapSeconds, modificationPartName, modificationPreview } from "../lib/game";
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

describe("Boost battery", () => {
  it("starts full and ready", () => {
    expect(batteryTelemetry(INITIAL_GAME)).toMatchObject({ percent: 100, phase: "ready", canBoost: true });
  });

  it("drains only during boost, then recharges from empty", () => {
    expect(batteryTelemetry({ boostLeft: 10, cooldown: 35, economy: E }).percent).toBe(100);
    expect(batteryTelemetry({ boostLeft: 5, cooldown: 30, economy: E })).toMatchObject({ percent: 50, phase: "discharging", canBoost: false });
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 25, economy: E })).toMatchObject({ percent: 0, phase: "charging", readyIn: 25 });
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 12.5, economy: E }).percent).toBe(50);
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 0, economy: E }).canBoost).toBe(true);
  });

  it("clamps stale timer values and never unlocks a running boost", () => {
    expect(batteryTelemetry({ boostLeft: 20, cooldown: 0, economy: E })).toMatchObject({ percent: 100, canBoost: false });
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 35, economy: E }).percent).toBe(0);
    expect(batteryTelemetry({ boostLeft: 0, cooldown: -1, economy: E }).percent).toBe(100);
  });

  it("splits a tick exactly when boost ends and keeps racing during recharge", () => {
    const next = gameReducer({ ...INITIAL_GAME, boostLeft: .1, cooldown: 25.1 }, { type: "tick", delta: .5 });
    expect(next.progress).toBeCloseTo(.6 / 8);
    expect(next.boostLeft).toBe(0);
    const charging = gameReducer(next, { type: "tick", delta: .5 });
    expect(charging.progress - next.progress).toBeCloseTo(.5 / 8);
    expect(charging.cooldown).toBeCloseTo(24.1);
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
      expect(battery.afterReward - battery.beforeReward).toBeCloseTo(.01);
      expect(battery.afterSeconds).toBe(battery.beforeSeconds);
      const tires = modificationPreview(state, "tires");
      expect(tires.afterSeconds).toBeLessThan(tires.beforeSeconds);
      expect(tires.afterReward).toBe(tires.beforeReward);
    }
  });

  it("shows exact affordability and caps the maximum level", () => {
    expect(modificationPreview({ ...INITIAL_GAME, balance: 24.5 }, "engine").shortfall).toBe(.5);
    expect(modificationPreview({ ...INITIAL_GAME, balance: 25 }, "engine").shortfall).toBe(0);
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
  it("keeps the base lap time, coin rewards, and upgrade costs", () => {
    expect(lapSeconds(INITIAL_GAME)).toBe(8);
    expect(lapReward(INITIAL_GAME)).toBe(0.05);
    expect(upgradeCostAt(E, "engine", 1)).toBe(25);
    expect(upgradeCostAt(E, "tires", 1)).toBe(15);
    expect(upgradeCostAt(E, "battery", 1)).toBe(20);
  });

  it("settles completed laps and carries fractional progress", () => {
    const result = calculateRaceSettlement(
      settlementInput({ progress: 0.5 }),
      new Date(start.getTime() + 12_000),
    );

    expect(result.completedLaps).toBe(2);
    expect(result.income).toBe(0.1);
    expect(result.progress).toBeCloseTo(0);
  });

  it("applies boost only to the time covered by the boost window", () => {
    const result = calculateRaceSettlement(
      settlementInput({ boostEndsAt: new Date(start.getTime() + 4_000) }),
      new Date(start.getTime() + 8_000),
    );

    expect(result.completedLaps).toBe(1);
    expect(result.progress).toBeCloseTo(0.5);
  });

  it("reports no offline window while the client is heartbeating", () => {
    const result = calculateRaceSettlement(
      settlementInput(),
      new Date(start.getTime() + E.heartbeatCapSeconds * 1000),
    );

    expect(result.offline).toBeNull();
    expect(result.creditedSeconds).toBe(E.heartbeatCapSeconds);
    expect(result.completedLaps).toBe(15);
    expect(result.income).toBe(0.75);
  });
});

/**
 * Base settlement state laps every 8s for 0.05 coins, so the whole table below
 * is derived from those two numbers.
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
      coins: 1.5,
    });
    expect(result.completedLaps).toBe(45);
    expect(result.income).toBe(2.25);
    expect(result.creditedSeconds).toBe(600);
  });

  it("still pays every second of an absence that lands exactly on the cap", () => {
    const result = settleAfter(E.offlineCapSeconds);

    expect(result.offline).toMatchObject({
      awaySeconds: E.offlineCapSeconds,
      creditedSeconds: E.offlineCapSeconds - E.heartbeatCapSeconds,
      capped: false,
      laps: 892,
      coins: 44.6,
    });
    expect(result.completedLaps).toBe(907);
    expect(result.income).toBe(45.35);
    expect(result.creditedSeconds).toBe(E.offlineCapSeconds);
  });

  it("truncates a ten hour absence to the four hour cap", () => {
    const result = settleAfter(10 * 60 * 60);

    expect(result.offline).toMatchObject({
      awaySeconds: 10 * 60 * 60,
      creditedSeconds: E.offlineCapSeconds,
      capped: true,
      laps: 900,
      coins: 45,
    });
    // A full day away pays exactly the same as the capped four hours.
    expect(settleAfter(24 * 60 * 60).offline).toMatchObject({
      creditedSeconds: E.offlineCapSeconds,
      laps: 900,
      coins: 45,
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

  it("keeps a boost inside the heartbeat window it was spent in", () => {
    const result = calculateRaceSettlement(
      settlementInput({ boostEndsAt: new Date(start.getTime() + 10_000) }),
      new Date(start.getTime() + 10 * 60 * 1000),
    );

    // 10s boosted (2.5 laps) + 110s normal (13.75) + 480s offline (30).
    expect(result.completedLaps).toBe(46);
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
    expect(dailyRewardFor(8, E)).toBe(10);
    expect(dailyRewardFor(365, E)).toBe(10);
    // Hari ke-0 dan negatif tetap membayar rung pertama, bukan undefined.
    expect(dailyRewardFor(0, E)).toBe(1);
    expect(dailyRewardFor(-3, E)).toBe(1);
  });

  it("pemain baru langsung bisa klaim hari pertama", () => {
    expect(cek([])).toEqual({ streak: 0, claimedToday: false, reward: 1, nextReward: 2 });
  });

  it("menyambung streak dari kemarin, bukan memulai ulang", () => {
    expect(cek(["2026-09-11"])).toEqual({ streak: 1, claimedToday: false, reward: 2, nextReward: 3 });
  });

  it("tidak membayar dua kali di hari yang sama", () => {
    expect(cek(["2026-09-12", "2026-09-11", "2026-09-10"])).toEqual({
      streak: 3, claimedToday: true, reward: 0, nextReward: 4,
    });
  });

  it("mereset streak kalau ada hari yang bolong", () => {
    expect(cek(["2026-09-09", "2026-09-08"])).toEqual({
      streak: 0, claimedToday: false, reward: 1, nextReward: 2,
    });
  });

  it("melewati pergantian bulan", () => {
    const awalBulan = new Date("2026-09-01T05:00:00.000Z");
    expect(cek(["2026-08-31", "2026-08-30"], awalBulan)).toMatchObject({ streak: 2, reward: 3 });
  });

  it("menahan hadiah di rung terakhir untuk streak panjang", () => {
    const sepuluhHari = Array.from({ length: 10 }, (_, i) => {
      const d = new Date("2026-09-12T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
    expect(cek(sepuluhHari)).toEqual({
      streak: 10, claimedToday: true, reward: 0, nextReward: 10,
    });
    // Belum klaim hari ini, streak 7 -> hadiah hari ke-8 tetap 10.
    expect(cek(sepuluhHari.slice(1, 8))).toMatchObject({ streak: 7, reward: 10 });
  });
});
