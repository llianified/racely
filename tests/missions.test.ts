import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ECONOMY } from "../lib/economy-config";
import {
  buildMissionBoard,
  millisecondsUntilMissionReset,
  missionClaimKey,
  missionPeriodKeys,
  normalizeMissionCounters,
  parseMissionClaimKey,
  pruneMissionClaims,
  type MissionCounters,
} from "../lib/missions";

vi.mock("server-only", () => ({}));
import {
  getPreviewGameState,
  performPreviewGameAction,
  PREVIEW_GAME_COOKIE,
} from "../lib/preview-game";

const E = DEFAULT_ECONOMY;
const now = new Date("2026-09-13T12:00:00Z");
const identity = {
  userId: "preview:mission-lifecycle",
  displayName: "Mission Racer",
  username: "mission-racer",
  photoUrl: null,
  startParam: null,
};
const request = (cookie?: string) =>
  new Request("http://localhost/api/game", {
    headers: cookie ? { cookie: `${PREVIEW_GAME_COOKIE}=${cookie}` } : {},
  });
const act = (
  cookie: string,
  command: Parameters<typeof performPreviewGameAction>[3],
  requestId = randomUUID(),
) => performPreviewGameAction(request(cookie), identity, requestId, command, E);
const onboarded = () =>
  act(getPreviewGameState(request(), identity, E).cookieValue, {
    type: "select-car",
    model: "luna-gt",
    color: "#b9a1ed",
  });
const decodeCookie = (cookie: string) =>
  JSON.parse(Buffer.from(cookie, "base64url").toString("utf8"));
const encodeCookie = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe("Deterministic mission selection", () => {
  const counters: MissionCounters = {
    dayKey: "2026-09-13",
    dayLaps: 0,
    dayBoosts: 0,
    weekKey: "2026-W37",
    weekLaps: 0,
    weekBoosts: 0,
  };

  it("assigns the configured daily count and one weekly mission without duplicates", () => {
    const board = buildMissionBoard(E, identity.userId, counters, []);

    expect(board.daily).toHaveLength(E.dailyMissionCount);
    expect(board.weekly).toHaveLength(1);
    expect(new Set(board.daily.map((mission) => mission.id)).size).toBe(
      board.daily.length,
    );
  });

  it("returns the same assignments for the same player and period", () => {
    const first = buildMissionBoard(E, identity.userId, counters, []);
    const second = buildMissionBoard(E, identity.userId, { ...counters }, []);

    expect(second).toEqual(first);
    expect(new Set(first.daily.map((mission) => mission.id)).size).toBe(2);
    expect(new Set(first.weekly.map((mission) => mission.id)).size).toBe(1);
  });
});

describe("Mission periods and claim keys", () => {
  it("uses Jakarta midnight and Monday boundaries for reset countdowns", () => {
    const sundayBeforeMidnight = new Date("2026-09-13T16:59:30Z");
    expect(missionPeriodKeys(sundayBeforeMidnight)).toEqual({
      dayKey: "2026-09-13",
      weekKey: "2026-W37",
    });
    expect(millisecondsUntilMissionReset("daily", sundayBeforeMidnight)).toBe(
      30_000,
    );
    expect(millisecondsUntilMissionReset("weekly", sundayBeforeMidnight)).toBe(
      30_000,
    );
    expect(missionPeriodKeys(new Date("2026-09-13T17:00:00Z"))).toEqual({
      dayKey: "2026-09-14",
      weekKey: "2026-W38",
    });
  });

  it("resets only counters whose period changed", () => {
    const current = normalizeMissionCounters(
      {
        dayKey: "2026-09-13",
        dayLaps: 4,
        dayBoosts: 2,
        weekKey: "2026-W36",
        weekLaps: 30,
        weekBoosts: 8,
      },
      "2026-09-13",
      now,
    );

    expect(current).toEqual({
      dayKey: "2026-09-13",
      dayLaps: 4,
      dayBoosts: 2,
      weekKey: "2026-W37",
      weekLaps: 0,
      weekBoosts: 0,
    });
  });

  it("round-trips scoped keys and prunes old retained periods", () => {
    const key = missionClaimKey("daily", "2026-09-13", "daily-laps-8");
    expect(parseMissionClaimKey(key)).toEqual({
      scope: "daily",
      periodKey: "2026-09-13",
      missionId: "daily-laps-8",
    });

    expect(
      pruneMissionClaims(
        [
          key,
          missionClaimKey("daily", "2026-08-01", "daily-laps-15"),
          missionClaimKey("daily", "2026-07-01", "daily-laps-25"),
          missionClaimKey("weekly", "2026-W37", "weekly-boosts-20"),
          missionClaimKey("weekly", "2026-W20", "weekly-laps-100"),
          "legacy-laps",
        ],
        now,
      ),
    ).toEqual([
      key,
      missionClaimKey("daily", "2026-08-01", "daily-laps-15"),
      missionClaimKey("weekly", "2026-W37", "weekly-boosts-20"),
      "legacy-laps",
    ]);
  });
});

