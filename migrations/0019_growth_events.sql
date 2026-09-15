-- Event pertumbuhan minimal yang dibutuhkan untuk membaca onboarding, retensi,
-- monetisasi, withdrawal, dan funnel referral. user_id sengaja tidak memakai
-- foreign key: referral_open tiba dari bot sebelum pemain membuka Mini App.
CREATE TABLE IF NOT EXISTS racely_game_events (
  id bigserial PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name IN (
    'app_open', 'onboarding_complete', 'first_claim', 'd1_return', 'd7_return',
    'referral_open', 'referral_bound', 'referral_qualified',
    'referral_reward_paid', 'referral_share', 'ad_completed',
    'withdrawal_requested'
  )),
  user_id text NOT NULL,
  referrer_id text,
  dedupe_key text,
  detail jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS racely_game_events_dedupe_unique
  ON racely_game_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_game_events_name_recent_idx
  ON racely_game_events(event_name, occurred_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_game_events_user_recent_idx
  ON racely_game_events(user_id, occurred_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_game_events_referrer_recent_idx
  ON racely_game_events(referrer_id, occurred_at DESC)
  WHERE referrer_id IS NOT NULL;
--> statement-breakpoint
-- View ini memberi hitungan funnel harian siap-query tanpa menunggu dashboard
-- admin. Hari memakai WIB agar sama dengan reset harian ekonomi Racely.
CREATE OR REPLACE VIEW racely_referral_funnel_daily AS
SELECT
  (occurred_at AT TIME ZONE 'Asia/Jakarta')::date AS day,
  count(*) FILTER (WHERE event_name = 'referral_open')::integer AS opened,
  count(*) FILTER (WHERE event_name = 'referral_bound')::integer AS bound,
  count(*) FILTER (WHERE event_name = 'referral_qualified')::integer AS qualified
FROM racely_game_events
WHERE event_name IN ('referral_open', 'referral_bound', 'referral_qualified')
GROUP BY 1;
--> statement-breakpoint
-- Aksi share lewat Mini App ikut receipt idempoten seperti aksi pemain lain.
ALTER TABLE racely_action_receipts
  DROP CONSTRAINT IF EXISTS racely_action_receipts_action_type_allowed;
--> statement-breakpoint
ALTER TABLE racely_action_receipts
  ADD CONSTRAINT racely_action_receipts_action_type_allowed
  CHECK (action_type IN (
    'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
    'select-car', 'color', 'circuit', 'withdraw',
    'buy-part', 'equip-part', 'unequip-part',
    'daily-mission', 'buy-paint', 'equip-paint',
    'set-setup', 'watch-ad', 'track-referral-share'
  ));
