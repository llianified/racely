import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ECONOMY } from "../lib/economy-config";
import { adClaimKey, adClaimRange, adRewardStatus } from "../lib/game-economy";
import { isMonetagRewardEligible } from "../components/game/monetag";

vi.mock("server-only", () => ({}));
import { getPreviewGameState, performPreviewGameAction, PREVIEW_GAME_COOKIE } from "../lib/preview-game";

const E = DEFAULT_ECONOMY;
const now = new Date("2026-09-12T00:00:00Z");
const identity = { userId: `preview:${randomUUID()}`, displayName: "Preview Racer", username: "preview", photoUrl: null, startParam: null };
const request = (cookie?: string) => new Request("http://localhost/api/game", { headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {} });
const action = (cookie: string, command: Parameters<typeof performPreviewGameAction>[3], economy = E, id = randomUUID()) =>
  performPreviewGameAction(request(cookie), identity, id, command, economy);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("Monetag reward eligibility", () => {
  it("only accepts uninterrupted valued events", () => {
    expect(isMonetagRewardEligible({ reward_event_type: "valued" }, false)).toBe(true);
    expect(isMonetagRewardEligible({ reward_event_type: "non_valued" }, false)).toBe(false);
    expect(isMonetagRewardEligible({}, false)).toBe(false);
    expect(isMonetagRewardEligible(undefined, false)).toBe(false);
    expect(isMonetagRewardEligible({ reward_event_type: "valued" }, true)).toBe(false);
  });
});

describe("adRewardStatus", () => {
  it("offers the configured reward until the daily cap is reached", () => {
    expect(adRewardStatus(0, E)).toEqual({ watchedToday: 0, dailyCap: 5, reward: 250, available: true });
    expect(adRewardStatus(4, E)).toMatchObject({ watchedToday: 4, available: true, reward: 250 });
    expect(adRewardStatus(5, E)).toEqual({ watchedToday: 5, dailyCap: 5, reward: 0, available: false });
  });

  it("clamps out-of-range counts and turns off with a zero cap", () => {
    expect(adRewardStatus(-3, E).watchedToday).toBe(0);
    expect(adRewardStatus(99, E).watchedToday).toBe(5);
    expect(adRewardStatus(0, { ...E, adRewardDailyCap: 0 })).toEqual({ watchedToday: 0, dailyCap: 0, reward: 0, available: false });
  });

  it("builds claim keys that sort inside their racing day range", () => {
    const range = adClaimRange("2026-09-12");
    for (const n of [1, 5, 12]) {
      const key = adClaimKey("2026-09-12", n);
      expect(key >= range.start && key < range.end).toBe(true);
    }
    expect(adClaimKey("2026-09-13", 1) >= range.end).toBe(true);
    expect(adClaimKey("2026-09-11", 1) < range.start).toBe(true);
  });
});

describe("Preview watch-ad", () => {
  const racing = () => {
    const fresh = getPreviewGameState(request(), identity, E);
    return action(fresh.cookieValue, { type: "select-car", model: "luna-gt", color: "#b9a1ed" }).cookieValue;
  };

  it("pays per view, stops at the cap, and resets on the next racing day", () => {
    let cookie = racing();
    const start = getPreviewGameState(request(cookie), identity, E).state;
    expect(start.adReward).toMatchObject({ watchedToday: 0, dailyCap: 5, available: true });

    for (let n = 1; n <= 5; n += 1) {
      const next = action(cookie, { type: "watch-ad" });
      expect(next.state.balance).toBe(start.balance + n * E.adRewardCoins);
      expect(next.state.adReward.watchedToday).toBe(n);
      cookie = next.cookieValue;
    }
    const capped = getPreviewGameState(request(cookie), identity, E).state;
    expect(capped.adReward).toMatchObject({ available: false, reward: 0 });
    expect(() => action(cookie, { type: "watch-ad" })).toThrow("sudah habis");

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    const tomorrow = action(cookie, { type: "watch-ad" });
    expect(tomorrow.state.adReward.watchedToday).toBe(1);
    expect(tomorrow.state.balance).toBe(capped.balance + E.adRewardCoins);
  });

  it("refuses when the feature is switched off and hides the counter from client state", () => {
    const cookie = racing();
    expect(() => action(cookie, { type: "watch-ad" }, { ...E, adRewardDailyCap: 0 })).toThrow("tidak aktif");
    const paid = action(cookie, { type: "watch-ad" });
    expect("adWatches" in paid.state).toBe(false);
  });
});
