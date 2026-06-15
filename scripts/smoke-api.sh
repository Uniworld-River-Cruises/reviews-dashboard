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

code=$(curl -s -o "$T/rnm" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?has_media=false")
check "reviews/all: has_media=false -> 3 (real negative filter)" "200:3" "$code:$(json "$T/rnm" 'b.summary.meta.count')"
check "reviews/all: has_media=false rows have no media" "true" "$(json "$T/rnm" 'String(b.reviews.every(r=>r.products[0].media.length===0))')"

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
check "summary: service distribution populated (3 service ratings)" "3" "$(json "$T/sum" 'b.rating.service && b.rating.service.count')"
curl -s -o "$T/sumlg" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=luxury-gold" >/dev/null
check "summary: pre-Phase-4 doc (no service dist) -> service null" "null" "$(json "$T/sumlg" 'String(b.rating.service)')"
code=$(curl -s -o "$T/suma" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all")
check "summary: all -> merged across merchants" "200:all:5" "$code:$(json "$T/suma" 'b.merchant.identifier')":"$(json "$T/suma" 'b.meta.count')"
check "summary: mixed merge (one doc lacks service) -> service null" "null" "$(json "$T/suma" 'String(b.rating.service)')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=ship&scope_value=S.S.%20Beatrice")
check "summary: ship scope 200" "200:ship" "$code:$(json "$T/r" 'b.enrichment.scope')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=ship")
check "summary: ship scope without scope_value -> 400" "400" "$code"

# ── Meta ────────────────────────────────────────────────────────────────────
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/meta/themes")
check "meta/themes: 200 with 10+10" "200:10:10" "$code:$(json "$T/r" 'b.themes.positive.length')":"$(json "$T/r" 'b.themes.negative.length')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${LGAUTH[@]}" "$BASE/v1/meta/merchants")
check "meta/merchants: scoped to credential" "200:luxury-gold" "$code:$(json "$T/r" 'b.merchants.map(m=>m.merchant_identifier).join()')"

# ── Input hardening (untrusted values must never reach Firestore paths) ────
code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
  -d '{"client_id":"evil/../../path","client_secret":"x","grant_type":"client_credentials"}')
check "hardening: client_id with slash -> 400 (not 500)" "400:invalid_request" "$code:$(json "$T/r" 'b.error.code')"

