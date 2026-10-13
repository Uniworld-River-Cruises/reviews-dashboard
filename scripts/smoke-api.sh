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
check "reviews/all: rating=5 server-side, exact count 2, 2 results" "200:2:2" "$code:$(json "$T/r" 'String(b.summary.meta.count)')":"$(json "$T/r" 'b.reviews.length')"

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
check "rating cursor walk: 2 pages, distinct ids, both rating 5" "1:1:true:true" \
  "$(json "$T/r1" 'b.reviews.length')":"$(json "$T/r2" 'b.reviews.length')":"$("$NODE" -e "
const a=JSON.parse(require('fs').readFileSync('$T/r1','utf8')).reviews[0];
const b=JSON.parse(require('fs').readFileSync('$T/r2','utf8')).reviews[0];
console.log(String(a.id!==b.id))")":"$("$NODE" -e "
const head=r=>r.products[0].rating.rating ?? (r.service&&r.service.rating.rating);
const a=JSON.parse(require('fs').readFileSync('$T/r1','utf8')).reviews[0];
const b=JSON.parse(require('fs').readFileSync('$T/r2','utf8')).reviews[0];
console.log(String(Math.round(head(a))===5&&Math.round(head(b))===5))")"

SYNC_TOKEN="${SYNC_TOKEN:-local-test-sync-token}"
# ── Star filter runs server-side: exact count and page numbers ─────────────
code=$(curl -s -o "$T/r5p2" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?rating=5&page=2&page_size=1")
check "rating=5&page=2: 200, count 2, pages 2, current_page 2, 1 result" "200:2:2:2:1" \
  "$code:$(json "$T/r5p2" 'b.summary.meta.count')":"$(json "$T/r5p2" 'b.summary.meta.pages')":"$(json "$T/r5p2" 'b.summary.meta.current_page')":"$(json "$T/r5p2" 'b.reviews.length')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?rating=5&ship=S.S.%20Beatrice")
check "rating + another filter falls back to post-filter (count null, 1 match)" "200:null:1" \
  "$code:$(json "$T/r" 'String(b.summary.meta.count)')":"$(json "$T/r" 'b.reviews.length')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?rating=5&ship=S.S.%20Beatrice&page=2")
check "rating + another filter, page 2 -> 400 use_cursor" "400:use_cursor" "$code:$(json "$T/r" 'b.error.code')"

# ── Location and replies ───────────────────────────────────────────────────
check "display_location exposed where given" "London, United Kingdom" \
  "$(json "$T/all" 'b.reviews.find(r=>r.id==="aaaaaaaaaaaaaaaaaaaaaa01").customer.display_location')"
check "display_location null where not given" "null" \
  "$(json "$T/all" 'String(b.reviews.find(r=>r.id==="aaaaaaaaaaaaaaaaaaaaaa02").customer.display_location)')"
check "reply: plain text with no HTML tags" "true:Uniworld Guest Relations" \
  "$(json "$T/all" 'String(/^Dear Robert,\n/.test(b.reviews.find(r=>r.id==="aaaaaaaaaaaaaaaaaaaaaa03").reply.text) && !/<[a-z\/]/i.test(b.reviews.find(r=>r.id==="aaaaaaaaaaaaaaaaaaaaaa03").reply.text))')":"$(json "$T/all" 'b.reviews.find(r=>r.id==="aaaaaaaaaaaaaaaaaaaaaa03").reply.author')"
check "reply: null without one; raw HTML and website state never exposed" "null:0:0" \
  "$(json "$T/all" 'String(b.reviews.find(r=>r.id==="aaaaaaaaaaaaaaaaaaaaaa01").reply)')":"$(grep -c 'mailto:' "$T/all")":"$(grep -c '"website"' "$T/all")"

# ── Rating sort ────────────────────────────────────────────────────────────
curl -s -o "$T/hi" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&parent_product_sku=UW-DAN&sort=highest&page_size=8" >/dev/null
check "sort=highest + parent_product_sku: descending headline, exact count" "01,02:2" \
  "$(json "$T/hi" 'b.reviews.map(r=>r.id.slice(-2)).join()')":"$(json "$T/hi" 'b.summary.meta.count')"
