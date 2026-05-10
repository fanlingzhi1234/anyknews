#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-app}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-main}"
REMOTE_NAME="${REMOTE_NAME:-origin}"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git fetch "$REMOTE_NAME" --tags
git checkout "$PRODUCTION_BRANCH"
git pull --ff-only "$REMOTE_NAME" "$PRODUCTION_BRANCH"

PRODUCTION_BRANCH="$PRODUCTION_BRANCH" REMOTE_NAME="$REMOTE_NAME" scripts/guard-production-release.sh

docker compose config >/dev/null
docker compose up -d --build "$SERVICE_NAME"

for attempt in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    health_ok=true
    break
  fi
  sleep 2
done

if [[ "${health_ok:-false}" != "true" ]]; then
  docker compose ps
  fail_log="$(docker compose logs --tail 80 "$SERVICE_NAME" 2>/dev/null || true)"
  printf '%s\n' "$fail_log" >&2
  printf 'Production deploy failed: health check did not pass: %s\n' "$HEALTH_URL" >&2
  exit 1
fi

printf 'Production deploy complete: branch=%s commit=%s service=%s health=%s\n' \
  "$PRODUCTION_BRANCH" \
  "$(git rev-parse --short HEAD)" \
  "$SERVICE_NAME" \
  "$HEALTH_URL"
