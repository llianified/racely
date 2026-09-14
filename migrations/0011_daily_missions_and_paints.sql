ALTER TABLE racely_players
  ADD COLUMN IF NOT EXISTS daily_missions jsonb,
  ADD COLUMN IF NOT EXISTS owned_paints jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'racely_players_owned_paints_check' AND conrelid = 'racely_players'::regclass) THEN
    ALTER TABLE racely_players ADD CONSTRAINT racely_players_owned_paints_check
      CHECK (jsonb_typeof(owned_paints) = 'array' AND owned_paints <@ '["jade", "pearl", "champagne"]'::jsonb);
  END IF;
END $$;

ALTER TABLE racely_action_receipts DROP CONSTRAINT IF EXISTS racely_action_receipts_action_type_allowed;
ALTER TABLE racely_action_receipts ADD CONSTRAINT racely_action_receipts_action_type_allowed
  CHECK (action_type IN (
    'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
    'select-car', 'color', 'circuit', 'withdraw',
    'buy-part', 'equip-part', 'unequip-part',
    'daily-mission', 'buy-paint', 'equip-paint'
  ));
