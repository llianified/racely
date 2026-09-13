ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS owned_cars jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE racely_players
SET owned_cars = owned_cars || jsonb_build_array(car_model)
WHERE car_model IS NOT NULL AND NOT (owned_cars ? car_model);
--> statement-breakpoint
ALTER TABLE racely_players DROP CONSTRAINT IF EXISTS racely_players_car_model_check;
--> statement-breakpoint
ALTER TABLE racely_players ADD CONSTRAINT racely_players_car_model_check
  CHECK (car_model IS NULL OR car_model IN ('neo-falcon', 'luna-gt', 'bebek-sultan', 'burger-oleng', 'ufo-gabut'));
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'racely_players_owned_cars_check' AND conrelid = 'racely_players'::regclass) THEN
    ALTER TABLE racely_players ADD CONSTRAINT racely_players_owned_cars_check
      CHECK (jsonb_typeof(owned_cars) = 'array'
        AND owned_cars <@ '["neo-falcon", "luna-gt", "bebek-sultan", "burger-oleng", "ufo-gabut"]'::jsonb);
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE racely_action_receipts DROP CONSTRAINT IF EXISTS racely_action_receipts_action_type_allowed;
--> statement-breakpoint
ALTER TABLE racely_action_receipts ADD CONSTRAINT racely_action_receipts_action_type_allowed
  CHECK (action_type IN (
    'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
    'select-car', 'color', 'circuit', 'withdraw',
    'buy-part', 'equip-part', 'unequip-part', 'buy-car', 'equip-car'
  ));
