-- Run manually. Supports both directions of the nearest-player lookup,
-- including tied lap totals. Does not create players or change their progress.
CREATE INDEX IF NOT EXISTS racely_players_race_neighbors_idx
  ON racely_players (laps DESC, created_at ASC, user_id ASC)
  INCLUDE (car_model)
  WHERE laps > 0 AND user_id ~ '^[0-9]+$' AND car_model IS NOT NULL;
