# Racely — Handoff & Sisa Pekerjaan

Dokumen ini adalah prompt handoff lengkap. Isinya bisa langsung dipakai sebagai
konteks untuk sesi berikutnya (manusia atau agent). Semua item tersisa ditulis
sebagai checklist `[ ]` supaya bisa dicentang saat dikerjakan.

---

## 1. Konteks Proyek

**Repo:** `llianified/racely`
**Branch kerja saat ini:** `racely`
**Branch asal:** `v0/telegram-integration-123e00b7` (commit awal `7af7a54`)
**Commit terakhir:** `0dce182` — *docs: add Racely handoff and remaining-work checklist*
**Commit kode terakhir:** `bb9481b` — *feat: add Telegram update handling and database schema changes*
**Stack:** Next.js (App Router, `output: "standalone"`), TypeScript, Drizzle ORM,
Neon Postgres, Vitest, PM2 di AWS EC2.

### Keputusan final yang TIDAK boleh diubah

- Produksi **wajib** autentikasi Telegram `initData` (HMAC + cek kedaluwarsa).
- Mode preview **hanya** untuk development lokal, aktif jika
  `RACELY_ENABLE_PREVIEW=true` **dan** `NODE_ENV !== "production"`.
- Produk adalah **bot Telegram + Telegram Mini App penuh**.
- **Withdrawal tetap antrean manual berstatus `pending`.** Jangan pernah
  mengubahnya menjadi transfer otomatis.
- Deployment: **Node.js standalone + PM2** di AWS EC2 (bukan serverless).
- **Jangan pernah** menulis, mencetak, atau meng-commit credential /
  connection string / bot token — di file, log, commit message, maupun jawaban.

### Status environment variable

| Variable | Status di sandbox v0 | Catatan |
|---|---|---|
| `DATABASE_URL` | **Tidak terbaca** di sandbox | Tersedia di server EC2. User menyatakan akan menambahkannya ke project v0, tapi sampai sesi ini berakhir belum muncul di env. Jangan minta ulang tanpa mengecek dulu. |
| `TELEGRAM_BOT_TOKEN` | Tidak ada | Sengaja hanya di EC2. Didokumentasikan di `.env.example`. |
| `TELEGRAM_WEBHOOK_SECRET` | Tidak ada | Sama seperti di atas. |
| `PUBLIC_APP_URL` | Tidak ada | Sama seperti di atas. |
| `TELEGRAM_BOT_USERNAME` | Opsional (baru) | Default `RacelyBot`; override untuk bot staging. |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Ada | Tidak dipakai fitur Racely. |

---

## 2. Yang Sudah Selesai

### Sebelum sesi ini (commit `7af7a54`)

- Preview/auth hardening di `lib/telegram-auth.ts`.
- Persistensi `car_model`, onboarding, dan game state server-authoritative.
- Migrasi `migrations/0001_racely_core.sql` + runner `scripts/migrate.mjs`.
- Telegram bot helper, webhook route, dan setup script.
- Health endpoint, standalone build helper, PM2 config, `.env.example`.
- Next standalone output dan script package terkait.

### Di sesi ini (commit `bb9481b`)

**Deduplikasi update Telegram (sebelumnya tidak ada sama sekali)**
- `lib/db/schema.ts` — tabel baru `racely_telegram_updates`
  (`update_id` bigint PK, `received_at` timestamptz, index waktu).
- `migrations/0002_telegram_updates.sql` — migrasi untuk tabel tersebut.
- `lib/telegram-updates.ts` — `claimTelegramUpdate()` (klaim idempoten lewat
  `ON CONFLICT DO NOTHING`, dengan fallback in-process `Set` saat `db` null) dan
  `releaseTelegramUpdate()` (mengembalikan klaim agar retry Telegram tidak
  tertelan diam-diam saat error transien).
- `app/api/telegram/webhook/route.ts` — memakai hasil `safeParse` (sebelumnya
  hasil parse dibuang dan `payload` mentah yang dipakai), memvalidasi
  `PUBLIC_APP_URL` lebih awal dengan respons `503`, klaim update sebelum
  diproses, balas `{ ok: true, duplicate: true }` untuk update berulang, dan
  melepas klaim saat handler gagal.

