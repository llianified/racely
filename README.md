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
  api/admin/            Panel admin: sesi, antrean penarikan, config, kewajiban
  api/telegram/webhook/ Endpoint webhook bot
  api/health/           Health check load balancer (503 saat DB tak terjangkau)
  admin/                Panel operasional di /admin (browser desktop, bukan Telegram)
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
  game.ts               Aturan murni + tipe GameState, dipakai server dan client
  economy-config.ts     EconomyConfig: seluruh angka ekonomi + rumus dasarnya
  economy-store.ts      Baca/tulis config ke database (cache per-proses)
  economy-projection.ts Terjemahan config jadi proyeksi rupiah (untuk panel)
  admin-auth.ts         Password operator + cookie sesi panel admin
  admin-ops.ts          Antrean penarikan, perpindahan status, audit, kewajiban
  admin-api.ts          guardAdmin() untuk seluruh route /api/admin
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
docs/                   Prosedur yang jarang dipakai (rewrite histori Git)
```

Aturan untuk agent sengaja dipecah: `AGENTS.md` root berisi aturan keras dan
rute tugas, `CLAUDE.md` berisi aturan commit, dan `AGENTS.md` per area
(`components/game/scene/`, `lib/db/`, `app/admin/`) berisi aturan yang hanya
relevan saat menyentuh area itu. Penjelasan arsitektur dan alasan di balik
aturan hidup di README ini.

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
`https://racely.fun`), dan `RACELY_ADMIN_PASSWORD` untuk panel admin.

Di produksi **tidak ada** file env di dalam repo. Nilai asli hidup di
`/etc/racely/racely.env` (`chmod 600`) dan dimuat `ecosystem.config.cjs` lewat
`node --env-file`. `.env.development` sengaja ikut di-commit karena hanya berisi
flag preview non-rahasia.

`PUBLIC_APP_URL` dibutuhkan **saat build**, bukan hanya saat runtime: halaman
`/` di-prerender sehingga `metadataBase` dibekukan. Build tanpa env itu
menghasilkan aplikasi yang jalan tetapi OG card memakai origin cadangan;
`scripts/deploy-racely.sh` memuat env file sebelum `build:standalone` karena
alasan ini.

Rewarded interstitial memakai Monetag zone `11811175`. Loader
`https://libtl.com/sdk.js` baru dimuat saat pemain menekan tombol **Tonton**;
zone ini tidak membutuhkan environment variable publik. CSP app pemain tetap
mematok `script-src` ke host loader tersebut, tetapi `connect-src` menerima
HTTPS karena endpoint jaringan dan kreatif Monetag memakai host dinamis. Policy
`/admin` terpisah: koneksi hanya ke origin sendiri, tanpa host atau frame iklan.

Jangan pernah menulis token, connection string, atau secret ke dalam repo, log,
atau commit message.

---

## Panel admin

`/admin` — antrean penarikan dan config ekonomi. Dibuka di **browser desktop**,
bukan di dalam Telegram: pekerjaannya menyalin nomor rekening dan menyetel
angka, bukan bermain.

```bash
# tambahkan ke .env.local (lokal) atau /etc/racely/racely.env (produksi)
RACELY_ADMIN_PASSWORD=<minimal 16 karakter>
```

Tanpa variabel itu panel menjawab 503 dan tidak menampilkan apa pun. Password di
bawah 16 karakter diperlakukan sama dengan tidak diisi — panel ini menyetujui
pembayaran rupiah, jadi ia menolak dijaga rahasia yang lemah. Tidak ada bypass
mode preview di sini; `pnpm dev` pun tetap meminta password.

Tiga tab:

- **Antrean** — penarikan per status, lengkap dengan konteks pemain (saldo,
  putaran, berapa kali pernah dibayar) dan tombol salin nomor rekening.
  Perpindahan status: `pending → processing → paid`, atau `→ rejected` yang
  memulangkan koin ke saldo pemain pada sync berikutnya. **`paid` dan `rejected`
  tidak bisa bergerak lagi.**
