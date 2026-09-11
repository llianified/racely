# Racely — Tutorial Manual (dari nol sampai live)

Semua pekerjaan kode sudah selesai. Dokumen ini adalah **yang harus kamu
kerjakan sendiri**, karena butuh akun pihak ketiga (Telegram, Neon, AWS) yang
tidak bisa diakses dari sandbox v0.

Urutannya wajib: **1 → 2 → 3 → 4 → 5 → 6 → 7**. Langkah 8 adalah proses harian.

Estimasi: sekali jalan sekitar satu sore, paling lama di langkah 3 (server).

> Aturan yang berlaku di semua langkah: **jangan pernah menempel bot token,
> connection string, atau secret ke dalam repo, chat, screenshot, atau commit
> message.** Semua nilai asli hanya hidup di `/etc/racely/racely.env` di server.

---

## Langkah 1 — Buat bot Telegram

1. Buka Telegram, chat ke **@BotFather**.
2. Kirim `/newbot`, ikuti promptnya:
   - **Name**: nama tampilan bebas, misalnya `Racely`.
   - **Username**: harus unik dan diakhiri `bot`, misalnya `RacelyBot`.
3. BotFather membalas dengan **token** (format `123456789:AA...`).
   Simpan di password manager. Ini nilai `TELEGRAM_BOT_TOKEN`.
4. Catat juga username bot tanpa `@` — itu nilai `TELEGRAM_BOT_USERNAME`.

Belum perlu setting Mini App / menu button di BotFather. Script
`pnpm run bot:setup` di langkah 6 yang mendaftarkan webhook dan command.

**Selesai kalau:** kamu punya token dan username tersimpan aman.

---

## Langkah 2 — Siapkan database Neon

