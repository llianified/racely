-- Fase 0: pagar ekonomi.
--
-- Dua hal dipisahkan di sini. Sparepart (`scrap`) adalah mata uang progres yang
-- tidak pernah bisa ditukar rupiah, jadi menambahnya tidak menambah kewajiban.
-- Koin tetap satu-satunya yang bernilai uang, dan mulai sekarang dibatasi per
-- pemain per hari (`day_coins` terhadap `day_key`) serta diringkas per hari
-- secara global di `racely_emission_daily` supaya kewajiban bisa dipantau.
--
-- Bekal Sparepart awal sengaja TIDAK di-backfill di sini: besarnya knob
-- (`startingScrap`) yang hidup di config, bukan di SQL. `starter_scrap_at`
-- menandai siapa yang sudah menerimanya; settlement berikutnya yang membayar,
-- dengan nilai knob yang berlaku saat itu.
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS scrap numeric NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS scrap_earned numeric NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS starter_scrap_at timestamptz;
--> statement-breakpoint
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS day_key text;
--> statement-breakpoint
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS day_coins numeric NOT NULL DEFAULT 0;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'racely_players_scrap_check' AND conrelid = 'racely_players'::regclass) THEN
    ALTER TABLE racely_players ADD CONSTRAINT racely_players_scrap_check
      CHECK (scrap >= 0 AND scrap_earned >= 0 AND day_coins >= 0);
  END IF;
END $$;
--> statement-breakpoint
-- Ringkasan emisi harian. Satu baris per hari balapan (WIB), di-upsert dari
-- settlement. `coins` adalah koin yang benar-benar dicetak; `amount_idr`
-- dihitung dengan nilai koin yang berlaku saat pencetakan, jadi perubahan
-- coinToIdr di kemudian hari tidak menulis ulang sejarah.
CREATE TABLE IF NOT EXISTS racely_emission_daily (
  day text PRIMARY KEY,
  coins numeric NOT NULL DEFAULT 0,
  amount_idr bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coins >= 0 AND amount_idr >= 0)
);
--> statement-breakpoint
ALTER TABLE racely_action_receipts DROP CONSTRAINT IF EXISTS racely_action_receipts_action_type_allowed;
--> statement-breakpoint
ALTER TABLE racely_action_receipts ADD CONSTRAINT racely_action_receipts_action_type_allowed
  CHECK (action_type IN (
    'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
    'select-car', 'color', 'circuit', 'withdraw',
    'buy-part', 'equip-part', 'unequip-part', 'buy-car', 'equip-car',
    'convert-scrap'
  ));
