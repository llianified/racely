# Racely — Handoff & Sisa Pekerjaan

Dokumen ini adalah konteks lengkap untuk sesi berikutnya (manusia atau agent).
Item tersisa ditulis sebagai checklist `[ ]`.

---

## 1. Konteks Proyek

**Repo:** `llianified/racely`
**Branch kerja:** `main`
**Stack:** Next.js 16 (App Router, `output: "standalone"`), TypeScript,
Drizzle ORM, Neon Postgres, Vitest, PM2 di AWS EC2.
**Runbook operasional:** `docs/RUNBOOK.md`.
**Tutorial manual dari nol sampai live:** `docs/SETUP-MANUAL.md`.

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
| `DATABASE_URL` | **Belum ada** | Tersedia di EC2. `tests/database.test.ts` auto-skip selama variabel ini kosong. Cek env dulu, jangan minta ulang. |
| `TELEGRAM_BOT_TOKEN` | Tidak ada | Sengaja hanya di EC2. |
| `TELEGRAM_WEBHOOK_SECRET` | Tidak ada | Sama seperti di atas. |
| `PUBLIC_APP_URL` | Tidak ada | Sama seperti di atas. |
| `TELEGRAM_BOT_USERNAME` | Opsional | Default `RacelyBot`; override untuk bot staging. |
| `RACELY_ENV_FILE` / `RACELY_LOG_DIR` | Hanya EC2 | Dibaca `ecosystem.config.cjs`. |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Ada | Tidak dipakai fitur Racely. |

---

## 2. Yang Sudah Selesai

### Fondasi

- Preview/auth hardening (`lib/telegram-auth.ts`), onboarding + persistensi
  `car_model`, game state server-authoritative.
- Migrasi `0001_racely_core.sql` (termasuk CHECK `car_model`) dan
  `0002_telegram_updates.sql`, runner `scripts/migrate.mjs` dengan scrubbing
  credential pada error Postgres.
- Bot helper, webhook route, `scripts/setup-telegram-bot.mjs` (repeatable,
  token di-scrub, username konfigurabel), standalone build helper, PM2 config,
  `.env.example`.
- Deduplikasi update Telegram: tabel `racely_telegram_updates` +
  `lib/telegram-updates.ts` (`claimTelegramUpdate` / `releaseTelegramUpdate`,
  fallback in-memory saat DB null, prune best-effort dengan retensi 2 hari).

### Sesi terakhir

- **A. Test suite hijau.** `pnpm test` → 8 file, 58 lulus, 5 skip (skip = tes
  database yang butuh `DATABASE_URL`). Semua `fetch` ke Telegram ter-mock,
  tidak ada tes yang butuh jaringan. Config dipindah ke `vitest.config.mts`.
- **B. Database.** `tests/database.test.ts` ditambahkan dengan auto-skip:
  onboarding tersimpan, `car_model` persisten, `claimTelegramUpdate()`
  idempoten di Postgres, withdrawal `pending`. Migrasi belum dijalankan di
  sandbox karena `DATABASE_URL` belum tersedia.
- **C. Kualitas.** `pnpm run typecheck`, `pnpm run lint`, `pnpm install
  --frozen-lockfile`, dan `pnpm run build:standalone` lulus.
  `lib/telegram-updates.ts` dipastikan tidak ter-bundle ke client (dijaga
  `server-only`). Lint memakai ESLint flat config (`eslint.config.mjs`) —
  `next lint` sudah dihapus di Next 16. Semua gate ini dijalankan otomatis di
  `.github/workflows/ci.yml`.
- **D. UI.** Diverifikasi agent-browser pada 384x595 dark mode: onboarding →
  pemilihan mobil → dashboard → withdrawal (status pending/manual), serta
  respons `429` saat rate limit tercapai.
- **E. Deployment.** `ecosystem.config.cjs` membaca env dari file di luar repo
  (`RACELY_ENV_FILE`), `instances: 1` + `exec_mode: "fork"` (karena dedupe
  fallback dan rate limiter per-proses), restart policy dan log path eksplisit.
  Runbook EC2 ditulis di `docs/RUNBOOK.md` (deploy, rotasi secret, set webhook,
  rollback, troubleshooting). `.env.example` melengkapi semua variabel.
- **Temuan audit yang ditindaklanjuti:** rate limiting di
  `app/api/game/action/route.ts` (`lib/rate-limit.ts` + `tests/rate-limit.test.ts`),
  security headers di `next.config.mjs` (tanpa `X-Frame-Options` supaya Mini App
  tetap bisa di-frame Telegram), health endpoint melaporkan status koneksi DB,
  katalog mobil satu sumber kebenaran di `lib/car-catalog.ts` dengan
  `tests/car-catalog-consistency.test.ts` yang mengunci CHECK constraint DB.

---

## 3. Sisa Pekerjaan

Semua sisa membutuhkan akses ke database atau instance EC2 — tidak bisa
diselesaikan di sandbox v0.

- [ ] Tambahkan `DATABASE_URL` ke project, jalankan `pnpm db:migrate`, lalu
      jalankan ulang `pnpm test` agar 5 tes database ikut tereksekusi.
- [ ] Validasi skema aktual di Neon: `racely_players`, `racely_withdrawals`,
      `racely_telegram_updates`, kolom `car_model`, dan constraint
      `racely_players_car_model_check`.
- [ ] Deploy pertama ke EC2 mengikuti `docs/RUNBOOK.md`, lalu set webhook
      dengan `pnpm run bot:setup` dan verifikasi `/start` serta `/play`.
- [ ] Uji Mini App di dalam WebView Telegram sungguhan (initData asli), bukan
      hanya preview development.
- [ ] Bangun proses operasional untuk memproses antrean withdrawal `pending`
      (siapa yang meninjau, SLA, pencatatan bukti transfer).

### Peningkatan opsional

- [ ] Pindahkan rate limiter dan dedupe update ke Postgres/Redis bila perlu
      lebih dari satu instance PM2.
- [ ] Ganti prune probabilistik `racely_telegram_updates` dengan job terjadwal
      atau TTL bila volume update besar.

---

## 4. Prompt Siap Pakai untuk Sesi Berikutnya

```text
Lanjutkan Racely di repo llianified/racely, branch main. Baca docs/HANDOFF.md
dan docs/RUNBOOK.md lebih dulu. Checklist A–F sesi sebelumnya sudah selesai:
test suite hijau, typecheck/frozen-lockfile/build standalone lulus, UI
terverifikasi, deployment diaudit, dan seluruh temuan audit (rate limit,
security headers, health DB, katalog satu sumber) sudah ditindaklanjuti.

Yang tersisa ada di bagian "Sisa Pekerjaan": semuanya butuh DATABASE_URL atau
akses EC2 — migrasi database, validasi skema, deploy pertama, set webhook, uji
di WebView Telegram asli, dan proses operasional antrean withdrawal.

Batasan keras: withdrawal tetap antrean manual berstatus pending; produksi
wajib auth Telegram initData; preview hanya aktif saat RACELY_ENABLE_PREVIEW=true
DAN NODE_ENV bukan production; jangan pernah menulis atau mencetak credential,
connection string, atau bot token. Cek env yang benar-benar tersedia sebelum
meminta variabel apa pun.
```
