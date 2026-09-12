import { describe, expect, it } from "vitest";
import {
  calculateRaceSettlement,
  dailyCheckIn,
  dailyRewardFor,
  HEARTBEAT_CAP_SECONDS,
  OFFLINE_CAP_SECONDS,
  OFFLINE_RATE,
  racingDayKey,
} from "../lib/game-economy";
import { DAILY_REWARDS, INITIAL_GAME, batteryTelemetry, formatDuration, gameReducer, lapReward, lapSeconds, modificationPartName, modificationPreview, upgradeCost } from "../lib/game";

const start = new Date("2026-09-11T00:00:00.000Z");

function settlementInput(
  overrides: Partial<Parameters<typeof calculateRaceSettlement>[0]> = {},
) {
  return {
    progress: 0,
    levels: { engine: 1, tires: 1, battery: 1 },
    circuit: 0,
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
    expect(batteryTelemetry({ boostLeft: 10, cooldown: 35 }).percent).toBe(100);
    expect(batteryTelemetry({ boostLeft: 5, cooldown: 30 })).toMatchObject({ percent: 50, phase: "discharging", canBoost: false });
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 25 })).toMatchObject({ percent: 0, phase: "charging", readyIn: 25 });
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 12.5 }).percent).toBe(50);
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 0 }).canBoost).toBe(true);
  });

  it("clamps stale timer values and never unlocks a running boost", () => {
    expect(batteryTelemetry({ boostLeft: 20, cooldown: 0 })).toMatchObject({ percent: 100, canBoost: false });
    expect(batteryTelemetry({ boostLeft: 0, cooldown: 35 }).percent).toBe(0);
    expect(batteryTelemetry({ boostLeft: 0, cooldown: -1 }).percent).toBe(100);
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
    expect(preview.cost).toBe(upgradeCost("engine", 2));
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
    expect(upgradeCost("engine", 1)).toBe(25);
    expect(upgradeCost("tires", 1)).toBe(15);
    expect(upgradeCost("battery", 1)).toBe(20);
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
      new Date(start.getTime() + HEARTBEAT_CAP_SECONDS * 1000),
    );

    expect(result.offline).toBeNull();
    expect(result.creditedSeconds).toBe(HEARTBEAT_CAP_SECONDS);
    expect(result.completedLaps).toBe(3);
    expect(result.income).toBe(0.15);
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
    // 30s online -> 3 laps; the remaining 570s at half speed -> 36 more.
    expect(result.offline).toEqual({
      awaySeconds: 600,
      creditedSeconds: 570,
      capped: false,
      laps: 36,
      coins: 1.8,
    });
    expect(result.completedLaps).toBe(39);
    expect(result.income).toBe(1.95);
    expect(result.creditedSeconds).toBe(600);
  });

  it("still pays every second of an absence that lands exactly on the cap", () => {
    const result = settleAfter(OFFLINE_CAP_SECONDS);

    expect(result.offline).toMatchObject({
      awaySeconds: OFFLINE_CAP_SECONDS,
      creditedSeconds: OFFLINE_CAP_SECONDS - HEARTBEAT_CAP_SECONDS,
      capped: false,
      laps: 898,
      coins: 44.9,
    });
    expect(result.completedLaps).toBe(901);
    expect(result.income).toBe(45.05);
    expect(result.creditedSeconds).toBe(OFFLINE_CAP_SECONDS);
  });

  it("truncates a ten hour absence to the four hour cap", () => {
    const result = settleAfter(10 * 60 * 60);

    expect(result.offline).toMatchObject({
      awaySeconds: 10 * 60 * 60,
      creditedSeconds: OFFLINE_CAP_SECONDS,
      capped: true,
      laps: 900,
      coins: 45,
    });
    // A full day away pays exactly the same as the capped four hours.
    expect(settleAfter(24 * 60 * 60).offline).toMatchObject({
      creditedSeconds: OFFLINE_CAP_SECONDS,
      laps: 900,
      coins: 45,
    });
  });

  it("credits offline seconds at exactly half the online lap rate", () => {
    const offline = settleAfter(OFFLINE_CAP_SECONDS + HEARTBEAT_CAP_SECONDS);
    const onlineLaps = OFFLINE_CAP_SECONDS / lapSeconds(INITIAL_GAME);

    expect(offline.offline?.creditedSeconds).toBe(OFFLINE_CAP_SECONDS);
    expect(offline.offline?.laps).toBe(onlineLaps * OFFLINE_RATE);
    expect(OFFLINE_RATE).toBe(0.5);
  });

  it("never pays a short absence less than the heartbeat window alone", () => {
    const heartbeat = settleAfter(HEARTBEAT_CAP_SECONDS);
    const justOver = settleAfter(HEARTBEAT_CAP_SECONDS + 10);

    // 30s full rate (3.75 laps) + 10s half rate (.625) = 4.375. A single 0.5x
    // cap over the whole 40s would have paid 2.5 laps -- less than standing still.
    expect(heartbeat.completedLaps).toBe(3);
    expect(justOver.completedLaps).toBe(4);
    expect(justOver.progress).toBeCloseTo(0.375);
    expect(justOver.offline).toMatchObject({ laps: 1, coins: 0.05 });
  });

  it("keeps a boost inside the heartbeat window it was spent in", () => {
    const result = calculateRaceSettlement(
      settlementInput({ boostEndsAt: new Date(start.getTime() + 10_000) }),
      new Date(start.getTime() + 10 * 60 * 1000),
    );

    // 10s boosted (2.5 laps) + 20s normal (2.5) + 570s offline (35.625).
    expect(result.completedLaps).toBe(40);
    expect(result.offline).toMatchObject({ laps: 35, creditedSeconds: 570 });
  });

  it("spells the offline window the way the dialog reads it", () => {
    expect(formatDuration(45)).toBe("45 detik");
    expect(formatDuration(600)).toBe("10 menit");
    expect(formatDuration(OFFLINE_CAP_SECONDS)).toBe("4 jam");
    expect(formatDuration(4 * 60 * 60 + 25 * 60)).toBe("4 jam 25 menit");
    expect(formatDuration(-1)).toBe("0 detik");
  });
});

describe("Check-in harian", () => {
  // 12:00 WIB pada 12 September 2026.
  const siang = new Date("2026-09-12T05:00:00.000Z");
  const cek = (hari: string[], now = siang) => dailyCheckIn(hari, now);

  it("mengganti hari tengah malam WIB, bukan UTC", () => {
    expect(racingDayKey(new Date("2026-09-11T16:59:00.000Z"))).toBe("2026-09-11");
    expect(racingDayKey(new Date("2026-09-11T17:00:00.000Z"))).toBe("2026-09-12");
    expect(racingDayKey(siang)).toBe("2026-09-12");
  });

  it("menaik lalu mentok, berapa pun panjang streak", () => {
    expect(DAILY_REWARDS.map((_, i) => dailyRewardFor(i + 1))).toEqual([...DAILY_REWARDS]);
    expect(dailyRewardFor(8)).toBe(10);
    expect(dailyRewardFor(365)).toBe(10);
    // Hari ke-0 dan negatif tetap membayar rung pertama, bukan undefined.
    expect(dailyRewardFor(0)).toBe(1);
    expect(dailyRewardFor(-3)).toBe(1);
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
