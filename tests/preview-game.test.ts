import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAR_CATALOG, CAR_MODEL_IDS, isCarColor } from "../lib/car-catalog";
import { gameReducer, INITIAL_GAME, lapReward, lapSeconds } from "../lib/game";
import type { GameState } from "../lib/game";

vi.mock("server-only", () => ({}));
import { getPreviewGameState, performPreviewGameAction, PREVIEW_GAME_COOKIE, previewCarActionSchema } from "../lib/preview-game";

const now = new Date("2026-09-12T00:00:00Z");
const identity = { userId: `preview:${randomUUID()}`, displayName: "Preview Racer", username: "preview", photoUrl: null };
const request = (cookie?: string) => new Request("http://localhost/api/game", { headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {} });
const action = (cookie: string, command: Parameters<typeof performPreviewGameAction>[3], id = randomUUID()) => performPreviewGameAction(request(cookie), identity, id, command);
const selectLuna = { type: "select-car", model: "luna-gt", color: "#b9a1ed" } as const;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("Preview car selection", () => {
  it("accepts all catalog colors only for their models", () => {
    for (const model of CAR_MODEL_IDS) {
      for (const choice of CAR_CATALOG[model].colors) expect(isCarColor(model, choice.color)).toBe(true);
      expect(isCarColor(model, "#000000")).toBe(false);
    }
    expect(isCarColor("neo-falcon", "#b9a1ed")).toBe(false);
    expect(isCarColor("luna-gt", "#4275ff")).toBe(false);
    expect(previewCarActionSchema.safeParse({ requestId: randomUUID(), action: { ...selectLuna, model: "unknown" } }).success).toBe(false);
  });

  it("requires onboarding for a new cookie, but not legacy database state", () => {
    const fresh = getPreviewGameState(request(), identity);
    expect(fresh.state.carSelection).toEqual({ model: null, returningPlayer: false });
    expect(INITIAL_GAME.carSelection).toBeUndefined();
    expect(gameReducer(INITIAL_GAME, { type: "tick", delta: .5 }).progress).toBeGreaterThan(0);
  });

  it("freezes both server and client accrual while awaiting a choice", () => {
    const fresh = getPreviewGameState(request(), identity);
    vi.advanceTimersByTime(60 * 60 * 1000);
    const synced = action(fresh.cookieValue, { type: "sync" });
    expect(synced.state).toEqual(fresh.state);
    expect(gameReducer(fresh.state, { type: "tick", delta: 60 })).toEqual(fresh.state);
    expect(() => action(synced.cookieValue, { type: "gift" })).toThrow("Pilih mobilmu");
    expect(() => action(synced.cookieValue, { type: "color", color: "#4275ff" })).toThrow("Pilih mobilmu");
  });

  it("confirms for free, survives reload and starts time only after confirmation", () => {
    const fresh = getPreviewGameState(request(), identity);
    vi.advanceTimersByTime(120000);
    const selected = action(fresh.cookieValue, selectLuna);
    expect(selected.state).toEqual({ ...fresh.state, color: selectLuna.color, carSelection: { model: "luna-gt", returningPlayer: false } });
    expect(getPreviewGameState(request(selected.cookieValue), identity).state).toEqual(selected.state);
    vi.advanceTimersByTime(8000);
    expect(action(selected.cookieValue, { type: "sync" }).state.laps).toBe(1);
  });

  it("handles duplicate confirmations without resetting a later color", () => {
    const fresh = getPreviewGameState(request(), identity);
    const requestId = randomUUID();
    const selected = action(fresh.cookieValue, selectLuna, requestId);
    expect(action(selected.cookieValue, selectLuna, requestId).state).toEqual(selected.state);
    const repainted = action(selected.cookieValue, { type: "color", color: "#e6a4ba" });
    expect(action(repainted.cookieValue, selectLuna, requestId).state).toEqual(repainted.state);
    expect(action(repainted.cookieValue, selectLuna).state).toEqual(repainted.state);
  });

  it("rejects another model after confirmation and rejects incompatible colors", () => {
    const fresh = getPreviewGameState(request(), identity);
    expect(() => action(fresh.cookieValue, { ...selectLuna, color: "#4275ff" })).toThrow("tidak valid");
    const selected = action(fresh.cookieValue, selectLuna);
    expect(() => action(selected.cookieValue, { type: "select-car", model: "neo-falcon", color: "#4275ff" })).toThrow("tidak dapat diganti");
    expect(() => action(selected.cookieValue, { type: "color", color: "#4275ff" })).toThrow("tidak tersedia");
    expect(() => action(selected.cookieValue, { type: "color", color: "#000000" })).toThrow("tidak tersedia");
  });

  it("offers a legacy cookie one choice without discarding any progress", () => {
    const state: GameState = { ...INITIAL_GAME, balance: 250, pending: 3.25, earned: 29.25, laps: 80, progress: .4, levels: { engine: 3, tires: 2, battery: 4 }, rewardClaimed: true, missionsClaimed: ["laps"], color: "#f4b65b", withdrawals: [{ id: randomUUID(), coins: 100, method: "dana", account: "081234567890", accountName: "Preview Racer", status: "pending", createdAt: now.toISOString() }] };
    const cookie = Buffer.from(JSON.stringify({ version: 1, userId: identity.userId, updatedAt: now.getTime(), receipts: [], state })).toString("base64url");
    const offered = getPreviewGameState(request(cookie), identity);
    expect(offered.state).toEqual({ ...state, carSelection: { model: null, returningPlayer: true } });
    vi.advanceTimersByTime(3600000);
    const selected = action(offered.cookieValue, selectLuna);
    expect(selected.state).toEqual({ ...state, color: selectLuna.color, carSelection: { model: "luna-gt", returningPlayer: true } });
  });

  it("credits time owed before the legacy offer, then pauses", () => {
    const cookie = Buffer.from(JSON.stringify({ version: 1, userId: identity.userId, updatedAt: now.getTime() - 16000, receipts: [], state: INITIAL_GAME })).toString("base64url");
    const offered = getPreviewGameState(request(cookie), identity);
    expect(offered.state.laps).toBe(2);
    expect(offered.state.pending).toBe(.1);
    vi.advanceTimersByTime(16000);
    expect(getPreviewGameState(request(offered.cookieValue), identity).state).toEqual(offered.state);
  });

  it("keeps performance and rewards equal for both models", () => {
    const states = CAR_MODEL_IDS.map((model) => ({ ...INITIAL_GAME, levels: { engine: 4, tires: 3, battery: 5 }, carSelection: { model, returningPlayer: false } }));
    expect(lapSeconds(states[0])).toBe(lapSeconds(states[1]));
    expect(lapReward(states[0])).toBe(lapReward(states[1]));
  });
});
