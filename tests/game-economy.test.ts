import { describe, expect, it } from "vitest";
import {
  calculateRaceSettlement,
  HEARTBEAT_CAP_SECONDS,
} from "../lib/game-economy";
import { INITIAL_GAME, lapReward, lapSeconds, upgradeCost } from "../lib/game";

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
