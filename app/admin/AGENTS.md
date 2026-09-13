# Panel admin — `/admin`, `app/api/admin/`, `lib/admin-*.ts`

Permukaan terpisah untuk operator: browser desktop, bukan Telegram. Ia tidak
memakai satu pun komponen atau kelas CSS milik app pemain — jangan mengimpor
dari `components/game/`, dan jangan mengimpor `app/admin/` dari sana.

## File

- `lib/admin-auth.ts` — password dari `RACELY_ADMIN_PASSWORD` + cookie sesi
  bertanda tangan. Kunci penanda tangan diturunkan dari password, jadi rotasi
  password memutus semua sesi. **Tidak ada bypass development**; `pnpm dev`
  pun tetap meminta password.
- `lib/admin-ops.ts` — antrean penarikan, tabel perpindahan status
  (`ALLOWED_TRANSITIONS`), audit, ringkasan kewajiban.
- `lib/admin-api.ts` — `guardAdmin()`.
- `app/admin/admin.css` — gaya panel, semua bersumber token di `:root`.

## Aturan

- Setiap route di `app/api/admin/` wajib memanggil `guardAdmin()`. Route yang
  mengubah sesuatu memakai `{ mutating: true }` (menambah cek Origin).
- **`paid` dan `rejected` adalah status akhir.** Jangan pernah menambahkan
  jalur keluar dari keduanya di `ALLOWED_TRANSITIONS`: `rejected`
  mengembalikan koin ke saldo pemain, jadi "menolak" penarikan yang sudah
  `paid` akan memulangkan koin yang uangnya sudah keluar dari rekening. Alasan
  lengkap ada di migrasi 0008; dijaga `tests/admin-ops.test.ts`.
- Panel hanya **mencatat** keputusan operator. Tidak ada integrasi pembayaran,
  dan tidak boleh ada jalur yang memindahkan status penarikan tanpa seorang
  manusia menekan tombolnya.
- Setiap perubahan status dan penyimpanan config dicatat di
  `racely_admin_audit` — ikuti pola yang sudah ada di `lib/admin-ops.ts`.
- Knob ekonomi yang tidak terdaftar di `GROUPS` (`admin-economy.tsx`) tidak
  bisa disetel siapa pun. Rute lengkapnya ada di `AGENTS.md` root →
  "Ekonomi, reward, biaya upgrade".
