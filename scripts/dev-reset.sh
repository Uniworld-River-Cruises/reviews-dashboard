#!/usr/bin/env bash
# Reset the local Firebase emulator stack (functions + firestore).
# Replaces the hand-typed kill/restart/wait ritual. Git-Bash-on-Windows aware.
# Usage: bash scripts/dev-reset.sh [--seed] [--no-build] | --stop
#   --seed       apply scripts/seed-emulator.js after the emulators are ready
#   --no-build   skip rebuilding shared/ and functions/ before starting
#   --stop       stop the emulators and exit
# Env overrides: NODE_DIR (node 20 dir), EMULATORS (--only list), WAIT_SECS,
#   FUNCTIONS_DISCOVERY_TIMEOUT (seconds)
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

SEED=0
BUILD=1
STOP=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --no-build) BUILD=0 ;;
    --stop) STOP=1 ;;
    *) echo "unknown option: $arg"; exit 1 ;;
  esac
done

NODE_DIR="${NODE_DIR:-/c/Users/matt.urbano/AppData/Local/nvm/v20.20.0}"
EMULATORS="${EMULATORS:-functions,firestore}"
WAIT_SECS="${WAIT_SECS:-180}"
LOG="emulator.log"
PIDFILE=".tools/emulator.pid"

# Stop the previous emulator CLI (it holds the ports) and any emulator JVMs.
stop_emulators() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  taskkill.exe //F //IM java.exe >/dev/null 2>&1 || true
  sleep 2
}

if [ "$STOP" = "1" ]; then
  stop_emulators
  echo "emulators stopped"
  exit 0
fi

# Node 20 first on PATH: the machine default is v14, and the functions
# emulator spawns `node` from PATH.
export PATH="$NODE_DIR:$PATH"

# Repo-local JRE 21 (firebase-tools >= 15 needs Java 21). It may be unpacked
# directly in .tools/jre or one level down (e.g. .tools/jre/jdk-21.0.11+10-jre).
JAVA_HOME=""
for candidate in "$ROOT/.tools/jre" "$ROOT"/.tools/jre/*/; do
  candidate="${candidate%/}"
  if [ -x "$candidate/bin/java" ] || [ -x "$candidate/bin/java.exe" ]; then
    JAVA_HOME="$candidate"
    break
  fi
done
if [ -z "$JAVA_HOME" ]; then
  echo "FAIL: no Java 21 runtime found under .tools/jre (expected .tools/jre[/<jdk-dir>]/bin/java)."
  exit 1
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

# The session TEMP path can exceed the AF_UNIX socket path limit and crash the
# Firestore emulator, so point the JVM's socket/temp dirs at a short path.
mkdir -p .tools/t
JAVA_TMP="$(cygpath -w "$ROOT/.tools/t")"
export JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=$JAVA_TMP -Djava.io.tmpdir=$JAVA_TMP"

# First functions load can exceed the 10s default while AV scans node_modules.
export FUNCTIONS_DISCOVERY_TIMEOUT="${FUNCTIONS_DISCOVERY_TIMEOUT:-180}"

# firebase-tools is installed repo-locally in .tools (not at the repo root).
FIREBASE_JS="$ROOT/.tools/node_modules/firebase-tools/lib/bin/firebase.js"
if [ ! -f "$FIREBASE_JS" ]; then
  echo "FAIL: firebase-tools not found at .tools/node_modules. Run: npm install --prefix .tools"
  exit 1
fi

echo "node: $(node --version)  java: $(java -version 2>&1 | grep -i " version" | head -1)"

if [ "$BUILD" = "1" ]; then
  echo "building shared/ and functions/"
  (cd shared && npm run build >/dev/null) || { echo "FAIL: shared build failed"; exit 1; }
  node scripts/copy-shared.js >/dev/null || { echo "FAIL: copy-shared failed"; exit 1; }
  (cd functions && npm run build >/dev/null) || { echo "FAIL: functions build failed"; exit 1; }
fi

stop_emulators
rm -f "$LOG"

echo "starting emulators (--only $EMULATORS) -> $LOG"
node "$FIREBASE_JS" emulators:start --only "$EMULATORS" >"$LOG" 2>&1 &
EMU_PID=$!
echo "$EMU_PID" >"$PIDFILE"

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
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator.js >/dev/null \
    || { echo "FAIL: seed script failed"; exit 1; }
fi

echo "OK. Logs: tail -f $LOG   Smoke: bash scripts/smoke-api.sh   Stop: bash scripts/dev-reset.sh --stop"
