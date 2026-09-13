<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Racely — peta kerja untuk agent

Orientasi lengkap ada di `README.md`. File ini sengaja hanya berisi **rute
tugas** dan **aturan yang mahal kalau dilanggar** — hal yang tidak bisa ditebak
dengan membaca satu-dua file. Jangan menyalin peta direktori README ke sini;
dua salinan pasti melenceng.

## Baca dulu sebelum menyentuh direktori ini

| Direktori | Baca |
|---|---|
| `components/game/scene/` | `components/game/scene/AGENTS.md` |
| `lib/db/` | `lib/db/AGENTS.md` |

## Aturan yang tidak boleh dilanggar

- Produksi **wajib** autentikasi Telegram `initData` (HMAC + cek kedaluwarsa).
- **Withdrawal tetap antrean manual berstatus `pending`.** Jangan pernah
  diubah jadi transfer otomatis. Panel admin di `/admin` hanya **mencatat**
  keputusan operator — tidak ada integrasi pembayaran, dan tidak ada jalur yang
  memindahkan penarikan tanpa seorang manusia menekan tombolnya.
- Mode preview hanya untuk development: butuh `RACELY_ENABLE_PREVIEW=true`
  **dan** `NODE_ENV !== "production"`.
- Migrasi bersifat additive dan idempoten. Untuk membatalkan sesuatu, tulis
  migrasi maju baru — **jangan** mengedit file migrasi yang sudah dijalankan.
- PM2 dikunci `instances: 1`, `exec_mode: "fork"`. Rate limiter, dedupe webhook,
  **dan penyapu pemberitahuan idle** (`lib/idle-notifier.ts`, dinyalakan dari
  `instrumentation.ts`) bersifat per-proses; menambah instance akan merusak
  ketiganya — khusus penyapu, pemain akan dikirimi pesan ganda.
- Jangan pernah menulis token, connection string, atau secret ke repo, log,
  atau commit message.

## Rute tugas

### Menambah aksi pemain baru — tiga tempat, tidak saling diturunkan

1. `lib/game.ts` → tambah varian di union `GameCommand` (dipakai client).
2. `lib/game-server.ts` → tambah varian di `commandSchema`
   (`z.discriminatedUnion`) **dan** cabang eksekusinya di `performGameAction`.
3. `lib/preview-game.ts` → tambah cabang di `performPreviewGameAction`.

Ketiganya ditulis manual dan tidak diturunkan satu sama lain. Melewatkan (3)
tidak menimbulkan error apa pun — aksinya hanya diam-diam tidak berfungsi saat
`pnpm dev`, yang paling lama ditemukan. Endpoint `app/api/game/action/route.ts`
tidak perlu diubah: ia mendelegasikan lewat `gameActionSchema`.

Tambahkan juga testnya di `tests/`.

### Menambah mobil baru — langkah 4 adalah pengecualian, baca alasannya

Id mobil diulang di SQL dan tidak ikut otomatis dari TypeScript.

1. `lib/car-catalog.ts` → id di `STARTER_CAR_IDS` **atau** `PREMIUM_CAR_IDS`
   (`CAR_MODEL_IDS` dirakit dari keduanya) + entri di `CAR_CATALOG`. Mobil
   koleksi wajib punya `tagline`; itu yang dirender kartu katalognya.
2. `components/game/scene/mini-car.tsx` → geometri mobilnya. Bodi bergaya
   karakter hidup di `components/game/scene/playful-car-body.ts`.
3. `migrations/000N_*.sql` → migrasi **baru** yang menjatuhkan lalu membuat
   ulang `racely_players_car_model_check` dengan daftar id baru, **dan**
   `racely_players_owned_cars_check` dengan daftar yang sama. Inilah yang
   memperbarui database yang sudah berjalan. Daftar `owned_cars` yang
   ketinggalan adalah yang paling mahal: katalog menawarkan mobil yang lalu
   ditolak database begitu pemain membelinya.
4. `migrations/0001_racely_core.sql` → perbarui **juga** kedua daftar
   `car_model IN (...)` di dalamnya.

