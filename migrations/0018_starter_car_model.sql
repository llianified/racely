-- Mobil starter yang dipilih saat onboarding. Tanpa kolom ini `car_model`
-- adalah satu-satunya catatan, sehingga pemain yang naik ke mobil hadiah
-- ajakan kehilangan jejak mobil asalnya dan bisa turun ke starter mana pun
-- (Neo Falcon -> Phantom X -> Luna GT). Lihat select-car di lib/game-server.ts.
-- Additive dan idempoten.
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS starter_car_model text;
--> statement-breakpoint
-- Backfill pemain lama: yang masih memakai mobil starter jelas starter-nya,
-- yang sudah di mobil hadiah ajakan tidak punya catatan lagi dan default ke
-- Neo Falcon. Sengaja tanpa CHECK daftar id supaya menambah mobil baru tidak
-- perlu menyentuh kolom ini; validasinya ada di knownCarModel().
UPDATE racely_players
SET starter_car_model = CASE
    WHEN car_model IN ('neo-falcon', 'luna-gt') THEN car_model
    ELSE 'neo-falcon'
  END
WHERE car_model IS NOT NULL AND starter_car_model IS NULL;
