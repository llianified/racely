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
dijalankan — tulis migrasi maju baru.