1. Masuk ke [console.neon.tech](https://console.neon.tech), buat project baru
   (region terdekat dengan EC2 kamu, misal `ap-southeast-1` Singapore).
2. Setelah project jadi, buka **Connection string** → pilih connection string
   yang **pooled** dan sertakan `?sslmode=require`.
3. Simpan sebagai `DATABASE_URL`.
4. Kalau kamu mengaktifkan **IP Allow** di Neon, tambahkan IP publik EC2 kamu
   (Elastic IP dari langkah 3). Kalau tidak, lewati.

Jangan jalankan SQL apa pun manual — migrasi dijalankan script di langkah 5.

**Selesai kalau:** kamu punya `DATABASE_URL` tersimpan aman.

---

## Langkah 3 — Siapkan EC2

### 3a. Luncurkan instance

- AMI: **Ubuntu 22.04 LTS** (atau Amazon Linux 2023).
- Tipe: `t3.small` sudah cukup untuk mulai.
- **Elastic IP**: alokasikan dan attach, supaya IP tidak berubah saat restart.
- Security group inbound:
  | Port | Sumber | Alasan |
  |---|---|---|
  | 22 | IP kamu saja | SSH |
  | 80 | `0.0.0.0/0` | HTTP, untuk penerbitan sertifikat |
  | 443 | `0.0.0.0/0` | HTTPS, Telegram memanggil webhook ke sini |

  **Port 3000 jangan dibuka ke publik.** Aplikasi hanya diakses lewat nginx.

### 3b. Pasang dependensi

SSH ke server, lalu:

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo corepack enable && corepack prepare pnpm@latest --activate
sudo npm install -g pm2
node -v && pnpm -v && pm2 -v
```

### 3c. Arahkan domain

Di penyedia DNS kamu, buat A record dari domain (misal `racely.example.com`)
ke Elastic IP EC2. Tunggu sampai `dig +short racely.example.com` mengembalikan
IP tersebut.

Telegram **mewajibkan HTTPS dengan sertifikat valid** untuk webhook. Domain
bukan opsional.

### 3d. Pasang nginx + TLS

```bash
sudo tee /etc/nginx/sites-available/racely >/dev/null <<'NGINX'
server {
    listen 80;
    server_name racely.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/racely /etc/nginx/sites-enabled/racely
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d racely.example.com
```

Ganti `racely.example.com` dengan domain kamu di semua tempat. Certbot otomatis
mengubah konfigurasi jadi HTTPS dan memasang auto-renew.

**Selesai kalau:** `https://racely.example.com` bisa dibuka (masih error 502,
itu normal — aplikasinya belum jalan).

---

## Langkah 4 — Ambil kode dan isi file env

```bash
sudo mkdir -p /srv && sudo chown $USER:$USER /srv
git clone https://github.com/llianified/racely.git /srv/racely
cd /srv/racely
pnpm install --frozen-lockfile
```

Buat file env **di luar repo**:

```bash
sudo mkdir -p /etc/racely
sudo install -m 600 -o $USER -g $USER /dev/null /etc/racely/racely.env
nano /etc/racely/racely.env
```

Isi mengikuti `.env.example`, dengan nilai asli:

```
DATABASE_URL=<connection string Neon dari langkah 2>
TELEGRAM_BOT_TOKEN=<token dari langkah 1>
TELEGRAM_BOT_USERNAME=<username bot tanpa @>
TELEGRAM_WEBHOOK_SECRET=<hasil: openssl rand -hex 32>
PUBLIC_APP_URL=https://racely.example.com
NODE_ENV=production
PORT=3000
```

Untuk `TELEGRAM_WEBHOOK_SECRET`, jalankan `openssl rand -hex 32` dan tempel
hasilnya. Nilai ini kamu karang sendiri, bukan dari Telegram.

`RACELY_ENABLE_PREVIEW` **jangan diisi** di produksi. `RACELY_ENV_FILE` dan
`RACELY_LOG_DIR` hanya diisi kalau kamu mau lokasi non-default.

Kunci permissionnya:

```bash
chmod 600 /etc/racely/racely.env
```

**Selesai kalau:** `ls -l /etc/racely/racely.env` menunjukkan `-rw-------`.

---

## Langkah 5 — Migrasi database dan build

```bash
cd /srv/racely
set -a && source /etc/racely/racely.env && set +a

pnpm run db:migrate
pnpm test          # sekarang 5 tes database ikut jalan, semua harus hijau
pnpm run build:standalone
```

`db:migrate` idempoten — aman diulang, tidak akan menduplikasi apa pun.

Verifikasi skema lewat SQL Editor di Neon:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'racely_%';
-- harus muncul: racely_players, racely_withdrawals, racely_telegram_updates

select conname from pg_constraint
where conname = 'racely_players_car_model_check';
-- harus mengembalikan satu baris
```

**Selesai kalau:** ketiga tabel ada, constraint ada, dan `pnpm test` hijau
tanpa skip.

---

## Langkah 6 — Jalankan aplikasi dan daftarkan webhook

```bash
cd /srv/racely
pnpm run pm2:start          # atau pm2:reload kalau sudah pernah jalan
pm2 save
pm2 startup                 # jalankan perintah yang ditampilkan, agar auto-start saat reboot

curl -fsS http://127.0.0.1:3000/api/health
```

Health harus `200` dengan `database: "ok"`. Kalau `503`, cek tabel
troubleshooting di `docs/RUNBOOK.md` sebelum lanjut.

Setelah health hijau, daftarkan webhook:

```bash
set -a && source /etc/racely/racely.env && set +a
pnpm run bot:setup
```

Script ini mendaftarkan webhook ke `PUBLIC_APP_URL`, memasang
`TELEGRAM_WEBHOOK_SECRET`, dan menyetel command bot. Repeatable — jalankan
ulang kapan pun tanpa efek samping.

**Selesai kalau:** `pm2 status` menunjukkan `racely` **online** dan
`bot:setup` melaporkan sukses.

---

## Langkah 7 — Uji di Telegram sungguhan

Uji dari **aplikasi Telegram di HP**, bukan dari browser. Preview development
tidak memakai `initData` asli, jadi tidak membuktikan apa pun soal auth.

1. Chat ke bot kamu, kirim `/start` → bot harus membalas.
2. Kirim `/play` → tombol Mini App muncul, ketuk untuk membuka.
3. Di dalam Mini App, lewati alurnya:
   - Onboarding muncul.
   - Pilih mobil, lanjut.
   - **Tutup Mini App, buka lagi** → mobil yang dipilih harus masih sama
     (ini membuktikan `car_model` tersimpan di database, bukan di browser).
   - Buka menu withdrawal, ajukan penarikan → statusnya harus **pending**.
     Tidak ada transfer otomatis. Ini memang perilaku yang benar.
4. Di server, pastikan tidak ada error:
   ```bash
   pm2 logs racely --lines 100
   ```
5. Pastikan withdrawal tadi tercatat:
   ```sql
   select id, status, created_at from racely_withdrawals order by created_at desc limit 5;
   ```

Kalau Mini App blank: cek `PUBLIC_APP_URL` persis sama dengan domain HTTPS-nya
(tanpa trailing slash), lalu `pnpm run bot:setup` ulang.

**Selesai kalau:** keempat poin di atas lolos. Racely resmi live.

---

## Langkah 8 — Proses harian: antrean withdrawal

Withdrawal **sengaja manual dan tidak akan pernah otomatis.** Kamu perlu
memutuskan dan menuliskan prosesnya, minimal empat hal:

1. **Siapa yang meninjau** — tunjuk satu orang penanggung jawab.
2. **Kapan** — misalnya sekali sehari jam 10 pagi.
3. **Bagaimana** — cek antrean:
   ```sql
   select id, telegram_user_id, amount, status, created_at
   from racely_withdrawals
   where status = 'pending'
   order by created_at asc;
   ```
   Transfer dilakukan di luar sistem, lalu tandai selesai.
4. **Bukti** — simpan referensi transfer per `id` withdrawal, di spreadsheet
   atau tiket. Tanpa jejak ini kamu tidak bisa membantah klaim "belum dibayar".

Tetapkan juga SLA yang kamu janjikan ke pemain (misal 1x24 jam kerja) dan
tampilkan di UI kalau perlu.

---

## Referensi cepat

| Kebutuhan | Dokumen |
|---|---|
| Deploy ulang, rotasi secret, rollback, troubleshooting | `docs/RUNBOOK.md` |
| Status proyek, keputusan arsitektur, sisa pekerjaan | `docs/HANDOFF.md` |
| Daftar environment variable | `.env.example` |

Perintah yang paling sering dipakai:

```bash
pm2 status                            # aplikasi hidup?
pm2 logs racely --lines 200           # kenapa error?
curl -fsS http://127.0.0.1:3000/api/health   # database nyambung?
```
