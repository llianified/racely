import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ECONOMY as E, cosmeticPriceAt, economyConfigSchema } from "../lib/economy-config";
import { dailyMissionsFor, settleDailyMissions, claimDailyMission, recordDailyBoost } from "../lib/daily-missions";
import { applyPaintCommand, PAINT_CATALOG } from "../lib/car-paints";
import { INITIAL_GAME, lapReward, lapSeconds } from "../lib/game";
import { calculateRaceSettlement } from "../lib/game-economy";
vi.mock("server-only", () => ({}));
import { getPreviewGameState, performPreviewGameAction, PREVIEW_GAME_COOKIE } from "../lib/preview-game";

const now = new Date("2026-09-12T12:00:00Z");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());
const identity = { userId: `preview:${randomUUID()}`, displayName: "Feature Racer", username: null, photoUrl: null, startParam: null };
const request = (cookie?: string) => new Request("http://localhost/api/game", { headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {} });
const act = (cookie: string, command: Parameters<typeof performPreviewGameAction>[3], id = randomUUID()) => performPreviewGameAction(request(cookie), identity, id, command, E);
const racing = () => act(getPreviewGameState(request(), identity, E).cookieValue, { type: "select-car", model: "luna-gt", color: "#b9a1ed" });

describe("Daily missions", () => {
  it("rotates three unique achievable mission kinds at WIB midnight, resetting only daily progress", () => {
    const day = dailyMissionsFor(null, new Date("2026-09-12T16:59:59Z"), E);
    expect(new Set(day.items.map(item => item.kind)).size).toBe(3);
    const progressed = recordDailyBoost(day, true);
    const next = dailyMissionsFor(progressed, new Date("2026-09-12T17:00:00Z"), E);
    expect(next.day).toBe("2026-09-13");
    expect(next.items.map(item => item.kind)).not.toEqual(day.items.map(item => item.kind));
    expect(next.values).toEqual({ laps: 0, earn: 0, boosts: 0, clean: 0 });
  });
  it("freezes today's targets and budget, distributing even non-divisible and zero budgets exactly", () => {
    for (const budget of [0, 1, 2, 6, 7]) {
      const daily = dailyMissionsFor(null, now, { ...E, dailyMissionRewardCap: budget });
      expect(daily.items.reduce((sum, item) => sum + item.reward, 0)).toBe(budget);
      expect(dailyMissionsFor(daily, now, { ...E, dailyMissionRewardCap: 999 })).toEqual(daily);
    }
    expect(economyConfigSchema.safeParse({ ...E, dailyMissionLapsTarget: 0 }).success).toBe(false);
  });
  it("rejects premature, expired, unavailable claims and pays each ready item exactly once", () => {
    let daily = dailyMissionsFor(null, now, E);
    expect(() => claimDailyMission(daily, daily.day, daily.items[0].kind)).toThrow("belum tercapai");
    expect(() => claimDailyMission(daily, "2026-09-11", daily.items[0].kind)).toThrow("berganti");
    expect(() => claimDailyMission(daily, daily.day, "clean")).toThrow("tidak tersedia");
    daily = { ...daily, values: { laps: 1e9, earn: 1e9, boosts: 1e9, clean: 1e9 } };
    let paid = 0;
    for (const item of daily.items) {
      const result = claimDailyMission(daily, daily.day, item.kind);
      daily = result.dailyMissions;
      paid += result.reward;
      expect(claimDailyMission(daily, daily.day, item.kind).reward).toBe(0);
    }
    expect(paid).toBe(E.dailyMissionRewardCap);
  });
  it("attributes only today's settled laps and income across midnight without refreshing offline caps", () => {
    const input = { ...INITIAL_GAME, economy: E, lastSettledAt: new Date("2026-09-12T16:59:00Z"), boostEndsAt: null };
    const day = dailyMissionsFor(null, input.lastSettledAt, E);
    const end = new Date("2026-09-12T17:02:00Z");
    const total = calculateRaceSettlement(input, end);
    const before = calculateRaceSettlement(input, new Date("2026-09-12T17:00:00Z"));
    const daily = settleDailyMissions(day, input, end);
    expect(daily.values.laps).toBe(total.completedLaps - before.completedLaps);
    expect(daily.values.earn).toBeCloseTo(total.income - before.income);
    const longAway = { ...input, lastSettledAt: new Date("2026-09-10T12:00:00Z") };
    expect(settleDailyMissions(day, longAway, end).values.laps).toBe(0);
    expect(settleDailyMissions(null, input, end).values.laps).toBe(0);
  });
  it("tracks settled racing rather than gift/check-in claims and persists on reload", () => {
    const selected = racing();
    const gifted = act(selected.cookieValue, { type: "gift" });
    expect(gifted.state.dailyMissions?.values.earn).toBe(0);
    vi.advanceTimersByTime(16000);
    const settled = act(gifted.cookieValue, { type: "sync" });
    expect(settled.state.dailyMissions?.values).toMatchObject({ laps: 2, earn: .08 });
    expect(getPreviewGameState(request(settled.cookieValue), identity, E).state.dailyMissions).toEqual(settled.state.dailyMissions);
  });
  it("counts boost once per receipt and rejects a repeated launch during cooldown", () => {
    const selected = racing();
    const id = randomUUID();
    const launched = act(selected.cookieValue, { type: "boost" }, id);
    expect(launched.state.dailyMissions?.values.boosts).toBe(1);
    expect(act(launched.cookieValue, { type: "boost" }, id).state.dailyMissions).toEqual(launched.state.dailyMissions);
    expect(() => act(launched.cookieValue, { type: "boost" })).toThrow("mengisi ulang");
  });
  it("claims in preview once, rejecting yesterday after rollover while keeping lifetime progress", () => {
    const selected = racing();
    const fixture = JSON.parse(Buffer.from(selected.cookieValue, "base64url").toString());
    fixture.state.dailyMissions.values.laps = E.dailyMissionLapsTarget;
    fixture.state.laps = 100;
    fixture.state.missionsClaimed = ["laps"];
    const cookie = Buffer.from(JSON.stringify(fixture)).toString("base64url");
    const command = { type: "daily-mission", day: selected.state.dailyMissions!.day, kind: "laps" } as const;
    const claimed = act(cookie, command);
    expect(claimed.state.balance).toBe(selected.state.balance + 2);
    expect(act(claimed.cookieValue, command).state.balance).toBe(claimed.state.balance);
    vi.setSystemTime(new Date("2026-09-12T17:00:00Z"));
    expect(() => act(claimed.cookieValue, command)).toThrow("berganti");
    const next = getPreviewGameState(request(claimed.cookieValue), identity, E).state;
    expect(next.dailyMissions?.items.every(item => !item.claimed)).toBe(true);
    expect(next.missionsClaimed).toContain("laps");
    expect(next.laps).toBeGreaterThanOrEqual(100);
  });
});

