-- Panel admin: satu baris config ekonomi, jejak audit, dan indeks untuk
-- antrean penarikan.
--
-- Angka ekonomi (nilai koin, hadiah, biaya upgrade, batas idle) dulu berupa
-- konstanta TypeScript, jadi menyetelnya selalu butuh deploy. Sekarang tersimpan
-- di sini sebagai satu dokumen jsonb dan dibaca server saat menyelesaikan
-- balapan. Lihat `lib/economy-config.ts` untuk bentuk dan batasnya.
--
-- Tabel ini sengaja hanya boleh punya SATU baris: tidak ada per-pemain, tidak
-- ada A/B. Kalau suatu saat butuh varian, tambahkan kolom scope lewat migrasi
-- maju baru -- jangan melonggarkan CHECK di bawah, karena seluruh kode membaca
-- baris ini tanpa klausa pemilih.
CREATE TABLE IF NOT EXISTS racely_economy_config (
  id text PRIMARY KEY CHECK (id = 'default'),
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
--> statement-breakpoint
-- Tidak ada baris awal yang disisipkan di sini dengan sengaja. Tabel kosong
-- berarti "pakai DEFAULT_ECONOMY", jadi database yang sudah berjalan tidak
-- berubah perilakunya sedetik pun sampai ada yang benar-benar menyimpan config
-- dari panel. Itu juga yang membuat migrasi ini aman diulang.
--
-- Setiap perubahan yang menyentuh uang dicatat: perpindahan status penarikan dan
-- penyimpanan config. Tanpa ini, satu-satunya jejak "kenapa saldo pemain ini
-- berubah" adalah ingatan operator.
CREATE TABLE IF NOT EXISTS racely_admin_audit (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_admin_audit_recent_idx
  ON racely_admin_audit (created_at DESC);
--> statement-breakpoint
-- Antrean admin menyaring berdasarkan status lalu mengurutkan dari yang terbaru.
-- Indeks yang sudah ada adalah (user_id, created_at DESC) -- cocok untuk riwayat
-- satu pemain, tapi tidak untuk "semua penarikan pending".
CREATE INDEX IF NOT EXISTS racely_withdrawals_status_recent_idx
  ON racely_withdrawals (status, created_at DESC);
