#!/usr/bin/env bash
# Smoke-test the public reviews API against the local Firebase emulators.
# Prereqs: emulators running (functions + firestore), scripts/seed-emulator.js applied.
# Usage: bash scripts/smoke-api.sh
set -u

BASE="${BASE:-http://127.0.0.1:5001/feefo-reviews/us-central1/reviewsApi}"
NODE="${NODE:-node}"
PASS=0
FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then
    PASS=$((PASS+1)); echo "PASS  $1"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $1  (expected: $2, got: $3)"
  fi
}

json() { # json <file> <node-expression over `b`>
  "$NODE" -e "const b=JSON.parse(require('fs').readFileSync('$1','utf8'));console.log($2)" 2>/dev/null || echo "PARSE_ERROR"
}

# Repo-relative scratch dir: git-bash's /tmp is invisible to Windows node.exe.
T=".tools/smoke"
rm -rf "$T" && mkdir -p "$T"

# ── Token endpoint ──────────────────────────────────────────────────────────
code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
  -d '{"client_id":"uw_live_local0test01","client_secret":"local-test-secret-not-for-production-1234","grant_type":"password"}')
check "token: wrong grant_type -> 400" "400:unsupported_grant_type" "$code:$(json "$T/r" 'b.error.code')"

code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
  -d '{"client_id":"uw_live_local0test01","client_secret":"WRONG","grant_type":"client_credentials"}')
check "token: bad secret -> 401 invalid_client" "401:invalid_client" "$code:$(json "$T/r" 'b.error.code')"

code=$(curl -s -o "$T/tok" -w "%{http_code}" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
  -d '{"client_id":"uw_live_local0test01","client_secret":"local-test-secret-not-for-production-1234","grant_type":"client_credentials"}')
check "token: valid -> 200 Bearer 3600" "200:Bearer:3600" "$code:$(json "$T/tok" 'b.token_type')":"$(json "$T/tok" 'b.expires_in')"
TOKEN=$(json "$T/tok" 'b.access_token')

code=$(curl -s -o "$T/r" -w "%{http_code}" "$BASE/v1/oauth/token")
check "token: GET -> 405" "405" "$code"

# ── Auth required ───────────────────────────────────────────────────────────
code=$(curl -s -o "$T/r" -w "%{http_code}" "$BASE/v1/reviews/all")
check "reviews/all: no token -> 401" "401" "$code"

code=$(curl -s -o "$T/r" -w "%{http_code}" -H "Authorization: Bearer uwt_bogus" "$BASE/v1/reviews/all")
check "reviews/all: bogus token -> 401 invalid_token" "401:invalid_token" "$code:$(json "$T/r" 'b.error.code')"

AUTH=(-H "Authorization: Bearer $TOKEN")

# ── List reviews ────────────────────────────────────────────────────────────
code=$(curl -s -o "$T/all" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all")
check "reviews/all: 200, count=5 across merchants" "200:5:5" "$code:$(json "$T/all" 'b.summary.meta.count')":"$(json "$T/all" 'b.reviews.length')"
check "reviews/all: newest-first order" "true" "$(json "$T/all" 'String(b.reviews[0].last_updated_date >= b.reviews[4].last_updated_date)')"
check "reviews/all: no PII in payload" "0" "$(grep -c -E 'SEED_PII|seed-pii@' "$T/all")"
check "reviews/all: enrichment block present" "Staff" "$(json "$T/all" 'b.reviews.map(r=>r.enrichment.themes.positive).flat().includes("Staff")?"Staff":"missing"')"
check "reviews/all: display-name rule (fallback present)" "true" "$(json "$T/all" 'String(b.reviews.some(r=>r.customer.display_name==="Trusted Customer"))')"
check "reviews/all: itinerary group resolved" "Enchanting Danube" "$(json "$T/all" 'b.reviews.find(r=>r.enrichment.itinerary.raw==="Enchanting Danube (8 Days)").enrichment.itinerary.group')"

code=$(curl -s -o "$T/uw" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld")
check "reviews/all: uniworld only -> 3" "200:3" "$code:$(json "$T/uw" 'b.summary.meta.count')"
check "reviews/all: uniworld merchant field" "uniworld" "$(json "$T/uw" '[...new Set(b.reviews.map(r=>r.merchant.identifier))].join()')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?has_media=true")
check "reviews/all: has_media=true -> 2" "200:2" "$code:$(json "$T/r" 'b.summary.meta.count')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?positive_theme=Staff")
check "reviews/all: positive_theme=Staff -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?rating=5")
check "reviews/all: rating=5 post-filter, count null, 2 results" "200:null:2" "$code:$(json "$T/r" 'String(b.summary.meta.count)')":"$(json "$T/r" 'b.reviews.length')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?ship=S.S.%20Beatrice&region=Alps")
check "reviews/all: two attribute filters -> 400" "400:filters_not_combinable" "$code:$(json "$T/r" 'b.error.code')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?search=danube")
check "reviews/all: search -> 400 search_not_supported" "400:search_not_supported" "$code:$(json "$T/r" 'b.error.code')"

