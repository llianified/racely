import { describe, expect, it } from "vitest";
import { INITIAL_GAME, MISSIONS, type GameState } from "../lib/game";
import { claimProgress, createRaceStint, nextRaceGoal, raceStintReducer } from "../lib/race-journey";

const racer = (overrides: Partial<GameState> = {}): GameState => ({ ...INITIAL_GAME, rewardClaimed: true, ...overrides });

describe("Race etapes", () => {
  it("starts at the current confirmed total, not lifetime lap zero", () => {
    const stint = createRaceStint({ laps: 120, earned: 6 });
    expect(stint).toMatchObject({ start: { laps: 120, earned: 6 }, result: null });
    expect(raceStintReducer(stint, { type: "confirm", confirmed: { laps: 124, earned: 6.2 } })).toBe(stint);
  });

  it("uses actual earned delta, including upgrades and circuit changes", () => {
    const stint = createRaceStint({ laps: 20, earned: 1 });
    const finished = raceStintReducer(stint, { type: "confirm", confirmed: { laps: 26, earned: 1.34 } });
    expect(finished.result).toEqual({ laps: 6, coins: .34 });
  });

  it("freezes the receipt while autopilot keeps accumulating laps", () => {
    const stint = createRaceStint({ laps: 0, earned: 0 });
    const finished = raceStintReducer(stint, { type: "confirm", confirmed: { laps: 5, earned: .25 } });
    expect(raceStintReducer(finished, { type: "confirm", confirmed: { laps: 10, earned: .5 } })).toBe(finished);
    expect(raceStintReducer(finished, { type: "continue", confirmed: { laps: 10, earned: .5 } })).toEqual({ start: { laps: 10, earned: .5 }, number: 2, result: null });
  });

  it("cannot skip an unfinished etape or replay continuation twice", () => {
    const stint = createRaceStint({ laps: 0, earned: 0 });
    expect(raceStintReducer(stint, { type: "continue", confirmed: { laps: 2, earned: .1 } })).toBe(stint);
    const done = raceStintReducer(stint, { type: "confirm", confirmed: { laps: 5, earned: .25 } });
    const next = raceStintReducer(done, { type: "continue", confirmed: { laps: 5, earned: .25 } });
    expect(raceStintReducer(next, { type: "continue", confirmed: { laps: 5, earned: .25 } })).toBe(next);
  });
});

describe("Next racing action", () => {
  it("surfaces the starter reward without a trip to another tab", () => {
    expect(nextRaceGoal(INITIAL_GAME).action).toEqual({ type: "gift" });
  });
  it("prioritizes claimable missions, then circuit unlock", () => {
    expect(nextRaceGoal(racer({ laps: 25 })).action).toEqual({ type: "mission", id: "laps" });
    expect(nextRaceGoal(racer({ laps: 25, missionsClaimed: ["laps"] })).action).toEqual({ type: "circuit" });
    expect(nextRaceGoal(racer({ laps: 25, circuit: 1, missionsClaimed: ["laps"] })).action?.type).not.toBe("circuit");
  });
  it("only recommends affordable upgrades and excludes maxed slots", () => {
    const affordable = nextRaceGoal(racer({ balance: 15 }));
    expect(affordable.action).toEqual({ type: "workshop" });
    expect(affordable.title).toContain("Ban & roller");
    const maxTires = nextRaceGoal(racer({ balance: 20, levels: { engine: 1, tires: 10, battery: 1 }, missionsClaimed: ["upgrade"] }));
    expect(maxTires.title).toContain("Baterai");
  });
  it("never treats fractional pending coins as spendable", () => {
    expect(nextRaceGoal(racer({ balance: 14.5, pending: .5 })).action?.type).not.toBe("claim");
    expect(nextRaceGoal(racer({ balance: 14.5, pending: 1 })).action).toEqual({ type: "claim" });
    const saving = nextRaceGoal(racer({ balance: 14.5, pending: .5, circuit: 1, laps: 25, missionsClaimed: ["laps"] }));
    expect(saving.detail).toContain("Kurang 0,50 koin");
    expect(saving.progress).toEqual({ value: 14.5, target: 15 });
  });
  it("tracks mission and circuit progress before expensive upgrades", () => {
    expect(nextRaceGoal(racer({ laps: 5 })).progress).toEqual({ value: 5, target: 10 });
    expect(nextRaceGoal(racer({ laps: 15, missionsClaimed: ["laps"] })).progress).toEqual({ value: 15, target: 25 });
  });
  it("handles a fully completed game without recommending another purchase", () => {
    const goal = nextRaceGoal(racer({ circuit: 1, laps: 1000, earned: 100, levels: { engine: 10, tires: 10, battery: 10 }, missionsClaimed: MISSIONS.map(m => m.id) }));
    expect(goal.action).toBeUndefined();
    expect(goal.title).toContain("maksimal");
  });
});

describe("Race claim explanation", () => {
  it("shows the exact integer transfer and saved fraction", () => {
    expect(claimProgress(racer({ pending: 1.25 }))).toEqual({ claimable: 1, remainder: .25, lapsToCoin: 15 });
    expect(claimProgress(racer({ pending: .95 })).lapsToCoin).toBe(1);
    expect(claimProgress(racer({ pending: 0 })).lapsToCoin).toBe(20);
  });
  it("uses the selected circuit and battery level for the next coin", () => {
    expect(claimProgress(racer({ pending: .86, circuit: 1 })).lapsToCoin).toBe(2);
    expect(claimProgress(racer({ pending: .9, levels: { engine: 1, tires: 1, battery: 6 } })).lapsToCoin).toBe(1);
  });
});
