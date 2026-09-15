-- Hadiah milestone ajak teman (lib/referral-rewards.ts). Cat dan part eksklusif
-- masuk kolom jsonb yang sudah ada (owned_paints, body_parts) sehingga tidak
-- perlu kolom baru; yang berubah hanya daftar id mobil: 'phantom-x' adalah
-- mobil ketiga yang tidak dijual dan hanya terbuka setelah 25 ajakan tuntas.
-- Additive dan idempoten: constraint dibuat ulang dengan daftar yang lebih lebar.
ALTER TABLE racely_players DROP CONSTRAINT IF EXISTS racely_players_car_model_check;
--> statement-breakpoint
ALTER TABLE racely_players ADD CONSTRAINT racely_players_car_model_check
  CHECK (car_model IS NULL OR car_model IN ('neo-falcon', 'luna-gt', 'phantom-x'));
