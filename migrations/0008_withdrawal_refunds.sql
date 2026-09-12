-- Saldo dipotong saat permintaan penarikan dibuat. Status 'rejected' sudah ada
-- sejak 0001 dan dipakai operator, tapi tidak pernah ada kode yang
-- mengembalikan koinnya -- penolakan menghanguskan koin pemain diam-diam, tanpa
-- satu pun kalimat di app yang memberitahukannya.
--
-- Kolom ini yang membuat pengembalian bisa dijalankan tepat sekali:
-- `UPDATE ... WHERE status = 'rejected' AND refunded_at IS NULL RETURNING`
-- hanya mengembalikan baris yang benar-benar ditandai oleh pernyataan itu, jadi
-- dua permintaan bersamaan tidak bisa membayar dua kali.
--
-- Catatan operasional: 'paid' adalah status untuk penarikan yang dananya sudah
-- dikirim. 'rejected' berarti tidak dibayar, dan sekarang mengembalikan koin.
-- Jangan memakai 'rejected' untuk membereskan penarikan yang sudah dibayar
-- manual -- itu akan mengembalikan koin yang uangnya sudah keluar.
ALTER TABLE racely_withdrawals
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
--> statement-breakpoint
-- Sapuan pengembalian berjalan di setiap aksi pemain, jadi ia harus menemukan
-- barisnya tanpa memindai seluruh tabel. Parsial: hanya penarikan yang ditolak
-- dan belum dikembalikan yang pernah dicari.
CREATE INDEX IF NOT EXISTS racely_withdrawals_refund_pending_idx
  ON racely_withdrawals (user_id)
  WHERE status = 'rejected' AND refunded_at IS NULL;
