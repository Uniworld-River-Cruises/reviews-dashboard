# Operations Runbook

## Scheduled Sync

- Function: `dailySync`
- Schedule: `0 2 * * *` (2:00 UTC)
- Behavior: fetch Feefo reviews, write Firestore reviews, recompute summaries

## Manual Sync

Function endpoint:

`POST https://us-central1-feefo-reviews.cloudfunctions.net/manualSync`

Auth options:

- `Authorization: Bearer <firebase-id-token>`
- or `x-sync-token: <SYNC_API_TOKEN>`

Payload:

```json
{
  "fullSync": false,
  "resetLock": false
}
```

## Batch Classification

Endpoint:

`POST https://us-central1-feefo-reviews.cloudfunctions.net/batchClassify`

Payloads:

- Submit:
```json
{ "action": "submit" }
```

- Retrieve results:
```json
{ "action": "results", "batchId": "<optional-batch-id>" }
```

## Itinerary Mapping Admin

Endpoint:

`POST https://us-central1-feefo-reviews.cloudfunctions.net/itineraryMappings`

Payloads:

- Rebuild mappings:
```json
{ "action": "rebuild", "brand": "uniworld" }
```

- Manual override:
```json
{
  "action": "update",
  "brand": "uniworld",
  "rawName": "Rhine Holiday Markets (BSL-CGN) 25",
  "manualParentName": "Rhine Holiday Markets"
}
```

- Recompute summaries:
```json
{ "action": "recompute", "brand": "uniworld" }
```

## Quick Troubleshooting

1. Sync appears stuck:
- Call `manualSync` with `{ "resetLock": true }`
- Check Firestore `sync_meta` docs for both brands

2. Function call returns 401:
- Ensure user is signed in and token is valid
- Or provide `x-sync-token` matching `SYNC_API_TOKEN`

3. Function call returns 403:
- Ensure caller email is included in `ADMIN_EMAILS`
- If `REQUIRE_ADMIN_CLAIM=true`, ensure token has `admin: true`

4. Frontend cannot trigger refresh/admin:
- Verify `NEXT_PUBLIC_FUNCTIONS_URL` points to deployed functions
- Confirm browser user is authenticated
