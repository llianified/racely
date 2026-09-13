ALTER TABLE racely_players
  ADD COLUMN IF NOT EXISTS day_laps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_boosts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS week_key text,
  ADD COLUMN IF NOT EXISTS week_laps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS week_boosts integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'racely_players_mission_counters_check'
  ) THEN
    ALTER TABLE racely_players
      ADD CONSTRAINT racely_players_mission_counters_check
      CHECK (
        day_laps >= 0
        AND day_boosts >= 0
        AND week_laps >= 0
        AND week_boosts >= 0
      );
  END IF;
END $$;
