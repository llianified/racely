<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Racely — aturan untuk agent

File ini hanya berisi **aturan keras** dan **rute tugas**. Penjelasan
arsitektur dan alasan di balik aturan ada di `README.md`; aturan khusus area
ada di `AGENTS.md` terdekat. Jangan menyalin isi README ke sini.

## Prinsip utama

Kerjakan hanya yang diminta. Pertahankan arsitektur dan hierarki visual yang
ada. Jangan refactor kode yang tidak terkait.

- Ubah hanya file yang memang dibutuhkan oleh fitur yang diminta.
- Jangan refactor, rename, memindahkan, mendesain ulang, atau "merapikan" kode
  di luar cakupan tugas.
- Jangan mengubah hierarki visual yang ada kecuali diminta secara eksplisit.
- Jangan menambah dependensi baru kecuali benar-benar diperlukan.
- Kalau pola yang ada bisa dipakai untuk fitur itu, pakai ulang polanya.

## Baca dulu sebelum menyentuh area ini

| Area | Baca |
|---|---|
| `components/game/scene/` | `components/game/scene/AGENTS.md` |
| `lib/db/`, `migrations/` | `lib/db/AGENTS.md` |
| `app/admin/`, `app/api/admin/`, `lib/admin-*.ts` | `app/admin/AGENTS.md` |
| Commit dan histori Git | `CLAUDE.md` |

## Aturan keras

- Produksi **wajib** autentikasi Telegram `initData` (HMAC + cek kedaluwarsa).
- **Withdrawal tetap antrean manual berstatus `pending`.** Jangan pernah
  menambahkan eksekusi pembayaran otomatis; panel admin hanya mencatat
  keputusan operator.
- Mode preview hanya untuk development: `RACELY_ENABLE_PREVIEW=true` **dan**
  `NODE_ENV !== "production"`.
- Migrasi additive dan idempoten. Jangan mengedit migrasi yang sudah
  dijalankan — satu-satunya pengecualian adalah daftar id mobil di `0001`,
  lihat `lib/db/AGENTS.md`.
- PM2 tetap `instances: 1`, `exec_mode: "fork"`. Rate limiter, dedupe webhook,
  dan penyapu notifikasi idle bersifat per-proses.
- Endpoint API wajib: autentikasi (`lib/telegram-auth.ts`), `consumeRateLimit`,
  dan `readJsonBody` — bukan `request.json()`. Tiru
  `app/api/game/action/route.ts`.
- Setiap route `app/api/admin/` wajib `guardAdmin()`; status penarikan `paid`
  dan `rejected` bersifat final.
- Jangan pernah menulis token, connection string, atau secret ke repo, log,
  atau commit message.
- `vercel.json` jangan dihapus — `"deploymentEnabled": false` menahan Vercel
  membuat deployment otomatis; repo ini dideploy ke EC2.

## Rute tugas

Kalau menyentuh X, jangan lupa Y dan Z. Daftar di bawah ditulis manual dan
tidak saling diturunkan.

**Aksi pemain baru** — tambah di ketiganya, lalu test di `tests/`:

1. `lib/game.ts` → union `GameCommand`
2. `lib/game-server.ts` → `commandSchema` **dan** cabang di `performGameAction`
3. `lib/preview-game.ts` → cabang di `performPreviewGameAction`

Melewatkan (3) tidak memunculkan error — aksinya cuma diam-diam mati saat
`pnpm dev`. `app/api/game/action/route.ts` tidak perlu diubah.

**Mobil baru**:

1. `lib/car-catalog.ts` → `CAR_MODEL_IDS` + `CAR_CATALOG`
2. `components/game/scene/mini-car.tsx` → geometri
3. `migrations/000N_*.sql` → migrasi baru yang membuat ulang
   `racely_players_car_model_check`
4. `migrations/0001_racely_core.sql` → kedua daftar `car_model IN (...)`

**Ekonomi, reward, biaya upgrade** — angkanya hidup di database dan disetel
lewat `/admin`, bukan di kode. Yang diubah di kode hanya rumus atau knob baru:

1. `lib/economy-config.ts` → `EconomyConfig`, `DEFAULT_ECONOMY`,
   `economyConfigSchema`
2. `app/admin/admin-economy.tsx` → daftarkan di `GROUPS`
3. Pemakai membaca dari `game.economy.*` — jangan impor angka sebagai konstanta
   modul.

Rumus tetap di `lib/economy-config.ts` dan `lib/game-economy.ts` (murni, tanpa
I/O). Jangan menaruh aturan ekonomi di `lib/game-server.ts`.

**Kolom atau tabel baru** — `migrations/000N_*.sql` **dan** `lib/db/schema.ts`,
lalu `pnpm run db:migrate`.

**Komponen baru** — `components/game/shell/` kerangka · `scene/`
react-three-fiber (wajib di sini) · `race/` panel balapan · `panels/` tab
non-3D · `car/` pemilihan mobil.

## UI

- Pakai token yang sudah ada di `:root` (`app/globals.css`) lewat utility
  bersumber token (`px-xl`, `gap-md`, `text-read`), bukan angka literal
  (`px-6`, `text-[14px]`). Kalau rung-nya belum ada, tambahkan di `:root`
  dulu — dan jangan pakai awalan `--leading-*`/`--tracking-*` (namespace
  Tailwind). Detail tangga token ada di README → "Token desain".
- Jangan menambah library UI baru atau mendesain ulang layar yang tidak
  diminta.

## Sebelum selesai

```bash
pnpm run typecheck && pnpm run lint && pnpm test
PUBLIC_APP_URL=https://racely.fun pnpm run build
```

Tanpa `DATABASE_URL`, `tests/database.test.ts` ter-skip secara lokal — itu
normal.

## Jebakan

- Blok `nextjs-agent-rules` di atas ditulis ulang oleh `next dev`; hanya isi
  di antara marker yang diganti. Jangan memindahkan teks lain ke dalam blok.
- `.env.development` memang di-commit — isinya hanya flag preview non-rahasia.
