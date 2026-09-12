-- Racely bisa mengirim pesan ke pemain hanya kalau pemain itu lebih dulu
-- membuka percakapan dengan bot -- aturan Telegram, bukan pilihan kita. Tabel
-- ini mencatat siapa saja yang sudah melakukannya.
--
-- Sengaja TANPA foreign key ke racely_players: urutan yang paling umum adalah
-- /start di bot dulu, baru Mini App dibuka. Kalau ada FK, baris ini gagal
-- disisipkan tepat pada saat yang paling sering terjadi, dan pemain itu tidak
-- akan pernah bisa dinotifikasi.
CREATE TABLE IF NOT EXISTS racely_bot_chats (
  user_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Kapan pemberitahuan idle terakhir dikirim. Dibandingkan dengan
-- last_settled_at: begitu pemain kembali dan menyelesaikan hasilnya,
-- last_settled_at melompat ke depan dan pemain kembali layak dinotifikasi.
ALTER TABLE racely_players ADD COLUMN IF NOT EXISTS idle_notified_at TIMESTAMPTZ;
--> statement-breakpoint
-- Penyapu notifikasi memindai pemain yang sudah lama tidak menyelesaikan
-- balapan. Index parsial: pemain yang belum memilih mobil tidak pernah
-- mengumpulkan koin, jadi tidak perlu ikut dipindai.
CREATE INDEX IF NOT EXISTS racely_players_idle_idx
  ON racely_players (last_settled_at)
  WHERE car_model IS NOT NULL;