describe("Preview mission parity", () => {
  it("counts settled laps and accepted boosts in their active periods", () => {
    const game = onboarded();
    vi.advanceTimersByTime(8_000);
    const raced = act(game.cookieValue, { type: "sync" });
    const afterRace = decodeCookie(raced.cookieValue).state;

    expect(afterRace).toMatchObject({
      dayLaps: 1,
      dayBoosts: 0,
      weekLaps: 1,
      weekBoosts: 0,
    });
    expect(
      [...raced.state.missions.daily, ...raced.state.missions.weekly].every(
        (mission) => mission.progress === (mission.kind === "laps" ? 1 : 0),
      ),
    ).toBe(true);

    const boosted = act(raced.cookieValue, { type: "boost" });
    const afterBoost = decodeCookie(boosted.cookieValue).state;
    expect(afterBoost).toMatchObject({
      dayBoosts: 1,
      weekBoosts: 1,
    });
    expect(
      [...boosted.state.missions.daily, ...boosted.state.missions.weekly].every(
        (mission) => mission.progress === 1,
      ),
    ).toBe(true);
    expect(() => act(boosted.cookieValue, { type: "boost" })).toThrow(
      "Boost masih mengisi ulang",
    );
  });

  it("pays a valid mission only in Sparepart and is retry-safe", () => {
    const game = onboarded();
    const mission = game.state.missions.daily[0];
    const decoded = decodeCookie(game.cookieValue);
    decoded.state.dayLaps = mission.target;
    const eligibleCookie = encodeCookie(decoded);
    const before = getPreviewGameState(request(eligibleCookie), identity, E).state;
    const command = { type: "mission", scope: "daily", id: mission.id } as const;
    const requestId = randomUUID();
    const claimed = act(eligibleCookie, command, requestId);

    expect(claimed.state.balance).toBe(before.balance);
    expect(claimed.state.earned).toBe(before.earned);
    expect(claimed.state.scrap).toBe(before.scrap + mission.reward);
    expect(claimed.state.scrapEarned).toBe(
      before.scrapEarned + mission.reward,
    );
    expect(act(claimed.cookieValue, command, requestId).state).toEqual(
      claimed.state,
    );
    expect(() => act(claimed.cookieValue, command)).toThrow("sudah diklaim");
  });

  it("rejects spoofed inactive ids and resets progress at a new period", () => {
    const game = onboarded();
    const inactiveId = "inactive-mission";
    expect(() =>
      act(game.cookieValue, {
        type: "mission",
        scope: "daily",
        id: inactiveId,
      }),
    ).toThrow("tidak aktif");

    const decoded = decodeCookie(game.cookieValue);
    decoded.state.dayKey = "2026-09-12";
    decoded.state.dayLaps = 99;
    decoded.state.dayBoosts = 9;
    decoded.state.weekKey = "2026-W36";
    decoded.state.weekLaps = 199;
    decoded.state.weekBoosts = 19;
    const reset = act(encodeCookie(decoded), { type: "sync" });
    expect(
      [...reset.state.missions.daily, ...reset.state.missions.weekly].every(
        (mission) => mission.progress === 0,
      ),
    ).toBe(true);
    const persisted = decodeCookie(reset.cookieValue).state;
    expect(persisted).toMatchObject({
      dayKey: "2026-09-13",
      dayLaps: 0,
      dayBoosts: 0,
      weekKey: "2026-W37",
      weekLaps: 0,
      weekBoosts: 0,
    });
  });
});