- **Ekonomi** — seluruh `EconomyConfig`, dengan proyeksi rupiah yang dihitung
  langsung saat diisi: penghasilan per jam, per hari idle, per bulan, biaya
  max-out, dan nilai sebuah akun baru. Perubahan berlaku ≤30 detik (cache
  per-proses) tanpa deploy.
- **Kewajiban** — total koin yang belum ditarik dalam rupiah, antrean yang
  menunggu dibayar, dan jejak audit setiap keputusan.

Di luar produksi ada tombol **Seed penarikan** yang membuat pemain palsu beserta
penarikan `pending`, supaya tata letak antrean bisa diuji tanpa membuat akun
Telegram baru dan menggiling koin sampai batas minimum.

Setiap perubahan status dan penyimpanan config dicatat di `racely_admin_audit`.

---

## Ekonomi

Seluruh angka ekonomi — konversi koin ke rupiah, batas penarikan, saldo awal,
durasi lap, reward, biaya upgrade, idle — hidup di `EconomyConfig`
(`lib/economy-config.ts`) dan disimpan di tabel `racely_economy_config`.
Operator menyetelnya dari `/admin` → tab Ekonomi tanpa deploy;
`DEFAULT_ECONOMY` hanya berlaku selama tabel itu masih kosong.

Pembagian tanggung jawab:

- `lib/economy-config.ts` — tipe, default, schema validasi, dan rumus murni
  (`lapSecondsAt`, `lapRewardAt`, `upgradeCostAt`).
- `lib/game-economy.ts` — penyelesaian balapan, murni tanpa I/O.
- `lib/economy-store.ts` — baca/tulis config ke database dengan cache
  per-proses 30 detik (alasan yang sama dengan rate limiter: satu proses PM2).
- `lib/economy-projection.ts` — proyeksi rupiah untuk panel admin.

Config ikut dikirim di `GameState.economy`, jadi UI membaca `game.economy.*`.
Dulu UI mengimpor angka sebagai konstanta modul, dan tampilan bisa menyimpang
dari server tanpa satu pun error — itu sebabnya sekarang hanya ada satu
sumber. `lib/game-server.ts` sengaja tidak berisi aturan ekonomi; file itu
untuk persistensi.

Test: `tests/economy-config.test.ts` (batas + proyeksi) dan
`tests/game-economy.test.ts` (mengunci nilai bawaan).

### Gaspol sudah pensiun

Gaspol dihapus dari permainan. `POST /api/game/action` dengan `{"type":"boost"}`
dijawab **410** oleh `lib/game-server.ts` maupun `lib/preview-game.ts` — cabangnya
sengaja dipertahankan supaya klien lama mendapat penjelasan, bukan 400 yang
membingungkan. Tidak ada lagi jendela boost yang dihitung settlement:
`boost_ends_at` dan `cooldown_ends_at` dikosongkan migrasi 0014 dan tidak
pernah ditulis lagi, dan `GameState.boostLeft`/`cooldown` selalu 0.

Knob `boostDurationSeconds`, `batteryRechargeSeconds`, `boostMultiplier`,
`boostCornerPenalty`, dan `boostLaunchGraceLap` masih ada di `EconomyConfig` —
`economyConfigSchema` itu `.strict()`, jadi menghapusnya akan membuat baris
config yang sudah tersimpan berhenti ter-parse. Panel admin tidak lagi
mendaftarkannya, dan `tests/economy-config.test.ts` mengunci daftar itu.

Satu-satunya keputusan berwaktu yang tersisa adalah **setup** — lihat
`lib/car-setup.ts`. `lib/race-dynamics.ts` masih mensimulasikan grip, tikungan,
dan selip, tapi seluruh isinya hanya sesi: ia tidak pernah menyentuh lap, koin,
atau kolom yang tersimpan. `isCleanBoostLaunch` tinggal sebagai pembanding
geometri untuk test; `tests/server-preview-parity.test.ts` menegaskan kedua
penulis state tidak memanggilnya.

