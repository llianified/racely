import type { GameState } from "./game";

export const LEADERBOARD_LIMIT = 50;
export const LEADERBOARD_REFRESH_MS = 30_000;

export type LeaderboardEntry = {
  rank: number;
  name: string;
  laps: number;
  isCurrentPlayer: boolean;
};

export type Leaderboard = {
  entries: LeaderboardEntry[];
  currentPlayer: LeaderboardEntry | null;
  nextRival: { name: string; laps: number } | null;
  totalPlayers: number;
  updatedAt: string;
  developmentPreview: boolean;
};

export function lapsToOvertake(laps: number, rivalLaps: number) {
  return Math.max(1, rivalLaps - laps + 1);
}

export function previewLeaderboard(
  game: Pick<GameState, "laps" | "player">,
  now = new Date(),
): Leaderboard {
  const currentPlayer: LeaderboardEntry | null = game.laps > 0
    ? { rank: 1, name: game.player.name, laps: game.laps, isCurrentPlayer: true }
    : null;
  return {
    entries: currentPlayer ? [currentPlayer] : [],
    currentPlayer,
    nextRival: null,
    totalPlayers: currentPlayer ? 1 : 0,
    updatedAt: now.toISOString(),
    developmentPreview: true,
  };
}