# Tamper a REAL cursor (valid query hash) so validation must fail on the
# position value itself, not just the hash binding.
TAMPERED=$("$NODE" -e "
const c=JSON.parse(require('fs').readFileSync('$T/p1','utf8')).summary.next_cursor;
const p=JSON.parse(Buffer.from(c,'base64url').toString('utf8'));
for (const k of Object.keys(p.m)) p.m[k]='a/b/../c';
console.log(Buffer.from(JSON.stringify(p)).toString('base64url'))")
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?page_size=2&cursor=$TAMPERED")
check "hardening: tampered cursor position -> 400 invalid_cursor" "400:invalid_cursor" "$code:$(json "$T/r" 'b.error.code')"

ARRCUR=$("$NODE" -e "
const c=JSON.parse(require('fs').readFileSync('$T/p1','utf8')).summary.next_cursor;
const p=JSON.parse(Buffer.from(c,'base64url').toString('utf8'));
p.m=[];
console.log(Buffer.from(JSON.stringify(p)).toString('base64url'))")
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?page_size=2&cursor=$ARRCUR")
check "hardening: array cursor map -> 400 invalid_cursor" "400:invalid_cursor" "$code:$(json "$T/r" 'b.error.code')"

LONGCUR=$("$NODE" -e "console.log('A'.repeat(3000))")
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?cursor=$LONGCUR")
check "hardening: oversized cursor -> 400 invalid_cursor" "400:invalid_cursor" "$code:$(json "$T/r" 'b.error.code')"

# ── sort=oldest ─────────────────────────────────────────────────────────────
curl -s -o "$T/old" "${AUTH[@]}" "$BASE/v1/reviews/all?sort=oldest" >/dev/null
check "sort=oldest: ascending order, exact reverse of newest" "true" "$("$NODE" -e "
const n=JSON.parse(require('fs').readFileSync('$T/all','utf8')).reviews.map(r=>r.id);
const o=JSON.parse(require('fs').readFileSync('$T/old','utf8')).reviews.map(r=>r.id);
console.log(String(JSON.stringify(o)===JSON.stringify([...n].reverse())))")"

# ── Multi-page post-filter cursor walk ──────────────────────────────────────
curl -s -o "$T/r1" "${AUTH[@]}" "$BASE/v1/reviews/all?rating=5&page_size=1" >/dev/null
RC1=$(json "$T/r1" 'b.summary.next_cursor')
curl -s -o "$T/r2" "${AUTH[@]}" "$BASE/v1/reviews/all?rating=5&page_size=1&cursor=$RC1" >/dev/null
check "post-filter walk: 2 pages, distinct ids, both rating 5" "1:1:true:true" \
  "$(json "$T/r1" 'b.reviews.length')":"$(json "$T/r2" 'b.reviews.length')":"$("$NODE" -e "
const a=JSON.parse(require('fs').readFileSync('$T/r1','utf8')).reviews[0];
const b=JSON.parse(require('fs').readFileSync('$T/r2','utf8')).reviews[0];
console.log(String(a.id!==b.id))")":"$("$NODE" -e "
const head=r=>r.products[0].rating.rating ?? (r.service&&r.service.rating.rating);
const a=JSON.parse(require('fs').readFileSync('$T/r1','utf8')).reviews[0];
const b=JSON.parse(require('fs').readFileSync('$T/r2','utf8')).reviews[0];
console.log(String(Math.round(head(a))===5&&Math.round(head(b))===5))")"

# ── Credential lifecycle (requires apiClients mgmt endpoint + sync token) ───
MGMT="${MGMT:-${BASE%/*}/apiClients}"
SYNC_TOKEN="${SYNC_TOKEN:-local-test-sync-token}"
code=$(curl -s -o "$T/lc" -w "%{http_code}" -X POST "$MGMT" -H "Content-Type: application/json" \
  -H "x-sync-token: $SYNC_TOKEN" -d '{"action":"create","label":"Smoke lifecycle","merchants":["uniworld"]}')
if [ "$code" = "200" ]; then
  LCID=$(json "$T/lc" 'b.client.clientId'); LCSEC=$(json "$T/lc" 'b.clientSecret')
  curl -s -o "$T/lct" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
    -d "{\"client_id\":\"$LCID\",\"client_secret\":\"$LCSEC\",\"grant_type\":\"client_credentials\"}" >/dev/null
  LCTOK=$(json "$T/lct" 'b.access_token')
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $LCTOK" "$BASE/v1/reviews/all?merchant_identifier=uniworld")
  check "lifecycle: fresh client token reads its merchant" "200" "$code"
  curl -s -o "$T/lcr" -X POST "$MGMT" -H "Content-Type: application/json" -H "x-sync-token: $SYNC_TOKEN" \
    -d "{\"action\":\"rotate\",\"clientId\":\"$LCID\"}" >/dev/null
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $LCTOK" "$BASE/v1/reviews/all")
  check "lifecycle: old token 401s IMMEDIATELY after rotate" "401" "$code"
  NEWSEC=$(json "$T/lcr" 'b.clientSecret')
  curl -s -o "$T/lct2" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
    -d "{\"client_id\":\"$LCID\",\"client_secret\":\"$NEWSEC\",\"grant_type\":\"client_credentials\"}" >/dev/null
  LCTOK2=$(json "$T/lct2" 'b.access_token')
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $LCTOK2" "$BASE/v1/reviews/all")
  check "lifecycle: rotated secret's token works" "200" "$code"
  curl -s -o /dev/null -X POST "$MGMT" -H "Content-Type: application/json" -H "x-sync-token: $SYNC_TOKEN" \
    -d "{\"action\":\"revoke\",\"clientId\":\"$LCID\"}"
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $LCTOK2" "$BASE/v1/reviews/all")
  check "lifecycle: token 401s IMMEDIATELY after revoke" "401" "$code"
  code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "$BASE/v1/oauth/token" -H "Content-Type: application/json" \
    -d "{\"client_id\":\"$LCID\",\"client_secret\":\"$NEWSEC\",\"grant_type\":\"client_credentials\"}")
  check "lifecycle: exchange after revoke -> 401 invalid_client" "401:invalid_client" "$code:$(json "$T/r" 'b.error.code')"
else
  echo "SKIP  lifecycle checks (apiClients mgmt endpoint unavailable: $code — set SYNC_TOKEN/MGMT)"
fi

# ── Developer docs (public, no auth) ───────────────────────────────────────
code=$(curl -s -o "$T/spec" -w "%{http_code}" "$BASE/v1/openapi.json")
check "openapi.json: 200 without auth" "200" "$code"
check "openapi.json: valid 3.1 spec with paths" "3.1.0:present" \
  "$(json "$T/spec" 'b.openapi')":"$(json "$T/spec" 'b.paths["/v1/reviews/all"]?"present":"missing"')"
check "openapi.json: oauth2 token URL points at /v1/oauth/token" "true" \
  "$(json "$T/spec" 'String(b.components.securitySchemes.oauth2.flows.clientCredentials.tokenUrl.endsWith("/v1/oauth/token"))')"
ctype=$(curl -s -o "$T/docs" -D - "$BASE/docs" | grep -i "^content-type:" | tr -d '\r' | tr 'A-Z' 'a-z')
check "docs: HTML content-type" "true" "$(echo "$ctype" | grep -q "text/html" && echo true || echo false)"
check "docs: embeds Scalar + the spec" "true" \
  "$(grep -q "@scalar/api-reference" "$T/docs" && grep -q '/v1/reviews/all' "$T/docs" && echo true || echo false)"

# ── Token endpoint accepts form-encoded body and HTTP Basic ─────────────────
code=$(curl -s -o "$T/tf" -w "%{http_code}" -X POST "$BASE/v1/oauth/token" \
  -d "client_id=uw_live_local0test01&client_secret=local-test-secret-not-for-production-1234&grant_type=client_credentials")
check "token: form-encoded body -> 200 Bearer" "200:Bearer" "$code:$(json "$T/tf" 'b.token_type')"
code=$(curl -s -o "$T/tb" -w "%{http_code}" -X POST "$BASE/v1/oauth/token" \
  -u "uw_live_local0test01:local-test-secret-not-for-production-1234" \
  -d "grant_type=client_credentials")
check "token: HTTP Basic creds -> 200 Bearer" "200:Bearer" "$code:$(json "$T/tb" 'b.token_type')"
# A token obtained via the form/basic path must actually work.
FTOKEN=$(json "$T/tf" 'b.access_token')
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $FTOKEN" "$BASE/v1/reviews/all?merchant_identifier=uniworld")
check "token: form-obtained token authorizes a read" "200" "$code"

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
