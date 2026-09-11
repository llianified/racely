# Racely — Runbook Operasional (AWS EC2 + PM2)

Target: Node.js standalone (`output: "standalone"`) dijalankan PM2 di EC2.
Bukan serverless. Semua secret hidup di luar repo.

## 0. Prasyarat instance

- Node.js 20+, `pnpm`, dan `pm2` terpasang global.
- File env di luar repo: `/etc/racely/racely.env`, `chmod 600`, owner user deploy.
  Isinya mengikuti `.env.example` (nilai asli, jangan pernah di-commit).
- Reverse proxy (nginx/ALB) terminasi TLS ke `PORT` aplikasi (default `3000`).
- Health check load balancer diarahkan ke `GET /api/health` (mengembalikan `503`
  saat database tidak terjangkau).

`ecosystem.config.cjs` otomatis memuat env lewat `node --env-file` bila
`RACELY_ENV_FILE` (default `/etc/racely/racely.env`) ada. Tidak ada secret yang
dibaca dari direktori repo.

## 1. Deploy / update

```bash
cd /srv/racely
git fetch origin && git checkout main && git pull --ff-only
pnpm install --frozen-lockfile
pnpm run typecheck && pnpm test
pnpm run db:migrate            # idempoten, aman diulang
pnpm run build:standalone      # next build + salin public/ dan .next/static
pnpm run pm2:reload            # zero-downtime reload, --update-env
pm2 save
curl -fsS http://127.0.0.1:3000/api/health
```

Catatan: `instances: 1` dan `exec_mode: "fork"` disengaja — dedupe webhook
fallback dan rate limiter bersifat per-proses. Jangan naikkan jumlah instance
sebelum keduanya dipindah ke Postgres/Redis.

## 2. Set / ganti webhook Telegram

```bash
set -a && source /etc/racely/racely.env && set +a
pnpm run bot:setup
```

Script ini repeatable: mendaftarkan ulang webhook ke `PUBLIC_APP_URL`, memasang
`TELEGRAM_WEBHOOK_SECRET`, dan menyetel command bot. Script tidak pernah
mencetak token (pesan error di-scrub).

## 3. Rotasi secret

1. Terbitkan nilai baru (BotFather untuk token, `openssl rand -hex 32` untuk
   `TELEGRAM_WEBHOOK_SECRET`, Neon dashboard untuk `DATABASE_URL`).
2. Edit `/etc/racely/racely.env` (tetap `chmod 600`).
3. `pnpm run pm2:reload` agar proses memuat env baru.
4. Untuk token/secret webhook, jalankan ulang `pnpm run bot:setup`.
5. Verifikasi: `curl -fsS http://127.0.0.1:3000/api/health` dan kirim `/start`
   ke bot.

Jangan pernah menaruh nilai asli di repo, log, atau commit message.

## 4. Rollback

```bash
cd /srv/racely
git log --oneline -10
git checkout <commit-sebelumnya>
pnpm install --frozen-lockfile
pnpm run build:standalone
pnpm run pm2:reload
```

Migrasi database bersifat additive dan idempoten, jadi rollback kode tidak
memerlukan rollback skema. Jika sebuah migrasi harus dibatalkan, tulis migrasi
maju baru — jangan mengedit file migrasi yang sudah dijalankan.

## 5. Observasi & troubleshooting

| Gejala | Cek |
|---|---|
| Health `503` `database: unreachable` | `DATABASE_URL`, IP allow list Neon, `pm2 logs racely --err` |
| Health `503` `database: unconfigured` | `DATABASE_URL` tidak termuat → cek `RACELY_ENV_FILE` |
| Webhook `503` | `PUBLIC_APP_URL` kosong/salah |
| Webhook `401` | `TELEGRAM_WEBHOOK_SECRET` tidak cocok, jalankan ulang `bot:setup` |
| Action `429` | Rate limiter per pemain; wajar saat spam, tidak wajar saat trafik normal |
| Update Telegram terproses ganda | Cek tabel `racely_telegram_updates` dan pastikan hanya satu instance berjalan |

Perintah harian: `pm2 status`, `pm2 logs racely --lines 200`,
`pm2 describe racely`.

## 6. Batasan yang tidak boleh diubah

- Withdrawal tetap antrean manual berstatus `pending`.
- Produksi wajib autentikasi Telegram `initData`.
- Preview hanya aktif jika `RACELY_ENABLE_PREVIEW=true` **dan**
  `NODE_ENV !== "production"`; PM2 memaksa `false` di produksi.
