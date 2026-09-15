-- Bonus iklan rewarded (Adsgram): aksi baru 'watch-ad'. Setiap tontonan yang
-- dibayar menjadi satu baris racely_reward_claims dengan kunci
-- 'ad:<YYYY-MM-DD>:<n>', jadi tidak ada kolom baru -- hanya daftar action_type
-- yang boleh dicatat di tanda terima yang bertambah. Tanpa baris ini setiap
-- permintaan watch-ad gagal di CHECK dan seluruh transaksi aksi ikut batal.
ALTER TABLE racely_action_receipts DROP CONSTRAINT IF EXISTS racely_action_receipts_action_type_allowed;
ALTER TABLE racely_action_receipts ADD CONSTRAINT racely_action_receipts_action_type_allowed
  CHECK (action_type IN (
    'upgrade', 'claim', 'boost', 'gift', 'daily', 'mission',
    'select-car', 'color', 'circuit', 'withdraw',
    'buy-part', 'equip-part', 'unequip-part',
    'daily-mission', 'buy-paint', 'equip-paint',
    'set-setup', 'watch-ad'
  ));