**Keamanan & konsistensi**
- `scripts/migrate.mjs` — error Postgres discrub (URL dan
  `password=` / `user=` / `sslmode=`) sebelum di-log, sekaligus tidak lagi
  menelan pesan error sepenuhnya.
- `scripts/setup-telegram-bot.mjs` — username bot dibuat konfigurabel lewat
  `TELEGRAM_BOT_USERNAME`, dan pesan error di-scrub dari bot token (base URL
  Telegram API memuat token).
- `migrations/0001_racely_core.sql` — `CHECK` constraint idempoten untuk
  `car_model` (`'neo-falcon' | 'luna-gt'`) agar DB sejalan dengan katalog di
  `lib/car-catalog.ts`.

**Infrastruktur tes (baru)**
- `vitest.config.ts` — alias `@/`, stub `server-only`, setup env.
- `tests/stubs/server-only.ts`, `tests/setup-env.ts`.
- `tests/telegram-auth.test.ts` — initData valid / hash salah / kedaluwarsa /
  field hilang, serta gating preview.
- `tests/telegram-bot.test.ts` — secret webhook, `/start`, `/play`, update
  duplikat (dengan `lib/db` di-mock null agar jalur fallback teruji terisolasi).
- `tests/withdrawal-policy.test.ts` — memastikan withdrawal selalu `pending`.

> Catatan: file tes di atas **belum pernah dijalankan sampai hijau**. Sesi
> berhenti sebelum `pnpm test` dieksekusi ulang. Anggap tes ini sebagai draft
> yang masih perlu diverifikasi dan kemungkinan disesuaikan dengan signature
> fungsi yang sebenarnya.

---

## 3. Checklist Sisa Pekerjaan

### A. Stabilkan test suite

- [ ] Jalankan `pnpm test` dan perbaiki kegagalan pada tiga file tes baru
      (`telegram-auth`, `telegram-bot`, `withdrawal-policy`).
- [ ] Sesuaikan nama import/ekspor di tes bila tidak cocok dengan implementasi
      (`lib/telegram-auth.ts`, `lib/telegram-bot.ts`, `lib/game-economy.ts`).
- [ ] Pastikan `tests/preview-game.test.ts` yang lama masih lulus setelah
      penambahan `vitest.config.ts`.
- [ ] Verifikasi tes tidak butuh jaringan: semua panggilan `fetch` ke Telegram
      harus ter-mock.

### B. Database

- [ ] Konfirmasi `DATABASE_URL` benar-benar tersedia (cek env project, jangan
      minta ke user sebelum dicek).
- [ ] Jalankan `pnpm db:migrate` (butuh izin mutasi database dari user).
- [ ] Validasi skema aktual: tabel `racely_players`, `racely_withdrawals`,
      `racely_telegram_updates`, kolom `car_model`, dan CHECK constraint
      `racely_players_car_model_check`.
- [ ] Tambahkan `tests/database.test.ts` yang **auto-skip** saat `DATABASE_URL`
      kosong, mencakup:
  - [ ] onboarding tersimpan di Neon,
  - [ ] pilihan mobil (`car_model`) persisten lintas request,
  - [ ] `claimTelegramUpdate()` benar-benar idempoten di Postgres,
  - [ ] withdrawal tersimpan dengan status `pending`.

### C. Verifikasi build & kualitas

- [ ] `pnpm run typecheck`
- [ ] `pnpm install --frozen-lockfile` (frozen-lockfile check)
- [ ] `pnpm run build:standalone`
- [ ] Pastikan `lib/telegram-updates.ts` tidak ikut ter-bundle ke client.

### D. Verifikasi UI

- [ ] Jalankan dev server dengan preview development eksplisit
      (`RACELY_ENABLE_PREVIEW=true`, `NODE_ENV=development`).
