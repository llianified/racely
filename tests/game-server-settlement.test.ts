import { describe, expect, it } from "vitest";
import { settlePlayerRow } from "../lib/game-server";
import { DEFAULT_ECONOMY as E } from "../lib/economy-config";
import { NEUTRAL_SETUP } from "../lib/car-setup";
import { dailyMissionsFor, recordDailyBoost } from "../lib/daily-missions";

type PlayerRow = Parameters<typeof settlePlayerRow>[0];
const start = new Date("2026-09-12T17:00:00Z");
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);
const player = (overrides: Partial<PlayerRow> = {}): PlayerRow => ({
  userId: "test:settlement",
  displayName: "Settlement Racer",
  telegramUsername: null,
  photoUrl: null,
  balance: 100,
  pending: 0,
  earned: 0,
  laps: 0,
  progress: 0,
  engineLevel: 1,
  tiresLevel: 1,
  batteryLevel: 1,
  boostEndsAt: null,
  cooldownEndsAt: null,
  rewardClaimed: false,
  missionsClaimed: [],
  dailyMissions: dailyMissionsFor(null, start, E),
  ownedPaints: [],
  bodyParts: { owned: [], equipped: {} },
  setup: NEUTRAL_SETUP,
  carModel: "luna-gt",
  color: "#b9a1ed",
  circuit: 0,
  lastSettledAt: start,
  idleNotifiedAt: null,
  referredBy: null,
  referralPaidAt: null,
  version: 1,
  createdAt: start,
  updatedAt: start,
  ...overrides,
});

describe("monotonic player settlement", () => {
  it("cannot reopen an interval paid by a newer request", () => {
    const initial = player();
    const paid = settlePlayerRow(initial, at(16), E);
    expect(paid.row.laps).toBe(2);
    expect(paid.row.pending).toBe(.08);
    const stale = settlePlayerRow(paid.row, at(8), E);
    expect(stale.row).toEqual(paid.row);
    expect(stale.offline).toBeNull();
    expect(settlePlayerRow(stale.row, at(16), E).row).toEqual(paid.row);
    const next = settlePlayerRow(stale.row, at(24), E);
    expect(next.row).toEqual(settlePlayerRow(initial, at(24), E).row);
    expect(next.row.pending).toBe(.12);
    expect(initial.lastSettledAt).toEqual(start);
    expect(initial.pending).toBe(0);
  });

  it("does not roll daily missions back across WIB midnight", () => {
    const initial = player({ dailyMissions: recordDailyBoost(dailyMissionsFor(null, start, E), true) });
    const stale = settlePlayerRow(initial, at(-1), E);
    expect(stale.row).toEqual(initial);
    expect(stale.row.dailyMissions?.day).toBe("2026-09-13");
    expect(stale.row.dailyMissions?.values.boosts).toBe(1);
  });

  it("keeps the onboarding timestamp monotonic without awarding laps", () => {
    const initial = player({ carModel: null });
    expect(settlePlayerRow(initial, at(-8), E).row).toEqual(initial);
    const waiting = settlePlayerRow(initial, at(60), E).row;
    expect(waiting.lastSettledAt).toEqual(at(60));
    expect(waiting.pending).toBe(0);
    expect(waiting.laps).toBe(0);
    expect(settlePlayerRow(waiting, at(8), E).row).toEqual(waiting);
  });

  it("never replays capped offline earnings or an expired boost after clock rollback", () => {
    const initial = player({ boostEndsAt: at(10) });
    const paid = settlePlayerRow(initial, at(36000), E);
    expect(paid.offline?.capped).toBe(true);
    const stale = settlePlayerRow(paid.row, at(5), E);
    expect(stale.row).toEqual(paid.row);
    expect(stale.offline).toBeNull();
    const next = settlePlayerRow(stale.row, at(36008), E);
    expect(next.row.pending - paid.row.pending).toBeCloseTo(.04);
    expect(next.row.laps - paid.row.laps).toBe(1);
  });
});
