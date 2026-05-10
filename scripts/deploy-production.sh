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
curl -fsS "$HEALTH_URL" >/dev/null

printf 'Production deploy complete: branch=%s commit=%s service=%s health=%s\n' \
  "$PRODUCTION_BRANCH" \
  "$(git rev-parse --short HEAD)" \
  "$SERVICE_NAME" \
  "$HEALTH_URL"
