#!/usr/bin/env bash
set -Eeuo pipefail

release_id="${1:-}"
app_root="${RACELY_APP_ROOT:-/opt/racely}"
env_file="${RACELY_ENV_FILE:-/etc/racely/racely.env}"
release_dir="$app_root/releases/$release_id"
current_link="$app_root/current"
health_url="${RACELY_HEALTH_URL:-http://127.0.0.1:3000/api/health}"

if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Release id must be a full Git commit SHA." >&2
  exit 2
fi

if [[ ! -d "$release_dir" ]]; then
  echo "Release directory does not exist: $release_dir" >&2
  exit 2
fi

if [[ ! -r "$env_file" ]]; then
  echo "Production environment file is not readable: $env_file" >&2
  exit 2
fi

command -v node >/dev/null
corepack_path="$(command -v corepack)"
command -v curl >/dev/null
command -v flock >/dev/null

mkdir -p "$app_root/releases"
exec 9>"$app_root/deploy.lock"
flock -n 9 || {
  echo "Another Racely deployment is already running." >&2
  exit 1
}

previous_release=""
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link")"
fi

cd "$release_dir"

corepack pnpm install --frozen-lockfile
node --env-file="$env_file" scripts/migrate.mjs

public_app_url="$(node --env-file="$env_file" -e 'process.stdout.write(process.env.PUBLIC_APP_URL ?? "")')"
if [[ -z "$public_app_url" ]]; then
  echo "PUBLIC_APP_URL is required in $env_file." >&2
  exit 2
fi

NEXT_TELEMETRY_DISABLED=1 node --env-file="$env_file" "$corepack_path" pnpm run build:standalone

next_link="$app_root/.current-$release_id"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$current_link"

start_release() {
  local target="$1"
  (
    cd "$target"
    RACELY_ENV_FILE="$env_file" node --env-file="$env_file" "$corepack_path" \
      pnpm exec pm2 startOrReload ecosystem.config.cjs --update-env
  )
}

rollback() {
  echo "Health check failed; rolling back the application process." >&2
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    local rollback_link="$app_root/.rollback-$release_id"
    ln -s "$previous_release" "$rollback_link"
    mv -Tf "$rollback_link" "$current_link"
    start_release "$previous_release"
  else
    (cd "$release_dir" && corepack pnpm exec pm2 delete racely) || true
    rm -f "$current_link"
  fi
}

start_release "$release_dir"

healthy=false
for _ in {1..20}; do
  if curl --fail --silent --show-error --max-time 5 "$health_url" >/dev/null; then
    healthy=true
    break
  fi
  sleep 3
done

if [[ "$healthy" != "true" ]]; then
  rollback
  exit 1
fi

node --env-file="$env_file" scripts/setup-telegram-bot.mjs

mapfile -t stale_releases < <(
  find "$app_root/releases" -mindepth 1 -maxdepth 1 -type d -name '[0-9a-f]*' \
    -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2-
)
for stale_release in "${stale_releases[@]}"; do
  if [[ "$stale_release" != "$release_dir" && "$stale_release" != "$previous_release" ]]; then
    rm -rf -- "$stale_release"
  fi
done

corepack pnpm exec pm2 save
printf 'Deployed Racely release %s\n' "$release_id"
