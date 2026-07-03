# Feefo Reviews Dashboard

Internal dashboard + API that mirrors Feefo review data for TTC brands (~16 merchants; Uniworld and Luxury Gold are the main ones today). Repo: `Uniworld-River-Cruises/reviews-dashboard`. Live app: `feefo-reviews.web.app` (Firebase Hosting). App code lives in `app/` (Next.js; `app/CLAUDE.md` and `app/AGENTS.md` add framework-specific rules), API/functions in `functions/`, shared code in `shared/`.

## Product doctrine: match Feefo exactly
When in doubt, copy Feefo. Filter names, date presets, sort defaults, terminology, and the public API shape should mirror Feefo's dashboard and API ("merchant" not brand; per-brand display terms for products, since not every brand calls them itineraries). Feefo distinguishes PRODUCT reviews from SERVICE reviews; never conflate them. API reference: https://feefo.readme.io (note: feefo.com pages 403 plain fetchers; use the Chrome MCP or curl with a browser UA).

## Environment
- Node 20 (root `.nvmrc` = 20.20.0). The machine's default node is v14, so use `nvm use 20` or call `C:\Users\matt.urbano\AppData\Local\nvm\v20.20.0\node.exe` directly.
- Firebase emulators need Java: `JAVA_HOME` points at the repo-local `.tools\jre`.
- Restart/reset the local stack with `scripts/dev-reset.sh` (kills stray java processes, restarts emulators, waits for "All emulators ready"). Smoke tests: `scripts/smoke-api.sh`, `scripts/smoke-rules.sh`. Seed data: `scripts/seed-emulator.js`.
- Format-on-save is active in this workspace: after editing, expect files to be reformatted underneath you; re-read before further edits instead of fighting stale content.

## Credentials
- Feefo API credentials live in `api-credentials.txt` at the repo root (gitignored) and in GitHub Actions secrets. Read them from there; never inline secret values into command lines or output, and never commit them.

## Deploy (strictly PR-gated)
- Never deploy to production directly. Changes go: branch → PR → merge → GitHub Actions `firebase-deploy.yml`.
- After a merge, watch the deploy yourself (`gh run watch` or `gh run list --workflow=firebase-deploy.yml`); on failure, pull logs with `gh run view <id> --log-failed` and fix. Don't wait for Matt to report it.
- Remember what's visible where: code changes are NOT on the live site until deployed; use localhost/emulators to demo pre-merge work.
- Before any commit: `npx tsc --noEmit` (from `app/`) and eslint on changed files.

## Known bug family: counts vs Feefo
The recurring defect shape is client-side operations silently limited to the first loaded page (50 reviews): totals, sort, CSV export, media filters, and theme aggregation have each shipped with this bug. Any new aggregate/sort/export MUST be server-side over the full dataset, then verified against the Feefo dashboard side by side. Also watch: duplicate reviews (dedupe by review id) and date semantics (Feefo "Updated" vs "Created" are different fields; presets must say which they use).
