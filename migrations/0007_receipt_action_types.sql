-- `racely_action_receipts.action_type` lahir di 0001 dengan CHECK inline berisi
-- sembilan aksi. Sejak itu `commandSchema` di lib/game-server.ts tumbuh jadi
-- empat belas, dan empat di antaranya tidak pernah bisa dicatat: 'daily'
-- (check-in harian) serta 'buy-part' / 'equip-part' / 'unequip-part' (toko aero
-- kit dari 0006). Karena receipt disisipkan di akhir transaksi aksi, CHECK yang
-- gagal membatalkan SELURUH transaksi -- kredit hadiah, pembelian part, dan
-- penyelesaian balapan ikut hilang, pemain hanya melihat 500.
--
-- Constraint lama dinamai otomatis oleh Postgres. Dijatuhkan lalu diganti versi
-- bernama supaya penambahan aksi berikutnya punya nama yang bisa dipegang.
-- 'sync' sengaja tidak masuk daftar: aksi itu memang tidak pernah dicatat.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'racely_action_receipts_action_type_check'
      AND conrelid = 'racely_action_receipts'::regclass
  ) THEN
    ALTER TABLE racely_action_receipts
      DROP CONSTRAINT racely_action_receipts_action_type_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'racely_action_receipts_action_type_allowed'
      AND conrelid = 'racely_action_receipts'::regclass
  ) THEN
    ALTER TABLE racely_action_receipts
      ADD CONSTRAINT racely_action_receipts_action_type_allowed
      CHECK (action_type IN (
        'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
        'select-car', 'color', 'circuit', 'withdraw',
        'buy-part', 'equip-part', 'unequip-part'
      ));
  END IF;
END $$;