curl -s -o "$T/lo" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&parent_product_sku=UW-DAN&sort=lowest" >/dev/null
check "sort=lowest + parent_product_sku: ascending headline" "02,01" "$(json "$T/lo" 'b.reviews.map(r=>r.id.slice(-2)).join()')"
curl -s -o "$T/hia" "${AUTH[@]}" "$BASE/v1/reviews/all?sort=highest" >/dev/null
check "sort=highest across merchants: rating desc, then newest" "aa01,bb01,aa02,aa03,bb02" \
  "$(json "$T/hia" 'b.reviews.map(r=>r.id.slice(0,2)+r.id.slice(-2)).join()')"
curl -s -o "$T/hp1" "${AUTH[@]}" "$BASE/v1/reviews/all?sort=highest&page_size=2" >/dev/null
HC=$(json "$T/hp1" 'b.summary.next_cursor')
curl -s -o "$T/hp2" "${AUTH[@]}" "$BASE/v1/reviews/all?sort=highest&page_size=2&cursor=$HC" >/dev/null
check "sort=highest cursor walk continues the same order" "aa01,bb01|aa02,aa03" \
  "$(json "$T/hp1" 'b.reviews.map(r=>r.id.slice(0,2)+r.id.slice(-2)).join()')|$(json "$T/hp2" 'b.reviews.map(r=>r.id.slice(0,2)+r.id.slice(-2)).join()')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?sort=highest&ship=S.S.%20Beatrice")
check "sort=highest + ship -> 400 filters_not_combinable" "400:filters_not_combinable" "$code:$(json "$T/r" 'b.error.code')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?sort=lowest&since_period=month")
check "sort=lowest + date filter -> 400" "400:filters_not_combinable" "$code:$(json "$T/r" 'b.error.code')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?sort=rating")
check "sort=rating (unknown) -> 400" "400:invalid_parameter" "$code:$(json "$T/r" 'b.error.code')"

# ── Website approval filters ───────────────────────────────────────────────
code=$(curl -s -o "$T/wa" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved")
check "website=approved -> 2 approved reviews, candidates excluded" "200:2:aa01,bb01" \
  "$code:$(json "$T/wa" 'b.summary.meta.count')":"$(json "$T/wa" 'b.reviews.map(r=>r.id.slice(0,2)+r.id.slice(-2)).join()')"
check "website=approved never leaks the moderator email" "0" "$(grep -c -E 'SEED_PII|seed-pii@' "$T/wa")"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&placement=culinary")
check "website=approved&placement=culinary -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&positive_theme=Staff")
check "website=approved&positive_theme=Staff -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&parent_product_sku=UW-DAN")
check "website=approved&parent_product_sku=UW-DAN -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&placement=culinary&parent_product_sku=UW-DAN")
check "website=approved&placement=culinary&parent_product_sku=UW-DAN -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&placement=culinary&ship=S.S.%20Beatrice")
check "website=approved&placement=culinary&ship -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&placement=guest-stories&tour=Enchanting%20Danube%20(8%20Days)")
check "website=approved&placement=guest-stories&tour -> 0 (aa01 is culinary)" "200:0" "$code:$(json "$T/r" 'b.summary.meta.count')"
# The emulator doesn't enforce composite indexes, so check the file: every
# filter website=approved combines with (except positive_theme, which can't
# take placement) needs a placement index in both created-date directions.
check "indexes: placement + each website filter, both directions" "ok" "$("$NODE" -e "
const ix=JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')).indexes.map(i=>i.fields.map(f=>f.fieldPath+':'+(f.order||f.arrayConfig)).join());
const src=require('fs').readFileSync('functions/src/api/reviews-api.ts','utf8');
const params=[...src.match(/WEBSITE_COMBINABLE = new Set\(\[([^\]]*)\]/)[1].matchAll(/\"([a-z_]+)\"/g)].map(m=>m[1]).filter(p=>p!=='positive_theme');
const field={ship:'tags.ship',tour:'tags.tour',parent_product_sku:'product.parentSku',itinerary:'itineraryGroupKey'};
const missing=[];
for(const p of params)for(const d of ['ASCENDING','DESCENDING']){
  const want='brand:ASCENDING,website.status:ASCENDING,website.placements:CONTAINS,'+(field[p]||p+'?')+':ASCENDING,dates.created:'+d;
  if(!ix.includes(want))missing.push(p+'/'+d);
}
console.log(missing.length?missing.join(' '):'ok')")"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&placement=culinary&positive_theme=Staff")
check "placement + positive_theme -> 400" "400:filters_not_combinable" "$code:$(json "$T/r" 'b.error.code')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?placement=culinary")
check "placement without website=approved -> 400" "400:invalid_parameter" "$code:$(json "$T/r" 'b.error.code')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&placement=desserts")
check "unknown placement -> 400" "400:invalid_parameter" "$code:$(json "$T/r" 'b.error.code')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=candidate")
check "website=candidate is not public -> 400" "400:invalid_parameter" "$code:$(json "$T/r" 'b.error.code')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&has_media=true")
check "website=approved + has_media -> 400" "400:filters_not_combinable" "$code:$(json "$T/r" 'b.error.code')"