- [ ] Verifikasi dengan agent-browser pada viewport **384x595**, **dark mode**.
- [ ] Alur yang dicek: onboarding → pemilihan mobil → dashboard → withdrawal
      (harus menampilkan status pending/manual, bukan janji transfer otomatis).
- [ ] Simpan screenshot ke `/tmp/agent-browser/` (jangan di dalam repo).

### E. Audit deployment

- [ ] Audit `ecosystem.config.cjs`: PM2 harus membaca env dari file di luar
      repo, `instances`/`exec_mode` sesuai, restart policy dan log path benar.
- [ ] Audit `scripts/prepare-standalone.mjs`: pastikan `public/` dan
      `.next/static` tersalin, dan hasilnya idempoten saat dijalankan ulang.
- [ ] Audit `scripts/setup-telegram-bot.mjs`: harus repeatable (aman dijalankan
      berkali-kali) dan tidak pernah mencetak token.
- [ ] Tulis runbook EC2 singkat: langkah deploy, rotasi secret, cara set
      webhook, cara rollback.
- [ ] Konfirmasi `.env.example` mendokumentasikan semua variabel termasuk
      `TELEGRAM_BOT_USERNAME`, tanpa nilai asli.

### F. Penutup

- [ ] Update TodoManager sesuai progres.
- [ ] Commit dan sync ke branch yang sama.
- [ ] Tulis ringkasan hasil + langkah operasional yang tersisa untuk operator.

---

## 4. Temuan Audit yang Belum Ditindaklanjuti

Catatan dari pembacaan kode yang belum sempat diperbaiki:

- [ ] **Rate limiting** belum ada di `app/api/game/action/route.ts`. Endpoint
      ini mengubah saldo, jadi rentan di-spam dari Mini App.
- [ ] **Pembersihan `racely_telegram_updates`** hanya berjalan best-effort di
      dalam `claimTelegramUpdate()`. Pertimbangkan job terjadwal atau TTL agar
      tabel tidak tumbuh tanpa batas.
- [ ] **Security headers** belum dikonfigurasi di `next.config.mjs`
      (`X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`,
      `Permissions-Policy`). Perlu hati-hati dengan framing karena Mini App
      berjalan di dalam WebView Telegram — jangan pasang `X-Frame-Options: DENY`.
- [ ] **Konsistensi katalog mobil** antara `lib/car-catalog.ts`,
      CHECK constraint DB, dan `components/game/car-selection.tsx` perlu satu
      sumber kebenaran agar penambahan mobil baru tidak memerlukan tiga edit.
- [ ] **Health endpoint** sebaiknya juga melaporkan status koneksi DB agar PM2
      dan load balancer bisa mendeteksi degradasi.

---

## 5. Prompt Siap Pakai untuk Sesi Berikutnya

### 5a. Versi pendek (jika agent bisa membaca repo)

```text
Lanjutkan implementasi produksi Racely di repo llianified/racely, branch racely,
commit 0dce182. Baca docs/HANDOFF.md lebih dulu — dokumen itu memuat seluruh
konteks, keputusan final, status environment variable, checklist sisa pekerjaan,
dan temuan audit yang belum ditindaklanjuti.

Kerjakan checklist bagian A sampai F secara berurutan, dan centang item di
docs/HANDOFF.md setiap kali satu item benar-benar selesai. Prioritas pertama:
menstabilkan tiga file tes baru (tests/telegram-auth.test.ts,
tests/telegram-bot.test.ts, tests/withdrawal-policy.test.ts) yang belum pernah
dijalankan sampai hijau — perlakukan sebagai draft, bukan sebagai tes yang sudah
terbukti benar.

Batasan keras: withdrawal tetap antrean manual berstatus pending (jangan pernah
jadi transfer otomatis); produksi wajib auth Telegram initData; preview hanya
aktif saat RACELY_ENABLE_PREVIEW=true DAN NODE_ENV bukan production; jangan
pernah menulis atau mencetak credential, connection string, atau bot token di
file, log, commit, maupun jawaban. Cek env yang benar-benar tersedia sebelum
meminta variabel apa pun, dan jangan pernah meminta DATABASE_URL ulang tanpa
mengecek.
```

