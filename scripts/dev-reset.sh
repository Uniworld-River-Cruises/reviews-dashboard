#!/usr/bin/env bash
# Reset the local Firebase emulator stack (functions + firestore).
# Replaces the hand-typed kill/restart/wait ritual. Git-Bash-on-Windows aware.
# Usage: bash scripts/dev-reset.sh [--seed]
#   --seed   apply scripts/seed-emulator.js after the emulators are ready
# Env overrides: NODE_DIR (node 20 dir), EMULATORS (--only list), WAIT_SECS
set -u
cd "$(dirname "$0")/.."

SEED=0
[ "${1:-}" = "--seed" ] && SEED=1

NODE_DIR="${NODE_DIR:-/c/Users/matt.urbano/AppData/Local/nvm/v20.20.0}"
EMULATORS="${EMULATORS:-functions,firestore}"
WAIT_SECS="${WAIT_SECS:-180}"
LOG="emulator.log"

# Node 20 required (machine default is 14); repo-local JRE for the emulators.
export PATH="$NODE_DIR:$PATH"
export JAVA_HOME="$(pwd)/.tools/jre"
export PATH="$JAVA_HOME/bin:$PATH"

echo "node: $(node --version)  java: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# Kill any previous emulator JVMs (ignore 'not found').
taskkill.exe //F //IM java.exe >/dev/null 2>&1 || true
sleep 2
rm -f "$LOG"

echo "starting emulators (--only $EMULATORS) -> $LOG"
npx firebase emulators:start --only "$EMULATORS" >"$LOG" 2>&1 &
EMU_PID=$!

elapsed=0
until grep -q "All emulators ready" "$LOG" 2>/dev/null; do
  if ! kill -0 "$EMU_PID" 2>/dev/null; then
    echo "FAIL: emulator process exited early. Last log lines:"
    tail -20 "$LOG"
    exit 1
  fi
  if [ "$elapsed" -ge "$WAIT_SECS" ]; then
    echo "FAIL: emulators not ready after ${WAIT_SECS}s. Last log lines:"
    tail -20 "$LOG"
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
echo "emulators ready (${elapsed}s)"

if [ "$SEED" = "1" ]; then
  echo "seeding: scripts/seed-emulator.js"
  node scripts/seed-emulator.js || { echo "FAIL: seed script failed"; exit 1; }
fi

echo "OK. Logs: tail -f $LOG   Smoke: bash scripts/smoke-api.sh"
