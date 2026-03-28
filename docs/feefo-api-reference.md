# Feefo API Reference (Project Usage)

## Base URL

`https://api.feefo.com/api`

## Authentication

Token endpoint:

`POST /oauth/v2/token`

Body:

```json
{
  "client_id": "<brand-specific client id>",
  "client_secret": "<brand-specific client secret>",
  "grant_type": "client_credentials"
}
```

Environment variables used by this repo:

- `FEEFO_UNIWORLD_CLIENT_ID`
- `FEEFO_UNIWORLD_CLIENT_SECRET`
- `FEEFO_LUXURY_GOLD_CLIENT_ID`
- `FEEFO_LUXURY_GOLD_CLIENT_SECRET`

## Endpoints Used

- `GET /20/reviews/all`
- `GET /20/reviews/summary/all`

Key query params used:

- `merchant_identifier`
- `page`
- `page_size`
- `since_period`
- `since_updated_period`

## Merchant Identifiers

- Uniworld: `uniworld`
- Luxury Gold: `luxury-gold`

## Integration Location in Code

- Feefo client: [shared/src/feefo/client.ts](/C:/projects/feefo-reviews/shared/src/feefo/client.ts)
- Transformation: [shared/src/feefo/transform.ts](/C:/projects/feefo-reviews/shared/src/feefo/transform.ts)
- Sync pipeline: [functions/src/sync/sync-reviews.ts](/C:/projects/feefo-reviews/functions/src/sync/sync-reviews.ts)