describe("Collectible paints", () => {
  it("prices tiers from configurable baseline income, not the player's upgrade level", () => {
    const base = cosmeticPriceAt(E, 1);
    expect(base).toBe(108);
    expect(cosmeticPriceAt(E, 2)).toBe(base * 2);
    expect(cosmeticPriceAt({ ...E, cosmeticBaseHours: 12 }, 1)).toBe(base * 2);
  });
  it("requires funds and ownership, charges once, and does not change race performance", () => {
    const state = { ...INITIAL_GAME, balance: 1000, ownedPaints: [] };
    expect(() => applyPaintCommand(state, { type: "equip-paint", paintId: "jade" }, E)).toThrow("Beli cat");
    expect(() => applyPaintCommand({ ...state, balance: 0 }, { type: "buy-paint", paintId: "jade" }, E)).toThrow("Koin belum cukup");
    const bought = { ...state, ...applyPaintCommand(state, { type: "buy-paint", paintId: "jade" }, E) };
    expect(bought.balance).toBe(1000 - cosmeticPriceAt(E, 1));
    expect(applyPaintCommand(bought, { type: "buy-paint", paintId: "jade" }, E).balance).toBe(bought.balance);
    const equipped = { ...bought, ...applyPaintCommand(bought, { type: "equip-paint", paintId: "jade" }, E) };
    expect(equipped.color).toBe(PAINT_CATALOG.jade.color);
    expect(lapSeconds(equipped)).toBe(lapSeconds(state));
    expect(lapReward(equipped)).toBe(lapReward(state));
  });
  it("persists ownership/equipment in preview and cannot acquire paint through free recoloring", () => {
    const fresh = getPreviewGameState(request(), identity, E);
    expect(() => act(fresh.cookieValue, { type: "buy-paint", paintId: "jade" })).toThrow("Pilih mobilmu");
    const selected = racing();
    const fixture = JSON.parse(Buffer.from(selected.cookieValue, "base64url").toString());
    fixture.state.balance = 1000;
    const cookie = Buffer.from(JSON.stringify(fixture)).toString("base64url");
    expect(() => act(cookie, { type: "color", color: PAINT_CATALOG.jade.color })).toThrow("tidak tersedia");
    const id = randomUUID();
    const bought = act(cookie, { type: "buy-paint", paintId: "jade" }, id);
    expect(act(bought.cookieValue, { type: "buy-paint", paintId: "jade" }, id).state.balance).toBe(bought.state.balance);
    const equipped = act(bought.cookieValue, { type: "equip-paint", paintId: "jade" });
    expect(getPreviewGameState(request(equipped.cookieValue), identity, E).state).toMatchObject({ ownedPaints: ["jade"], color: PAINT_CATALOG.jade.color });
    const standard = act(equipped.cookieValue, { type: "color", color: "#b9a1ed" });
    expect(standard.state.ownedPaints).toEqual(["jade"]);
    expect(standard.state.balance).toBe(equipped.state.balance);
  });
});
