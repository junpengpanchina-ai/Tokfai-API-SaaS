#!/usr/bin/env bash
# DEPRECATED for production. Use PM2 via deploy/runtime/ensure-pm2-only.sh.
# Bare node on a fixed port caused EADDRINUSE fights with PM2 (tokfai-api).
set -euo pipefail

echo "error: run-prod.sh must not be used on production." >&2
echo "Use: bash deploy/runtime/ensure-pm2-only.sh" >&2
echo "Or:  cd apps/dmit-api && npm run start:pm2" >&2
exit 1
