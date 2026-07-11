#!/usr/bin/env bash
# Ensure only PM2 hosts tokfai-api on 127.0.0.1:8788.
# Safe to re-run. Does not touch Nginx or git.
set -euo pipefail

APP_NAME="${PM2_APP_NAME:-tokfai-api}"
LEGACY_APP_NAME="${PM2_LEGACY_APP_NAME:-dmit-api}"
PORT="${TOKFAI_API_PORT:-8788}"
HOST="${TOKFAI_API_HOST:-127.0.0.1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DMIT_DIR="${DMIT_DIR:-$ROOT/apps/dmit-api}"

if [[ ! -d "$DMIT_DIR" ]]; then
  echo "error: dmit-api dir not found: $DMIT_DIR" >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "error: pm2 not found in PATH" >&2
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "error: lsof is required to detect port owners" >&2
  exit 1
fi

echo "==> Ensuring no bare node owns ${HOST}:${PORT}"

# Kill non-PM2 listeners on the production API port (common EADDRINUSE cause).
while IFS= read -r pid; do {
  [[ -z "$pid" ]] && continue
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  # Skip if this PID is already under a PM2-managed tokfai-api / dmit-api process.
  if pm2 pid "$APP_NAME" 2>/dev/null | grep -qx "$pid"; then
    echo "    keep pm2 ${APP_NAME} pid=$pid"
    continue
  fi
  if pm2 pid "$LEGACY_APP_NAME" 2>/dev/null | grep -qx "$pid"; then
    echo "    keep pm2 ${LEGACY_APP_NAME} pid=$pid (will migrate)"
    continue
  fi
  if [[ "$cmd" == *"$DMIT_DIR"* ]] || [[ "$cmd" == *"dist/index.js"* ]] || [[ "$cmd" == *"node"* ]]; then
    echo "    killing rogue listener pid=$pid cmd=$cmd"
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "    warn: unexpected listener pid=$pid cmd=$cmd (not killed)" >&2
  fi
}; done < <(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)

# Migrate legacy process name if present.
if pm2 describe "$LEGACY_APP_NAME" >/dev/null 2>&1; then
  echo "==> Removing legacy PM2 app ${LEGACY_APP_NAME}"
  pm2 delete "$LEGACY_APP_NAME" || true
fi

echo "==> Starting/reloading ${APP_NAME} via PM2 (PORT=${PORT})"
cd "$DMIT_DIR"

if [[ ! -f dist/index.js ]]; then
  echo "error: missing dist/index.js — run npm run build in $DMIT_DIR first" >&2
  exit 1
fi

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save

echo "==> Status"
pm2 show "$APP_NAME" | sed -n '1,40p'

echo "==> Local smoke (127.0.0.1:${PORT})"
for path in /health /v1/models /v1/billing/plans; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://${HOST}:${PORT}${path}" || echo fail)"
  echo "    ${path} → ${code}"
done

echo "done. Nginx should proxy api.tokfai.com → http://${HOST}:${PORT}"
