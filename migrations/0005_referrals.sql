-- Siapa yang mengajak pemain ini. Diisi sekali, hanya sebelum pemain
-- menyelesaikan putaran pertamanya, dan tidak pernah menunjuk diri sendiri.
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS referred_by TEXT;
--> statement-breakpoint
-- Penanda bahwa hadiah untuk pengajak sudah lunas. Pembayaran pengajak
-- berjalan di transaksi terpisah dari transaksi pemain yang diajak: keduanya
-- adalah baris racely_players, dan mengunci keduanya dalam satu transaksi bisa
-- berujung deadlock kalau dua pemain saling mengajak. Kolom ini yang membuat
-- percobaan ulangnya aman dan berhenti sendiri setelah berhasil.
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS referral_paid_at TIMESTAMPTZ;
--> statement-breakpoint
-- Menghitung berapa orang yang diajak seorang pemain.
CREATE INDEX IF NOT EXISTS racely_players_referred_by_idx
  ON racely_players (referred_by)
  WHERE referred_by IS NOT NULL;