Khusus mobil koleksi, tiga tempat lagi — semuanya ditulis manual:

5. `lib/economy-config.ts` → knob harga di `EconomyConfig`, `DEFAULT_ECONOMY`,
   `economyConfigSchema`, dan cabangnya di `carPriceAt`.
6. `app/admin/admin-economy.tsx` → knob itu di grup "Mobil koleksi", kalau
   tidak harganya tidak bisa disetel siapa pun.
7. `components/game/car/car-collection.tsx` → ikon karakternya di
   `COLLECTION_ICONS`. Petanya diketik `Record<PremiumCarId, LucideIcon>`,
   jadi yang ini ketahuan saat build, bukan saat dilihat pemain.

Langkah 4 tampak melanggar aturan "jangan edit migrasi yang sudah dijalankan",
dan ini satu-satunya pengecualian. Aman karena `scripts/migrate.mjs` melewati
file yang sudah tercatat di `racely_schema_migrations`, dan blok constraint di
0001 dijaga `IF NOT EXISTS` — suntingan itu tidak akan pernah menyentuh
database yang sudah ada. Gunanya untuk database baru.

`tests/car-catalog-consistency.test.ts` membaca **semua** migrasi, jadi daftar
id yang ketinggalan di langkah 3 maupun 4 memerahkan test itu.

### Mengubah ekonomi, reward, atau biaya upgrade

**Nilainya tidak lagi ada di kode.** Seluruh angka ekonomi hidup di
`EconomyConfig` (`lib/economy-config.ts`) dan disetel lewat panel admin di
`/admin` → tab Ekonomi, tanpa deploy. `DEFAULT_ECONOMY` di file itu adalah
nilai yang berlaku selama tabel `racely_economy_config` masih kosong.

Yang diubah di kode hanyalah **rumus**, atau **knob baru**:

1. `lib/economy-config.ts` → tambah field di `EconomyConfig`, `DEFAULT_ECONOMY`,
   dan `economyConfigSchema` (dengan batas yang masuk akal).
2. `app/admin/admin-economy.tsx` → tambah field itu ke `GROUPS` supaya muncul di
   panel. Knob yang tidak terdaftar di sana tidak bisa disetel siapa pun.
3. Alirkan ke pemakainya. Config ikut di `GameState.economy`, jadi UI membacanya
   dari `game.economy.*` — **jangan** mengimpor angka sebagai konstanta modul
   lagi; itu yang dulu membuat tampilan dan server bisa menyimpang tanpa satu
   error pun.

Rumus murni tetap di `lib/economy-config.ts` (`lapSecondsAt`, `lapRewardAt`,
`upgradeCostAt`) dan penyelesaian balapan di `lib/game-economy.ts` — keduanya
tanpa I/O. Jangan menaruh aturan ekonomi di `lib/game-server.ts`; file itu untuk
persistensi. Pembacaan config dari database ada di `lib/economy-store.ts`
(cache per-proses 30 detik, alasan yang sama dengan rate limiter).

Test: `tests/economy-config.test.ts` (batas + proyeksi),
`tests/game-economy.test.ts` (mengunci nilai bawaan).

### Menyentuh panel admin

`/admin` adalah permukaan terpisah: browser desktop, bukan Telegram. Ia tidak
memakai satu pun komponen atau kelas CSS milik app pemain.

- `lib/admin-auth.ts` — password dari `RACELY_ADMIN_PASSWORD` + cookie sesi
  bertanda tangan. **Tidak ada bypass development.** Kunci penanda tangan
  diturunkan dari password, jadi rotasi password memutus semua sesi.
- `lib/admin-ops.ts` — antrean penarikan, tabel perpindahan status, audit,
  ringkasan kewajiban.
- `lib/admin-api.ts` — `guardAdmin()`. Setiap route di `app/api/admin/` wajib
  memanggilnya; yang mengubah sesuatu memakai `{ mutating: true }` (cek Origin).
- `app/admin/admin.css` — gaya panel, semua bersumber token di `:root`.

