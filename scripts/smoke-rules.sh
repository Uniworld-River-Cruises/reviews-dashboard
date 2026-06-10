#!/usr/bin/env bash
# Verify firestore.rules enforcement against the local emulators.
# Prereqs: emulators running with firestore + auth (+ functions), seeded via
# scripts/seed-emulator.js. The functions/API smoke (smoke-api.sh) separately
# proves the Admin SDK path is unaffected by these rules.
# Usage: bash scripts/smoke-rules.sh
set -u

FIRESTORE="${FIRESTORE:-http://127.0.0.1:8080}"
AUTH_EMU="${AUTH_EMU:-http://127.0.0.1:9099}"
PROJECT="${PROJECT:-feefo-reviews}"
NODE="${NODE:-node}"
DOCS="$FIRESTORE/v1/projects/$PROJECT/databases/(default)/documents"
PASS=0
FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1)); echo "PASS  $1"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $1  (expected: $2, got: $3)"
  fi
}

status() { # status <url> [extra curl args...]
  local url="$1"; shift
  curl -s -o /dev/null -w "%{http_code}" "$@" "$url"
}

# ── Unauthenticated reads must be denied on every dashboard collection ──────
check "unauth read reviews -> 403"            "403" "$(status "$DOCS/reviews/aaaaaaaaaaaaaaaaaaaaaa01")"
check "unauth read summaries -> 403"          "403" "$(status "$DOCS/summaries/uniworld")"
check "unauth read monthly_summaries -> 403"  "403" "$(status "$DOCS/monthly_summaries/uniworld_2026-06")"
check "unauth read sync_meta -> 403"          "403" "$(status "$DOCS/sync_meta/uniworld")"
check "unauth read itinerary_mappings -> 403" "403" "$(status "$DOCS/itinerary_mappings/uniworld_enchanting-danube-8-days")"
check "unauth list reviews -> 403"            "403" "$(status "$DOCS/reviews")"

# ── A signed-in user (any account) can read dashboard collections ───────────
TOKEN=$(curl -s -X POST "$AUTH_EMU/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
  -H "Content-Type: application/json" -d '{"returnSecureToken":true}' \
  | "$NODE" -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).idToken||''))")
if [ -z "$TOKEN" ]; then
  echo "FAIL  could not mint a test user via the auth emulator ($AUTH_EMU)"
  exit 1
fi

check "authed read reviews -> 200"            "200" "$(status "$DOCS/reviews/aaaaaaaaaaaaaaaaaaaaaa01" -H "Authorization: Bearer $TOKEN")"
check "authed read summaries -> 200"          "200" "$(status "$DOCS/summaries/uniworld" -H "Authorization: Bearer $TOKEN")"
check "authed read monthly_summaries -> 200"  "200" "$(status "$DOCS/monthly_summaries/uniworld_2026-06" -H "Authorization: Bearer $TOKEN")"
check "authed read sync_meta -> 200"          "200" "$(status "$DOCS/sync_meta/uniworld" -H "Authorization: Bearer $TOKEN")"
check "authed read itinerary_mappings -> 200" "200" "$(status "$DOCS/itinerary_mappings/uniworld_enchanting-danube-8-days" -H "Authorization: Bearer $TOKEN")"

# ── Credential store stays sealed even for signed-in users ──────────────────
check "authed read api_clients -> 403"        "403" "$(status "$DOCS/api_clients/uw_live_local0test01" -H "Authorization: Bearer $TOKEN")"
check "authed read api_tokens (list) -> 403"  "403" "$(status "$DOCS/api_tokens" -H "Authorization: Bearer $TOKEN")"

# ── Client writes are always denied ─────────────────────────────────────────
check "authed write reviews -> 403"           "403" "$(status "$DOCS/reviews/aaaaaaaaaaaaaaaaaaaaaa01" -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"fields":{"verified":{"booleanValue":false}}}')"

echo
echo "RESULT: $PASS passed, $FAIL failed"
exit $FAIL
