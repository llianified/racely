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
-- Database produksi masih menyimpan receipt dari aksi yang sudah tidak ada di
-- kode ('buy-car', 'equip-car' dari versi awal toko mobil). Baris itu membuat
-- constraint baru gagal divalidasi dan menggagalkan seluruh migrasi. Receipt
-- hanya dipakai untuk dedupe permintaan berulang dan memang dipangkas lewat
-- retensi (lihat 0003), jadi sisa aksi mati aman dibuang -- tidak ada request
-- yang bisa memutar ulang tipe aksi yang skemanya sudah hilang.
DELETE FROM racely_action_receipts
WHERE action_type NOT IN (
  'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
  'select-car', 'color', 'circuit', 'withdraw',
  'buy-part', 'equip-part', 'unequip-part',
  'daily-mission', 'buy-paint', 'equip-paint'
);
ALTER TABLE racely_action_receipts ADD CONSTRAINT racely_action_receipts_action_type_allowed
  CHECK (action_type IN (
    'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
    'select-car', 'color', 'circuit', 'withdraw',
    'buy-part', 'equip-part', 'unequip-part',
    'daily-mission', 'buy-paint', 'equip-paint'
  ));
