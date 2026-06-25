#!/usr/bin/env bash
set -euo pipefail
cd /opt/tokfai-api-saas/apps/dmit-api
set -a
source ./.env
set +a
exec node dist/index.js
