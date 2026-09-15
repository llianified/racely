#!/usr/bin/env bash
#
# Langkah deploy Racely di EC2, hidup di repo supaya ikut ter-review.
#
# Dipanggil oleh /usr/local/bin/deploy-racely, yang tugasnya tinggal menarik
# commit terbaru lalu `exec ./scripts/deploy-racely.sh`.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Production secrets tetap berada di file server dan hanya dibaca oleh
# proses yang memang membutuhkan env tersebut.
ENV_FILE="${RACELY_ENV_FILE:-/etc/racely/racely.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Env file tidak ditemukan: $ENV_FILE" >&2
  exit 1
fi

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Running database migrations"
node --env-file="$ENV_FILE" scripts/migrate.mjs

echo "==> Verifying schema"
node --env-file="$ENV_FILE" scripts/check-migrations.mjs

echo "==> Building"
pnpm run build:standalone

echo "==> Restarting Racely"
pm2 restart racely --update-env

echo "==> Deploy complete"
pm2 status
