CREATE TABLE IF NOT EXISTS racely_players (
  user_id text PRIMARY KEY,
  telegram_username text,
  display_name text NOT NULL,
  photo_url text,
  balance bigint NOT NULL DEFAULT 10 CHECK (balance >= 0),
  pending double precision NOT NULL DEFAULT 0 CHECK (pending >= 0),
  earned double precision NOT NULL DEFAULT 0 CHECK (earned >= 0),
  laps integer NOT NULL DEFAULT 0 CHECK (laps >= 0),
  progress double precision NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  engine_level integer NOT NULL DEFAULT 1 CHECK (engine_level BETWEEN 1 AND 10),
  tires_level integer NOT NULL DEFAULT 1 CHECK (tires_level BETWEEN 1 AND 10),
  battery_level integer NOT NULL DEFAULT 1 CHECK (battery_level BETWEEN 1 AND 10),
  boost_ends_at timestamptz,
  cooldown_ends_at timestamptz,
  reward_claimed boolean NOT NULL DEFAULT false,
  missions_claimed jsonb NOT NULL DEFAULT '[]'::jsonb,
  car_model text CHECK (car_model IS NULL OR car_model IN ('neo-falcon', 'luna-gt')),
  color text NOT NULL DEFAULT '#4275ff' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  circuit integer NOT NULL DEFAULT 0 CHECK (circuit IN (0, 1)),
  last_settled_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS car_model text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS racely_action_receipts (
  user_id text NOT NULL REFERENCES racely_players(user_id) ON DELETE CASCADE,
  request_id text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('upgrade', 'claim', 'boost', 'gift', 'mission', 'select-car', 'color', 'circuit', 'withdraw')),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_action_receipts_user_idx ON racely_action_receipts(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS racely_reward_claims (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES racely_players(user_id) ON DELETE CASCADE,
  reward_key text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT racely_reward_claims_key_unique UNIQUE (user_id, reward_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_reward_claims_user_idx ON racely_reward_claims(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS racely_withdrawals (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES racely_players(user_id) ON DELETE CASCADE,
  request_id text NOT NULL,
  coins bigint NOT NULL CHECK (coins > 0),
  amount_idr bigint NOT NULL CHECK (amount_idr > 0),
  method text NOT NULL CHECK (method IN ('dana', 'gopay', 'ovo', 'shopeepay', 'bca', 'bri', 'bni', 'mandiri')),
  account text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT racely_withdrawals_request_unique UNIQUE (user_id, request_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_withdrawals_user_idx ON racely_withdrawals(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_withdrawals_pending_idx ON racely_withdrawals(created_at) WHERE status = 'pending';