---

## Token desain

Semua nilai desain app pemain hidup sebagai token di `:root`
(`app/globals.css`). Tangganya:

| Awalan | Untuk |
|---|---|
| `--space-*` | ukuran dan jarak |
| `--fs-*`, `--fw-*`, `--lh-*`, `--track-*` | ukuran, bobot, tinggi baris, spasi huruf |
| `--icon-*`, `--corner-*` | ukuran ikon, radius sudut |
| `--stroke*`, `--focus-*`, `--z-*`, `--dur-*` | garis, ring fokus, lapisan, durasi |

Di TSX pakai utility yang bersumber token (`px-xl`, `gap-md`, `text-read`),
atau `py-(--space-20)` untuk rung di luar alias — bukan `px-6` atau
`text-[14px]`. Kalau rung yang dibutuhkan belum ada, tambahkan di `:root`
dulu.

Yang tetap literal dan memang boleh: nilai struktural (`0`, `1`, `auto`,
`100%`, rasio flex, track grid), keyframe, dan persentase `color-mix`.

**Permukaan kotak** memakai satu resep, jangan meracik campuran baru:

| Kotak | Garis | Latar | Sudut |
|---|---|---|---|
| Kartu halaman (`.panel`) | `var(--border)` | `var(--card)` | `--corner-box` |
| Kotak yang bisa disentuh / catatan | `var(--border)` | `var(--secondary)` | `--corner-box` |
| Strip, sel angka, kaki di dalam kartu | `var(--border)` | `var(--surface-inset)` | `--corner-box` |
| Disorot (kartu diri, hadiah siap) | `color-mix(X 30%, var(--border))` | `color-mix(X 8%, latar)` | `--corner-box` |
| Aktif / terpilih | `color-mix(X 60%, var(--border))` | `color-mix(X 12%, latar)` | `--corner-box` |

`X` adalah `--accent` atau `--primary`; garis tint selalu dicampur ke
`var(--border)`, bukan `transparent`. Hanya pill dan lingkaran yang memakai
`--corner-pill`/`--corner-round`; `--press-radius` dan `--radius` khusus
keluarga tombol dan shadcn, bukan untuk kotak.

Token tinggi baris dan spasi huruf sengaja bernama `--lh-*` dan `--track-*`,
**bukan** `--leading-*`/`--tracking-*`: keduanya namespace tema Tailwind v4.
Tailwind meng-emit defaultnya ke `:root`, jadi menimpanya diam-diam mengubah
utility `leading-tight`/`leading-relaxed` di seluruh app.

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

Push ke `main` memicu `.github/workflows/deploy.yml`, yang SSH ke EC2 dan
menjalankan `scripts/deploy-racely.sh`: install → migrasi → verifikasi skema →
build (dengan env file dimuat) → `pm2 restart`. Rilis manual mengikuti urutan
yang sama, dan env harus sudah dimuat **sebelum** build:

```bash
set -a; source /etc/racely/racely.env; set +a
pnpm run db:migrate
pnpm run build:standalone
pnpm run pm2:reload
pnpm run bot:setup
```

`ecosystem.config.cjs` mengunci PM2 pada `instances: 1`, `exec_mode: "fork"`.
Rate limiter (`lib/rate-limit.ts`), dedupe webhook, dan penyapu pemberitahuan
idle (`lib/idle-notifier.ts`, dinyalakan dari `instrumentation.ts`) bersifat
per-proses; menambah instance merusak ketiganya — khusus penyapu, pemain akan
dikirimi pesan ganda.

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
  diubah menjadi transfer otomatis. Panel admin hanya mencatat keputusan
  operator; `paid` dan `rejected` adalah status akhir.
- Deployment adalah Node.js standalone + PM2 di EC2, bukan serverless.
- Migrasi bersifat additive dan idempoten. Untuk membatalkan sesuatu, tulis
  migrasi maju baru — jangan mengedit migrasi yang sudah dijalankan.
