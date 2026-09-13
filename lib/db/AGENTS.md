# `lib/db/` — koneksi dan skema

## `connection-url.ts` sengaja bebas dependensi

File ini menormalkan DSN dan **memaksa `sslmode=verify-full` untuk setiap host
remote** — tanpa itu node-postgres menyambung plaintext dan seluruh sesi (id
pemain, saldo, nomor rekening penarikan) lewat kabel terbuka.

Aturan yang sama diulang di `scripts/migrate.mjs`, yang berjalan di plain node
tanpa bundler. Itu sebabnya modul ini tidak boleh mengimpor apa pun.
`tests/database-url.test.ts` menjaga kedua salinan tetap sinkron dan akan merah
kalau salah satunya berubah sendirian.

## `db` dan `pool` bisa `null`

Tanpa `DATABASE_URL`, keduanya `null` — itu disengaja supaya `pnpm dev` dan
test tetap jalan tanpa database. Kode yang memakainya harus menangani
kemungkinan itu, bukan berasumsi koneksi selalu ada.

Pool disimpan di `globalThis` supaya hot reload tidak menumpuk koneksi.
`attachDatabasePool` hanya dipanggil di balik penjagaan `process.env.VERCEL`.

## Skema dan migrasi selalu berpasangan

`schema.ts` adalah definisi Drizzle untuk TypeScript; ia **tidak** membuat
tabel. Setiap perubahan bentuk tabel butuh dua hal: migrasi SQL baru di
`migrations/` dan pembaruan `schema.ts`. Jangan mengedit migrasi yang sudah
dijalankan — tulis migrasi maju baru. Satu-satunya pengecualian ada di bagian
terakhir file ini.

## Runner migrasi

`scripts/migrate.mjs` mengurutkan file `migrations/` berdasarkan nama dan
mencatat yang sudah jalan di `racely_schema_migrations`, jadi penomoran harus
naik dan file yang sudah tercatat tidak akan pernah dijalankan lagi. Untuk
membatalkan sesuatu, tulis migrasi maju baru. `scripts/check-migrations.mjs`
menghentikan deploy kalau database tertinggal di belakang `migrations/`.

## Satu-satunya pengecualian: daftar id mobil di `0001`

Id mobil diulang di SQL (`racely_players_car_model_check`) dan tidak ikut
otomatis dari TypeScript. Menambah mobil butuh **dua** suntingan SQL:

1. Migrasi **baru** yang menjatuhkan lalu membuat ulang constraint dengan
   daftar id lengkap — inilah yang memperbarui database yang sudah berjalan.
2. Kedua daftar `car_model IN (...)` di `migrations/0001_racely_core.sql` ikut
   diperbarui.

Langkah 2 tampak melanggar aturan "jangan edit migrasi yang sudah dijalankan",
tapi aman: runner melewati 0001 di database yang sudah ada, dan blok constraint
di dalamnya dijaga `IF NOT EXISTS`. Gunanya untuk database baru — dan karena
`tests/car-catalog-consistency.test.ts` hanya membaca 0001, tanpa langkah 2
test itu merah meski langkah 1 sudah benar.
