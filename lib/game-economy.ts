import { lapReward, lapSeconds, type GameState } from "./game";

export const HEARTBEAT_CAP_SECONDS = 30;

export type RaceSettlementInput = Pick<
  GameState,
  "progress" | "levels" | "circuit"
> & {
  lastSettledAt: Date;
  boostEndsAt: Date | null;
};

export type RaceSettlement = {
  completedLaps: number;
  income: number;
  progress: number;
  creditedSeconds: number;
};

export function calculateRaceSettlement(
  state: RaceSettlementInput,
  now: Date,
  capSeconds = HEARTBEAT_CAP_SECONDS,
): RaceSettlement {
  const intervalStart = state.lastSettledAt.getTime();
  const availableMs = Math.max(0, now.getTime() - intervalStart);
  const creditedMs = Math.min(availableMs, Math.max(0, capSeconds) * 1000);

  if (creditedMs === 0) {
    return {
      completedLaps: 0,
      income: 0,
      progress: state.progress,
      creditedSeconds: 0,
    };
  }

  const intervalEnd = intervalStart + creditedMs;
  const boostEnd = state.boostEndsAt?.getTime() ?? intervalStart;
  const boostedMs = Math.max(
    0,
    Math.min(intervalEnd, boostEnd) - intervalStart,
  );
  const normalMs = creditedMs - boostedMs;
  const economyState = {
    ...state,
    balance: 0,
    pending: 0,
    earned: 0,
    laps: 0,
    boostLeft: 0,
    cooldown: 0,
    rewardClaimed: false,
    missionsClaimed: [],
    color: "#4275ff",
    player: { name: "", username: null, photoUrl: null },
  } satisfies GameState;
  const lapDurationMs = lapSeconds(economyState) * 1000;
  const accumulatedLaps =
    state.progress + normalMs / lapDurationMs + boostedMs / (lapDurationMs / 2);
  const completedLaps = Math.floor(accumulatedLaps);

  return {
    completedLaps,
    income: completedLaps * lapReward(economyState),
    progress: accumulatedLaps % 1,
    creditedSeconds: creditedMs / 1000,
  };
}
