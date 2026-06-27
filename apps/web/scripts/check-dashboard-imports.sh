#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"

PATTERN='customer-cherry|customer-cursor|customer-integration-snippets|customer-quick-start-snippets|customer-troubleshooting|@/lib/i18n/messages|@/lib/dmit-messages|@/lib/dmit-error-details'

MATCHES=$(rg -n "$PATTERN" \
  "$WEB/app/dashboard" \
  "$WEB/components/dashboard"* \
  "$WEB/lib/dashboard"* \
  2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "Banned dashboard imports found:"
  echo "$MATCHES"
  exit 1
fi

echo "Dashboard import check passed."
