#!/bin/bash
# Post-close market scan wrapper, intended for launchd/cron.
#
# Appends a timestamped report to logs/market-scan.log and raises a macOS
# notification when the crash threshold is breached (scan exits 2) or when the
# scan could not be trusted (exit 1).

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

LOG_DIR="$REPO_DIR/logs"
LOG_FILE="$LOG_DIR/market-scan.log"
mkdir -p "$LOG_DIR"

# launchd hands over a minimal PATH, so node from nvm/homebrew is often missing.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

notify() {
  # Best-effort: osascript only exists on macOS, and only works in a GUI session.
  osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null || true
}

{
  echo ""
  echo "########## $(date '+%Y-%m-%d %H:%M:%S %Z') ##########"
} >> "$LOG_FILE"

OUTPUT="$(npm run --silent scan 2>&1)"
STATUS=$?

echo "$OUTPUT" >> "$LOG_FILE"

case "$STATUS" in
  0) ;;  # No crash. Report is in the log; stay quiet.
  2)
    SUMMARY="$(echo "$OUTPUT" | grep -A1 'MARKET CRASH' | head -2 | tr '\n' ' ')"
    notify "Market crash signal" "${SUMMARY:-Crash threshold breached. See market-scan.log}"
    ;;
  *)
    notify "Market scan failed" "$(echo "$OUTPUT" | tail -1)"
    ;;
esac

exit "$STATUS"