# ── Per-trip and Feefo headline summaries ──────────────────────────────────
code=$(curl -s -o "$T/sp" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=product&parent_product_sku=UW-DAN")
check "summary scope=product: count, average, both distributions" "200:2:4.5:2:2:product:UW-DAN" \
  "$code:$(json "$T/sp" 'b.meta.count')":"$(json "$T/sp" 'b.rating.rating')":"$(json "$T/sp" 'b.rating.product.count')":"$(json "$T/sp" 'b.rating.service.count')":"$(json "$T/sp" 'b.enrichment.scope')":"$(json "$T/sp" 'b.enrichment.scope_value')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=product")
check "summary scope=product without parent_product_sku -> 400" "400" "$code"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=product&parent_product_sku=NOPE")
check "summary scope=product unknown sku -> 404" "404" "$code"
curl -s -o "$T/sf" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld" >/dev/null
check "fleet summary carries the Feefo merchant rating and count" "4.8:24888" \
  "$(json "$T/sf" 'b.rating.feefo_rating')":"$(json "$T/sf" 'b.meta.feefo_count')"
curl -s -o "$T/sfa" "${AUTH[@]}" "$BASE/v1/reviews/summary/all" >/dev/null
check "merged (all merchants) summary leaves Feefo numbers null" "null:null" \
  "$(json "$T/sfa" 'String(b.rating.feefo_rating)')":"$(json "$T/sfa" 'String(b.meta.feefo_count)')"

# ── Website moderation endpoint (dashboard action; needs the sync token) ───
MOD="${MOD:-${BASE%/*}/websiteModeration}"
code=$(curl -s -o "$T/m" -w "%{http_code}" -X POST "$MOD" -H "Content-Type: application/json" -H "x-sync-token: $SYNC_TOKEN" \
  -d '{"reviewId":"aaaaaaaaaaaaaaaaaaaaaa02","action":"approve","placements":["ships"]}')
if [ "$code" = "200" ]; then
  check "moderation: approve returns approved + placements" "approved:ships" \
    "$(json "$T/m" 'b.website.status')":"$(json "$T/m" 'b.website.placements.join()')"
  code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved&placement=ships")
  check "moderation: approved review appears in website=approved&placement=ships" "200:1:02" \
    "$code:$(json "$T/r" 'b.summary.meta.count')":"$(json "$T/r" 'b.reviews[0].id.slice(-2)')"
  curl -s -o "$T/m" -X POST "$MOD" -H "Content-Type: application/json" -H "x-sync-token: $SYNC_TOKEN" \
    -d '{"reviewId":"aaaaaaaaaaaaaaaaaaaaaa02","action":"reject"}' >/dev/null
  code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?website=approved")
  check "moderation: rejected review leaves website=approved" "rejected:2" \
    "$(json "$T/m" 'b.website.status')":"$(json "$T/r" 'b.summary.meta.count')"
  curl -s -o "$T/m" -X POST "$MOD" -H "Content-Type: application/json" -H "x-sync-token: $SYNC_TOKEN" \
    -d '{"reviewId":"aaaaaaaaaaaaaaaaaaaaaa02","action":"reset"}' >/dev/null
  check "moderation: reset of a non-matching review clears website state" "null" "$(json "$T/m" 'String(b.website)')"
  code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "$MOD" -H "Content-Type: application/json" -H "x-sync-token: $SYNC_TOKEN" \
    -d '{"reviewId":"aaaaaaaaaaaaaaaaaaaaaa02","action":"approve","placements":["desserts"]}')
  check "moderation: unknown placement -> 400" "400" "$code"
  code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "$MOD" -H "Content-Type: application/json" -H "x-sync-token: $SYNC_TOKEN" \
    -d '{"reviewId":"doesnotexist00000000","action":"reject"}')
  check "moderation: unknown review -> 404" "404" "$code"
  code=$(curl -s -o "$T/r" -w "%{http_code}" -X POST "$MOD" -H "Content-Type: application/json" \
    -d '{"reviewId":"aaaaaaaaaaaaaaaaaaaaaa02","action":"reject"}')
  check "moderation: no credentials -> 401" "401" "$code"