**`paid` dan `rejected` adalah status akhir.** Jangan pernah menambahkan jalur
keluar dari keduanya di `ALLOWED_TRANSITIONS`: `rejected` mengembalikan koin ke
saldo pemain, jadi menolak penarikan yang sudah dibayar akan memulangkan koin
yang uangnya sudah keluar dari rekening. Alasan lengkapnya ada di migrasi 0008.
Dijaga `tests/admin-ops.test.ts`.

### Menambah kolom atau tabel

`migrations/000N_*.sql` **dan** `lib/db/schema.ts`. Runner mengurutkan file
berdasarkan nama dan mencatat yang sudah jalan di `racely_schema_migrations`,
jadi penomoran harus naik. Jalankan `pnpm run db:migrate`.

### Menambah endpoint API

Ikuti pola `app/api/game/action/route.ts`: `runtime = "nodejs"`,
`dynamic = "force-dynamic"`, autentikasi lewat `lib/telegram-auth.ts`,
throttle lewat `consumeRateLimit`, dan baca body dengan `readJsonBody`
(`lib/http-body.ts`) yang punya batas ukuran — jangan `request.json()`
langsung.

### Mengubah tampilan: spacing, tipografi, warna, sudut

Semua nilai desain hidup sebagai token di `:root` (`app/globals.css`). **Jangan
menulis angka langsung di call site** — cari rung yang cocok di tangga token,
dan kalau memang belum ada, tambahkan rung baru di `:root` dulu. Tangganya:
`--space-*` (ukuran & jarak), `--fs-*` (huruf), `--fw-*`, `--lh-*`, `--track-*`,
`--icon-*`, `--corner-*`, plus `--stroke*`, `--focus-*`, `--z-*`, `--dur-*`.

Yang tetap literal dan memang boleh: nilai struktural (`0`, `1`, `auto`,
`100%`, rasio flex, track grid), keyframe, dan persentase `color-mix`.

**Jangan memakai awalan `--leading-*` atau `--tracking-*` untuk token baru.**
Keduanya namespace tema Tailwind v4; Tailwind meng-emit defaultnya ke `:root`,
jadi menimpanya diam-diam mengubah utility `leading-tight`/`leading-relaxed`
di seluruh app. Itu sebabnya token di sini bernama `--lh-*` dan `--track-*`.

Di TSX pakai utility yang bersumber token (`px-xl`, `gap-md`, `text-read`) atau
`py-(--space-20)` untuk nilai di luar alias — bukan `px-6`/`text-[14px]`.

### Menambah komponen

`components/game/shell/` kerangka · `scene/` react-three-fiber ·
`race/` panel balapan · `panels/` panel tab non-3D · `car/` pemilihan mobil.
Komponen react-three-fiber **wajib** di `scene/` (lihat AGENTS.md di sana).

## Sebelum push

```bash
pnpm run typecheck && pnpm run lint && pnpm test
PUBLIC_APP_URL=https://racely.fun pnpm run build
```

Ini adalah pemeriksaan lokal utama. CI juga menjalankan `pnpm run db:migrate`
sebelum test dengan Postgres sementara agar suite database tidak ter-skip.
`PUBLIC_APP_URL` dibutuhkan saat build karena halaman `/` di-prerender dan
`metadataBase` ikut dibekukan.

Tanpa `DATABASE_URL`, `tests/database.test.ts` ter-skip secara lokal — itu
normal. Di CI skip tidak diizinkan dan suite akan gagal kalau terjadi.

## Jebakan

- **Blok `nextjs-agent-rules` di atas ditulis ulang oleh `next dev`.** Hanya
  isi di antara marker yang diganti; tulisan di luarnya aman. Jangan
  memindahkan teks ini ke dalam blok.
- **`vercel.json` jangan dihapus.** `"deploymentEnabled": false` adalah rem
  yang menahan Vercel membuat deployment otomatis setiap push — repo ini
  dideploy ke EC2, dan pengerjaan lewat v0 akan membanjiri riwayat deployment
  kalau rem itu dilepas.
- **`.env.development` memang di-commit**, isinya hanya flag preview
  non-rahasia. Semua secret produksi hidup di `/etc/racely/racely.env`.
