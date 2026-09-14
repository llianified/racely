-- Setup mobil: gear ratio + roller.
--
-- Kenapa butuh kolom sendiri dan bukan menumpang kolom yang sudah ada: setup
-- adalah masukan OTORITATIF untuk settlement -- ia ikut menentukan waktu per
-- putaran, jadi ia harus hidup di server. Kalau ia cuma state client, pemain
-- tinggal mengirim stabilitas karangannya sendiri. Dan seluruh kolom jsonb yang
-- ada (`body_parts`, `owned_paints`, `daily_missions`, `missions_claimed`)
-- sudah punya bentuk sendiri yang divalidasi; menyelipkan setup ke salah
-- satunya berarti merusak bentuk itu.
--
-- Satu kolom jsonb, bukan dua kolom text, supaya penambahan berikutnya (mass
-- damper, brake sponge) tidak butuh migrasi lagi.
--
-- Defaultnya adalah setup NETRAL. Itu yang membuat migrasi ini tidak memotong
-- penghasilan siapa pun: `4:1` + `standard` menghasilkan waktu per putaran yang
-- sama persis dengan sebelum setup ada -- lihat `lib/car-setup.ts` dan
-- invarian yang dikunci `tests/car-setup.test.ts`.
ALTER TABLE racely_players
  ADD COLUMN IF NOT EXISTS setup jsonb NOT NULL
    DEFAULT '{"gear": "4:1", "roller": "standard"}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'racely_players_setup_check' AND conrelid = 'racely_players'::regclass) THEN
    ALTER TABLE racely_players ADD CONSTRAINT racely_players_setup_check
      CHECK (
        jsonb_typeof(setup) = 'object'
        AND setup ? 'gear' AND setup ? 'roller'
        AND setup ->> 'gear' IN ('3.5:1', '4:1', '5:1')
        AND setup ->> 'roller' IN ('light', 'standard', 'heavy')
      );
  END IF;
END $$;

-- `set-setup` ikut ke daftar tipe aksi yang boleh dicatat di receipt. Tanpa
-- baris ini setiap permintaan set-setup gagal di CHECK dan seluruh transaksi
-- aksi ikut batal.
ALTER TABLE racely_action_receipts DROP CONSTRAINT IF EXISTS racely_action_receipts_action_type_allowed;
ALTER TABLE racely_action_receipts ADD CONSTRAINT racely_action_receipts_action_type_allowed
  CHECK (action_type IN (
    'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
    'select-car', 'color', 'circuit', 'withdraw',
    'buy-part', 'equip-part', 'unequip-part',
    'daily-mission', 'buy-paint', 'equip-paint',
    'set-setup'
  ));
