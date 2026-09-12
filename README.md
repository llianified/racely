# Racely

Telegram Mini App + bot balapan ringan: pemain balap, upgrade mobil, kumpulkan
koin, lalu mengajukan withdrawal yang diproses manual.

**Stack:** Next.js 16 (App Router, `output: "standalone"`) · React 19 ·
TypeScript · Tailwind CSS 4 · Drizzle ORM + Neon Postgres · react-three-fiber ·
Vitest. Produksi berjalan sebagai Node.js standalone di balik PM2 di AWS EC2 —
**bukan** serverless.

**Status:** live di [https://racely.fun](https://racely.fun).

> Repo ini memakai Next.js 16, yang punya breaking change dibanding versi
> sebelumnya. Baca panduan di `node_modules/next/dist/docs/` sebelum menulis
> kode — lihat `AGENTS.md`.

---

## Mulai cepat (development)

Prasyarat: Node.js **20.9+** (CI memakai 22) dan pnpm — versinya dipatok lewat
`packageManager` di `package.json`, jadi `corepack enable` sudah cukup.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Tanpa `DATABASE_URL` dan tanpa Telegram pun UI tetap bisa dibuka:
`.env.development` menyalakan `RACELY_ENABLE_PREVIEW=true`, sehingga verifikasi
Telegram `initData` dilewati dan state permainan disimpan di cookie preview.
Mode ini **hanya** aktif saat `NODE_ENV !== "production"`.

Untuk menguji gate Telegram secara lokal, set `RACELY_ENABLE_PREVIEW=false`.

Menjalankan dengan database sungguhan:

```bash
cp .env.example .env.local     # isi DATABASE_URL
pnpm run db:migrate            # idempoten, aman diulang
pnpm dev
```

---

## Struktur

```
app/                    App Router — route tipis, logika didelegasikan ke lib/
  api/game/             GET state + POST action (aksi pemain), keduanya rate-limited
  api/telegram/webhook/ Endpoint webhook bot
  api/health/           Health check load balancer (503 saat DB tak terjangkau)
components/
  game/                 UI permainan (client components)
    game-dashboard.tsx  Orkestrasi: state, SWR, aksi pemain
    game-client.ts      Transport /api/game (error, parsing, deteksi sesi kedaluwarsa)
    use-telegram-webapp.ts  Bootstrap Telegram WebApp + haptic
    shell/              Kerangka: navigasi, menu, boot screen, gate, dialog
    scene/              Lapisan react-three-fiber (WebGL)
    race/               Panel balapan & lintasan
    panels/             Panel tab non-3D: garasi, dompet, hadiah
    car/                Pemilihan & pewarnaan mobil
  ui/                   Primitif shadcn/base-ui
lib/
  game.ts               Aturan & konstanta murni, dipakai server dan client
  game-economy.ts       Perhitungan hasil balapan (murni, tanpa I/O)
  game-server.ts        Eksekusi aksi terhadap database (`server-only`)
  preview-game.ts       State permainan berbasis cookie untuk mode preview
  telegram-auth.ts      Verifikasi HMAC initData + sesi preview
  telegram-bot.ts       Pemanggilan Bot API
  telegram-updates.ts   Dedupe update webhook lewat Postgres
  rate-limit.ts         Rate limiter per pemain (in-memory, per proses)
  http-body.ts          Baca body request dengan batas ukuran (streaming)
  car-catalog.ts        Katalog mobil & warna
  db/
    connection-url.ts   Normalisasi DSN — paksa TLS verify-full untuk host remote
    index.ts            Pool koneksi + instance Drizzle
    schema.ts           Skema tabel
migrations/             SQL bernomor, dijalankan scripts/migrate.mjs
scripts/                Migrasi, persiapan build standalone, setup bot
tests/                  Vitest (lingkungan node)
```

`scene/` berdiri sendiri karena react-three-fiber menggerakkan scene graph
dengan memutasi objek Three.js — itu model pemrogramannya, bukan bug. Aturan
`react-hooks/immutability` dimatikan tepat untuk direktori itu di
`eslint.config.mjs`, jadi setiap komponen biasa tetap dijaga.

Batas yang dijaga: `lib/game-server.ts`, `lib/http-body.ts`, dan `lib/db/`
mengimpor `server-only` sehingga tidak mungkin ikut terbundel ke client;
`lib/game.ts` dan `lib/game-economy.ts` sengaja murni supaya bisa diuji tanpa
database. `lib/db/connection-url.ts` sengaja bebas dependensi karena
`scripts/migrate.mjs` berjalan di plain node dan meniru aturan yang sama —
`tests/database-url.test.ts` menjaga keduanya tetap sinkron.

---

## Script

| Perintah | Kegunaan |
|---|---|
| `pnpm dev` | Server development |
| `pnpm run typecheck` | `tsc --noEmit` |
| `pnpm run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `pnpm test` | Vitest sekali jalan |
| `pnpm run db:migrate` | Terapkan migrasi (idempoten) |
| `pnpm run build` | Build Next.js |
| `pnpm start` | Jalankan hasil build Next.js |
| `pnpm run build:standalone` | Build + salin `public/` dan `.next/static` |
| `pnpm run start:standalone` | Jalankan hasil build standalone |
| `pnpm run bot:setup` | Daftarkan webhook + command bot (repeatable) |
| `pnpm run pm2:start` / `pm2:reload` | Kelola proses produksi lewat PM2 |

---

## Environment

`.env.example` adalah daftar lengkap beserta penjelasan tiap variabel. Ringkas:
`DATABASE_URL` (Neon, pooled), `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_APP_URL` (nilai produksi:
`https://racely.fun`).

Di produksi **tidak ada** file env di dalam repo. Nilai asli hidup di
`/etc/racely/racely.env` (`chmod 600`) dan dimuat `ecosystem.config.cjs` lewat
`node --env-file`. `.env.development` sengaja ikut di-commit karena hanya berisi
flag preview non-rahasia.

`PUBLIC_APP_URL` dibutuhkan **saat build**, bukan hanya saat runtime: halaman
`/` di-prerender, jadi `metadataBase` ikut dibekukan ke dalam hasil build.

Jangan pernah menulis token, connection string, atau secret ke dalam repo, log,
atau commit message.

---

## Test

```bash
pnpm test
```

Suite berjalan tanpa database: `tests/database.test.ts` otomatis di-skip kalau
`DATABASE_URL` kosong. Dengan `DATABASE_URL` terisi, test itu menguji skema,
CHECK constraint, persistensi, idempotensi `requestId`, retensi receipt, dan
dedupe update Telegram terhadap Postgres sungguhan — jalankan
`pnpm run db:migrate` lebih dulu.

Di CI skip itu tidak diizinkan: workflow menyediakan service container Postgres,
dan suite sendiri menegaskan `DATABASE_URL` ada setiap kali `CI` di-set, supaya
konfigurasi yang rusak membuat run gagal alih-alih hijau tanpa menguji apa pun.

---

## CI

`.github/workflows/ci.yml` berjalan di setiap pull request dan push ke `main`:
typecheck → lint → migrasi → test (dengan Postgres sungguhan) → build. Kalau CI
merah, jangan deploy.

---

## Deploy

Urutan rilis produksi:

```bash
pnpm run db:migrate
pnpm run build:standalone
pnpm run pm2:reload
pnpm run bot:setup
```

**`vercel.json` jangan dihapus.** `"deploymentEnabled": false` di dalamnya
adalah rem yang menahan Vercel supaya tidak membuat deployment otomatis setiap
push — repo ini dideploy ke EC2, dan pengerjaan lewat v0 akan membanjiri riwayat
deployment dengan entri sampah kalau rem itu dilepas.

---

## Keputusan yang tidak boleh diubah

- Produksi **wajib** autentikasi Telegram `initData` (HMAC + cek kedaluwarsa).
- Mode preview hanya untuk development, butuh `RACELY_ENABLE_PREVIEW=true`
  **dan** `NODE_ENV !== "production"`.
- **Withdrawal tetap antrean manual berstatus `pending`.** Jangan pernah
  diubah menjadi transfer otomatis.
- Deployment adalah Node.js standalone + PM2 di EC2, bukan serverless.
- Migrasi bersifat additive dan idempoten. Untuk membatalkan sesuatu, tulis
  migrasi maju baru — jangan mengedit migrasi yang sudah dijalankan.
