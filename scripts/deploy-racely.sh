#!/usr/bin/env bash
#
# Langkah deploy Racely di EC2, hidup di repo supaya ikut ter-review.
#
# Dipanggil oleh /usr/local/bin/deploy-racely, yang tugasnya tinggal menarik
# commit terbaru lalu `exec ./scripts/deploy-racely.sh`. Pembaruan source tetap
# di sana karena skrip ini tidak bisa memperbarui dirinya sendiri saat berjalan.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Secret hanya dibaca oleh proses Node lewat --env-file; tidak pernah masuk ke
# environment shell ini, jadi tidak bisa bocor ke log atau proses anak lain.
ENV_FILE="${RACELY_ENV_FILE:-/etc/racely/racely.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Env file tidak ditemukan: $ENV_FILE" >&2
  exit 1
fi

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building"
pnpm run build:standalone

# Migrasi berjalan setelah build (build yang gagal tidak menyentuh database) dan
# sebelum restart, supaya kode baru tidak pernah menyapa skema lama.
echo "==> Running database migrations"
node --env-file="$ENV_FILE" scripts/migrate.mjs

echo "==> Verifying schema"
node --env-file="$ENV_FILE" scripts/check-migrations.mjs

echo "==> Restarting Racely"
pm2 restart racely --update-env

echo "==> Deploy complete"
pm2 status
