ALTER TABLE racely_players
  ADD COLUMN IF NOT EXISTS owned_cosmetics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS equipped_cosmetics jsonb NOT NULL DEFAULT '{}'::jsonb;

--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'racely_players_cosmetics_shape_check' AND conrelid = 'racely_players'::regclass) THEN
    ALTER TABLE racely_players ADD CONSTRAINT racely_players_cosmetics_shape_check CHECK (
      jsonb_typeof(owned_cosmetics) = 'array'
      AND jsonb_typeof(equipped_cosmetics) = 'object'
    );
  END IF;
END $$;
