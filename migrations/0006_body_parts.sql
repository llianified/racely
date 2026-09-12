ALTER TABLE racely_players
  ADD COLUMN IF NOT EXISTS body_parts jsonb NOT NULL DEFAULT '{"owned":[],"equipped":{}}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'racely_players_body_parts_shape' AND conrelid = 'racely_players'::regclass) THEN
    ALTER TABLE racely_players ADD CONSTRAINT racely_players_body_parts_shape CHECK (
      jsonb_typeof(body_parts) = 'object'
      AND body_parts ? 'owned' AND body_parts ? 'equipped'
      AND jsonb_typeof(body_parts->'owned') = 'array'
      AND jsonb_typeof(body_parts->'equipped') = 'object'
    );
  END IF;
END $$;