### 5b. Versi lengkap (self-contained, tanpa perlu baca dokumen ini)

```text
Lanjutkan implementasi produksi Racely: Telegram bot + Telegram Mini App
berbasis Next.js App Router (output standalone), TypeScript, Drizzle ORM, Neon
Postgres, Vitest, dideploy sebagai Node.js standalone + PM2 di AWS EC2.
Repo llianified/racely, branch racely, commit 0dce182.

KEPUTUSAN FINAL YANG TIDAK BOLEH DIUBAH
- Produksi wajib autentikasi Telegram initData (HMAC + cek kedaluwarsa).
- Mode preview hanya untuk development lokal: aktif jika
  RACELY_ENABLE_PREVIEW=true DAN NODE_ENV bukan production.
- Withdrawal tetap antrean manual berstatus pending. Jangan pernah diubah
  menjadi transfer otomatis.
- Deployment Node.js standalone + PM2, bukan serverless.
- Jangan pernah menulis, mencetak, atau meng-commit credential, connection
  string, atau bot token.

SUDAH SELESAI
- Auth/preview hardening, persistensi car_model dan onboarding, game state
  server-authoritative, migrasi 0001 + runner scripts/migrate.mjs, bot helper,
  webhook route, health endpoint, PM2 config, .env.example, standalone build.
- Deduplikasi update Telegram: tabel racely_telegram_updates,
  migrations/0002_telegram_updates.sql, lib/telegram-updates.ts
  (claimTelegramUpdate + releaseTelegramUpdate), dan perbaikan webhook route
  yang sebelumnya membuang hasil safeParse lalu memakai payload mentah.
- Scrubbing credential di scripts/migrate.mjs dan
  scripts/setup-telegram-bot.mjs, CHECK constraint car_model, serta
  vitest.config.ts plus tiga file tes baru.

BELUM SELESAI — INI YANG HARUS DIKERJAKAN
A. Jalankan pnpm test, perbaiki tiga file tes baru sampai hijau, pastikan
   semua fetch ke Telegram ter-mock dan tes lama tetap lulus.
B. Cek ketersediaan DATABASE_URL, minta izin mutasi database, jalankan
   pnpm db:migrate, validasi skema aktual (racely_players,
   racely_withdrawals, racely_telegram_updates, kolom car_model, constraint
   racely_players_car_model_check), lalu tambahkan tests/database.test.ts yang
   auto-skip saat DATABASE_URL kosong untuk onboarding, persistensi car_model,
   idempotensi claim update, dan withdrawal pending.
C. Jalankan pnpm run typecheck, pnpm install --frozen-lockfile, dan
   pnpm run build:standalone.
D. Verifikasi UI dengan agent-browser pada viewport 384x595 dark mode memakai
   preview development eksplisit; alur onboarding, pemilihan mobil, dashboard,
   withdrawal; screenshot disimpan di /tmp/agent-browser/.
E. Audit ecosystem.config.cjs, scripts/prepare-standalone.mjs, dan
   scripts/setup-telegram-bot.mjs agar repeatable dan tidak membocorkan token;
   tulis runbook EC2 singkat (deploy, rotasi secret, set webhook, rollback).
F. Commit dan sync ke branch yang sama, lalu berikan ringkasan hasil dan
   langkah operasional yang tersisa.

TEMUAN AUDIT YANG BELUM DITINDAKLANJUTI
- Belum ada rate limiting di app/api/game/action/route.ts padahal endpoint itu
  mengubah saldo.
- Pembersihan racely_telegram_updates baru best-effort; perlu TTL atau job.
- Security headers belum diset di next.config.mjs; hati-hati soal framing
  karena Mini App berjalan di WebView Telegram, jangan pasang
  X-Frame-Options: DENY.
- Katalog mobil terduplikasi di lib/car-catalog.ts, constraint DB, dan
  components/game/car-selection.tsx; perlu satu sumber kebenaran.
- Health endpoint belum melaporkan status koneksi database.
```