# ── Cursor pagination ───────────────────────────────────────────────────────
curl -s -o "$T/p1" "${AUTH[@]}" "$BASE/v1/reviews/all?page_size=2" >/dev/null
CUR=$(json "$T/p1" 'b.summary.next_cursor')
check "pagination: page 1 of 2 has next_cursor" "true" "$(json "$T/p1" 'String(typeof b.summary.next_cursor==="string" && b.reviews.length===2)')"
curl -s -o "$T/p2" "${AUTH[@]}" "$BASE/v1/reviews/all?page_size=2&cursor=$CUR" >/dev/null
check "pagination: page 2 returns 2 more, no overlap" "2:0" "$(json "$T/p2" 'b.reviews.length')":"$("$NODE" -e "
const a=JSON.parse(require('fs').readFileSync('$T/p1','utf8')).reviews.map(r=>r.id);
const b=JSON.parse(require('fs').readFileSync('$T/p2','utf8')).reviews.map(r=>r.id);
console.log(b.filter(id=>a.includes(id)).length)")"
CUR2=$(json "$T/p2" 'b.summary.next_cursor')
curl -s -o "$T/p3" "${AUTH[@]}" "$BASE/v1/reviews/all?page_size=2&cursor=$CUR2" >/dev/null
check "pagination: final page has 1, no next_cursor" "1:null" "$(json "$T/p3" 'b.reviews.length')":"$(json "$T/p3" 'String(b.summary.next_cursor)')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?cursor=garbage")
check "pagination: garbage cursor -> 400 invalid_cursor" "400:invalid_cursor" "$code:$(json "$T/r" 'b.error.code')"

# page mode
curl -s -o "$T/pg2" "${AUTH[@]}" "$BASE/v1/reviews/all?page=2&page_size=2" >/dev/null
check "pagination: page=2 window matches cursor page 2" "true" "$("$NODE" -e "
const a=JSON.parse(require('fs').readFileSync('$T/p2','utf8')).reviews.map(r=>r.id);
const b=JSON.parse(require('fs').readFileSync('$T/pg2','utf8')).reviews.map(r=>r.id);
console.log(String(JSON.stringify(a)===JSON.stringify(b)))")"

# ── Single review ───────────────────────────────────────────────────────────
RID=$(json "$T/uw" 'b.reviews[0].id')
code=$(curl -s -o "$T/one" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/$RID")
check "reviews/{id}: 200 + same id" "200:$RID" "$code:$(json "$T/one" 'b.id')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/ffffffffffffffffffffffff")
check "reviews/{id}: unknown -> 404" "404:review_not_found" "$code:$(json "$T/r" 'b.error.code')"

# ── Merchant scope enforcement (luxury-gold-only client) ────────────────────
curl -s -o "$T/lgtok" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
  -d '{"client_id":"uw_live_lgonly00001","client_secret":"lg-only-secret","grant_type":"client_credentials"}' >/dev/null
LGTOKEN=$(json "$T/lgtok" 'b.access_token')
LGAUTH=(-H "Authorization: Bearer $LGTOKEN")

code=$(curl -s -o "$T/r" -w "%{http_code}" "${LGAUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld")
check "scope: LG client requesting uniworld -> 403" "403:merchant_not_allowed" "$code:$(json "$T/r" 'b.error.code')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${LGAUTH[@]}" "$BASE/v1/reviews/all")
check "scope: LG client default 'all' -> only LG (2)" "200:2:luxury-gold" "$code:$(json "$T/r" 'b.summary.meta.count')":"$(json "$T/r" '[...new Set(b.reviews.map(r=>r.merchant.identifier))].join()')"

code=$(curl -s -o "$T/r" -w "%{http_code}" "${LGAUTH[@]}" "$BASE/v1/reviews/$RID")
check "scope: LG client fetching uniworld review id -> uniform 404" "404:review_not_found" "$code:$(json "$T/r" 'b.error.code')"

# ── Summary ────────────────────────────────────────────────────────────────
code=$(curl -s -o "$T/sum" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld")
check "summary: uniworld fleet 200" "200:uniworld:3" "$code:$(json "$T/sum" 'b.merchant.identifier')":"$(json "$T/sum" 'b.meta.count')"
check "summary: service distribution is null (product-only caveat)" "null" "$(json "$T/sum" 'String(b.rating.service)')"
code=$(curl -s -o "$T/suma" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all")
check "summary: all -> merged across merchants" "200:all:5" "$code:$(json "$T/suma" 'b.merchant.identifier')":"$(json "$T/suma" 'b.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=ship&scope_value=S.S.%20Beatrice")
check "summary: ship scope 200" "200:ship" "$code:$(json "$T/r" 'b.enrichment.scope')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=ship")
check "summary: ship scope without scope_value -> 400" "400" "$code"

# ── Meta ────────────────────────────────────────────────────────────────────
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/meta/themes")
check "meta/themes: 200 with 10+10" "200:10:10" "$code:$(json "$T/r" 'b.themes.positive.length')":"$(json "$T/r" 'b.themes.negative.length')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${LGAUTH[@]}" "$BASE/v1/meta/merchants")
check "meta/merchants: scoped to credential" "200:luxury-gold" "$code:$(json "$T/r" 'b.merchants.map(m=>m.merchant_identifier).join()')"

# ── Misc behaviour ─────────────────────────────────────────────────────────
code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "${AUTH[@]}" "$BASE/v1/reviews/all")
check "method: POST reviews/all -> 405" "405" "$code"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/nope")
check "router: unknown path -> 404" "404:not_found" "$code:$(json "$T/r" 'b.error.code')"

ETAG=$(curl -s -D - -o /dev/null "${AUTH[@]}" "$BASE/v1/meta/themes" | grep -i "^etag:" | tr -d '\r' | cut -d' ' -f2)
code=$(curl -s -o /dev/null -w "%{http_code}" "${AUTH[@]}" -H "If-None-Match: $ETAG" "$BASE/v1/meta/themes")
check "caching: If-None-Match -> 304" "304" "$code"

echo
echo "RESULT: $PASS passed, $FAIL failed"
exit $FAIL
