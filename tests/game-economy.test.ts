import { describe, expect, it } from "vitest";
import {
  calculateRaceSettlement,
  HEARTBEAT_CAP_SECONDS,
} from "../lib/game-economy";
import { INITIAL_GAME, batteryTelemetry, gameReducer, lapReward, lapSeconds, modificationPartName, modificationPreview, upgradeCost } from "../lib/game";

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

  it("caps stale heartbeats and drops excess offline time", () => {
    const result = calculateRaceSettlement(
      settlementInput(),
      new Date(start.getTime() + 60 * 60 * 1000),
    );

    expect(result.creditedSeconds).toBe(HEARTBEAT_CAP_SECONDS);
    expect(result.completedLaps).toBe(3);
    expect(result.income).toBe(0.15);
  });
});
