import {
  lapReward,
  lapSeconds,
  roundCoins,
  type GameState,
  type OfflineEarnings,
} from "./game";

/**
 * An open client re-syncs every few seconds, so anything inside this window is
 * still "someone is watching the race". It has to be generous enough to absorb
 * a slow round trip without paying for time nobody was there for.
 */
export const HEARTBEAT_CAP_SECONDS = 30;
/**
 * Time past the heartbeat window is time the player was away. It still pays --
 * that is the idle reward -- but only this far back, so a week offline is not a
 * jackpot.
 */
export const OFFLINE_CAP_SECONDS = 4 * 60 * 60;
/** Offline laps run at half speed, so playing actively always pays better. */
export const OFFLINE_RATE = 0.5;

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
  /** Only set when part of the interval fell outside the heartbeat window. */
  offline: OfflineEarnings | null;
};

export function calculateRaceSettlement(
  state: RaceSettlementInput,
  now: Date,
): RaceSettlement {
  const intervalStart = state.lastSettledAt.getTime();
  const awayMs = Math.max(0, now.getTime() - intervalStart);
  // Splitting instead of choosing one cap keeps the payout continuous: a 40s
  // absence pays the full 30s plus 10s at half rate, never less than a 30s one.
  const onlineMs = Math.min(awayMs, HEARTBEAT_CAP_SECONDS * 1000);
  const offlineMs = Math.min(awayMs - onlineMs, OFFLINE_CAP_SECONDS * 1000);

  if (onlineMs + offlineMs === 0) {
    return {
      completedLaps: 0,
      income: 0,
      progress: state.progress,
      creditedSeconds: 0,
      offline: null,
    };
  }

  const onlineEnd = intervalStart + onlineMs;
  const boostEnd = state.boostEndsAt?.getTime() ?? intervalStart;
  // A boost lasts 10s, so it can only ever overlap the heartbeat window.
  const boostedMs = Math.max(0, Math.min(onlineEnd, boostEnd) - intervalStart);
  const normalMs = onlineMs - boostedMs;
  const economyState = {
    ...state,
    developmentPreview: false,
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
    withdrawals: [],
  } satisfies GameState;
  const lapDurationMs = lapSeconds(economyState) * 1000;
  const reward = lapReward(economyState);

  const onlineLaps =
    state.progress + normalMs / lapDurationMs + boostedMs / (lapDurationMs / 2);
  const accumulatedLaps =
    onlineLaps + (offlineMs / lapDurationMs) * OFFLINE_RATE;
  const completedLaps = Math.floor(accumulatedLaps);
  // Attribute to the away window only the laps the heartbeat would not have
  // closed on its own, so the summary matches what the balance actually gained.
  const offlineLaps = completedLaps - Math.floor(onlineLaps);
  const offlineIncome = roundCoins(offlineLaps * reward);

  return {
    completedLaps,
    income: roundCoins(
      roundCoins((completedLaps - offlineLaps) * reward) + offlineIncome,
    ),
    progress: accumulatedLaps % 1,
    creditedSeconds: (onlineMs + offlineMs) / 1000,
    offline:
      offlineMs > 0
        ? {
            awaySeconds: awayMs / 1000,
            creditedSeconds: offlineMs / 1000,
            capped: awayMs - onlineMs > OFFLINE_CAP_SECONDS * 1000,
            laps: offlineLaps,
            coins: offlineIncome,
          }
        : null,
  };
}
