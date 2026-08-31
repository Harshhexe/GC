#!/usr/bin/env bash
# Publish one OTA update to every channel that has an installed build.
#
# Two channels exist because the iOS sideload was made from the `preview`
# profile and the Android build from `production`. Publishing to one leaves the
# other device silently stale, which is exactly what happened for a whole day
# of work, so this always does both.
#
# Usage:  npm run update -- "what changed"
#         npm run update -- --message "what changed"
set -euo pipefail

# Accept either a bare message or an explicit --message flag.
if [ "${1:-}" = "--message" ]; then shift; fi
MSG="${*:-}"

if [ -z "$MSG" ]; then
  echo "A message is required:  npm run update -- \"what changed\"" >&2
  exit 1
fi

for CHANNEL in production preview; do
  echo "→ publishing to $CHANNEL"
  npx eas-cli update --channel "$CHANNEL" --message "$MSG" --non-interactive
done
