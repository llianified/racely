import "server-only";

import type { Pool } from "pg";
import { pool } from "@/lib/db";
import { LEADERBOARD_LIMIT, type Leaderboard } from "@/lib/leaderboard";

// LIMIT precedes the window: only the leaders need sorting for rank. The
// requesting player's rank and nearest higher score use the same SQL snapshot.
const leaderboardQuery = `
  WITH eligible AS NOT MATERIALIZED (
    SELECT user_id, display_name, laps, created_at
    FROM racely_players
    WHERE laps > 0 AND user_id ~ '^[0-9]+$'
  ), leaders AS MATERIALIZED (
    SELECT * FROM eligible
    ORDER BY laps DESC, created_at ASC, user_id ASC
    LIMIT $2
  ), ranked_leaders AS (
    SELECT *, RANK() OVER (ORDER BY laps DESC) AS place FROM leaders
  ), mine AS (
    SELECT p.*, (SELECT COUNT(*) + 1 FROM eligible e WHERE e.laps > p.laps) AS place
    FROM eligible p WHERE user_id = $1
  ), rival AS (
    SELECT e.display_name, e.laps
    FROM eligible e, mine m
    WHERE e.laps > m.laps
    ORDER BY e.laps ASC, e.created_at ASC, e.user_id ASC
    LIMIT 1
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', place, 'name', display_name, 'laps', laps,
        'isCurrentPlayer', user_id = $1
      ) ORDER BY laps DESC, created_at ASC, user_id ASC)
      FROM ranked_leaders
    ), '[]'::jsonb) AS entries,
    (SELECT jsonb_build_object(
      'rank', place, 'name', display_name, 'laps', laps, 'isCurrentPlayer', true
    ) FROM mine) AS current_player,
    (SELECT jsonb_build_object('name', display_name, 'laps', laps) FROM rival) AS next_rival,
    (SELECT COUNT(*)::integer FROM eligible) AS total_players,
    statement_timestamp() AS updated_at
`;

type LeaderboardRow = {
  entries: Leaderboard["entries"];
  current_player: Leaderboard["currentPlayer"];
  next_rival: Leaderboard["nextRival"];
  total_players: number;
  updated_at: Date;
};

export async function getLeaderboard(
  userId: string,
  database: Pick<Pool, "query"> | null = pool,
): Promise<Leaderboard> {
  if (!database) throw new Error("Leaderboard database is unavailable");
  const { rows } = await database.query<LeaderboardRow>(leaderboardQuery, [
    userId,
    LEADERBOARD_LIMIT,
  ]);
  const row = rows[0];
  if (!row) throw new Error("Leaderboard snapshot is unavailable");
  return {
    entries: row.entries,
    currentPlayer: row.current_player,
    nextRival: row.next_rival,
    totalPlayers: row.total_players,
    updatedAt: row.updated_at.toISOString(),
    developmentPreview: false,
  };
}
