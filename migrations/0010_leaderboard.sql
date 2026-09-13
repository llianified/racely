-- Read-only leaderboard uses settled lifetime laps, not balances or rewards.
-- Numeric Telegram IDs exclude development preview and integration-test players.
CREATE INDEX IF NOT EXISTS racely_players_leaderboard_idx
  ON racely_players (laps DESC, created_at ASC, user_id ASC)
  WHERE laps > 0 AND user_id ~ '^[0-9]+$';