else
  echo "SKIP  moderation checks (websiteModeration endpoint unavailable: $code; set SYNC_TOKEN/MOD)"
fi

# ── Credential lifecycle (requires apiClients mgmt endpoint + sync token) ───
MGMT="${MGMT:-${BASE%/*}/apiClients}"
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

# ── itinerary= (the group scope=itinerary summaries use) ───────────────────
curl -s -o "$T/it" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&itinerary=Enchanting%20Danube" >/dev/null
curl -s -o "$T/its" "${AUTH[@]}" "$BASE/v1/reviews/summary/all?merchant_identifier=uniworld&scope=itinerary&scope_value=Enchanting%20Danube" >/dev/null
check "itinerary=: count 2, equal to the itinerary summary's meta.count" "2:2"   "$(json "$T/it" 'b.summary.meta.count')":"$(json "$T/its" 'b.meta.count')"
check "itinerary=: enrichment.itinerary.group is the filter value" "Enchanting Danube"   "$(json "$T/it" '[...new Set(b.reviews.map(r=>r.enrichment.itinerary.group))].join()')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&itinerary=enchanting-DANUBE")
check "itinerary=: case and punctuation ignored, like scope_value" "200:2" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?itinerary=Majestic%20Switzerland")
check "itinerary=: other merchant's group (all merchants)" "200:2:luxury-gold"   "$code:$(json "$T/r" 'b.summary.meta.count')":"$(json "$T/r" '[...new Set(b.reviews.map(r=>r.merchant.identifier))].join()')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&itinerary=Enchanting%20Danube&sort=highest")
check "itinerary= + sort=highest: 200, descending headline" "200:01,02" "$code:$(json "$T/r" 'b.reviews.map(r=>r.id.slice(-2)).join()')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&itinerary=Enchanting%20Danube&sort=lowest")
check "itinerary= + sort=lowest: 200, ascending headline" "200:02,01" "$code:$(json "$T/r" 'b.reviews.map(r=>r.id.slice(-2)).join()')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&itinerary=Enchanting%20Danube&rating=4")
check "itinerary= + rating=4: post-filter, 1 match" "200:null:02" "$code:$(json "$T/r" 'String(b.summary.meta.count)')":"$(json "$T/r" 'b.reviews.map(r=>r.id.slice(-2)).join()')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&itinerary=Enchanting%20Danube&website=approved")
check "itinerary= + website=approved -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?merchant_identifier=uniworld&itinerary=Enchanting%20Danube&website=approved&placement=culinary")
check "itinerary= + website=approved&placement=culinary -> 1" "200:1" "$code:$(json "$T/r" 'b.summary.meta.count')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?itinerary=Enchanting%20Danube&tour=Castles%20along%20the%20Rhine")
check "itinerary= + tour -> 400 filters_not_combinable" "400:filters_not_combinable" "$code:$(json "$T/r" 'b.error.code')"
code=$(curl -s -o "$T/r" -w "%{http_code}" "${AUTH[@]}" "$BASE/v1/reviews/all?itinerary=%26%26")
check "itinerary= with no letters or digits -> 400" "400:invalid_parameter" "$code:$(json "$T/r" 'b.error.code')"

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
