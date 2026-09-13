import type { GameState } from "./game";

export const LEADERBOARD_LIMIT = 50;
export const LEADERBOARD_REFRESH_MS = 30_000;
export const LEADERBOARD_METRICS = ["laps", "referrals"] as const;

export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  /** Kept on lap responses for existing leaderboard consumers. */
  laps?: number;
  isCurrentPlayer: boolean;
};

export type Leaderboard = {
  metric: LeaderboardMetric;
  entries: LeaderboardEntry[];
  currentPlayer: LeaderboardEntry | null;
  nextRival: { name: string; score: number; laps?: number } | null;
  totalPlayers: number;
  updatedAt: string;
  developmentPreview: boolean;
};

export function scoreToOvertake(score: number, rivalScore: number) {
  return Math.max(1, rivalScore - score + 1);
}

export const lapsToOvertake = scoreToOvertake;

export function previewLeaderboard(
  game: Pick<GameState, "laps" | "player" | "referral" | "economy">,
  metric: LeaderboardMetric = "laps",
  now = new Date(),
): Leaderboard {
  const score = metric === "laps"
    ? game.laps
    : Math.floor(
        game.referral.earned / game.economy.referralRewardInviter,
      );
  const currentPlayer: LeaderboardEntry | null = score > 0
    ? {
        rank: 1,
        name: game.player.name,
        score,
        ...(metric === "laps" ? { laps: score } : {}),
        isCurrentPlayer: true,
      }
    : null;
  return {
    metric,
    entries: currentPlayer ? [currentPlayer] : [],
    currentPlayer,
    nextRival: null,
    totalPlayers: currentPlayer ? 1 : 0,
    updatedAt: now.toISOString(),
    developmentPreview: true,
  };
}
