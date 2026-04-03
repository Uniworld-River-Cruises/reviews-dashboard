# Multi-Tenant Platform Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-04-03
**Status:** Planning
**Overview:** Transform the Feefo Reviews dashboard from a single-brand tool into a multi-tenant SaaS platform where each organization has its own isolated environment with custom branding, Feefo merchant IDs, user management, and self-service onboarding.

**Goal:** Enable any Feefo customer to onboard, connect their merchant IDs, customize their brand, manage their users, and access isolated analytics through path-based tenant routing (`/{orgSlug}/`).

**Architecture:** Path-based multi-tenant Next.js app hosted on Firebase App Hosting (SSR via Cloud Run), with Firestore subcollections for tenant data isolation (`organizations/{orgId}/...`), encrypted Feefo credential storage, and tenant-aware Cloud Functions for sync and classification.

**Tech Stack:** Next.js 16 (App Router, SSR), Firebase App Hosting (Cloud Run), Firestore, Firebase Auth (Microsoft SSO), Cloud Functions, Firebase Storage, Google Cloud Secret Manager, Tailwind CSS v4

---

## Key Terminology Change: "Brand" -> "Organization"

The v1 roadmap used "brand" as the tenant unit. This v2 renames to **"organization"** throughout to better reflect the multi-tenant SaaS model. An organization is a Feefo customer (e.g., Uniworld Journeys, Acme Travel Corp) that has:
- One or more Feefo merchant IDs
- Its own users with roles
- Custom brand theme and identity
- Isolated review data

The Firestore collection is renamed from `brands/` to `organizations/` to match.

**Important:** Uniworld and Luxury Gold are two Feefo merchant IDs within a single organization ("Uniworld Journeys"), not two separate organizations. Any organization can have multiple merchant IDs. The merchant switcher in the UI filters which merchant's data is displayed within the org.

---

## Architecture Vision

```
                    ┌──────────────────────────────────────────────┐
                    │              Firebase App Hosting             │
                    │           (Next.js SSR on Cloud Run)         │
                    │                                              │
  Browser request   │  ┌──────────────────────────────────────┐   │
  /{orgSlug}/...    │  │         Next.js Middleware             │   │
  ─────────────────►│  │  1. Extract orgSlug from URL path     │   │
                    │  │  2. Validate orgSlug format           │   │
                    │  │  3. Skip static/auth handler paths    │   │
                    │  │  4. Pass through (auth is client-side)│   │
                    │  └──────────────┬───────────────────────┘   │
                    │                 │                            │
                    │  ┌──────────────▼───────────────────────┐   │
                    │  │         /[orgSlug]/layout.tsx          │   │
                    │  │  1. Fetch org config from Firestore   │   │
                    │  │  2. Apply theme tokens (SSR)          │   │
                    │  │  3. Provide OrgContext to children     │   │
                    │  └──────────────┬───────────────────────┘   │
                    │                 │                            │
                    │  ┌──────────────▼───────────────────────┐   │
                    │  │         Dashboard Pages                │   │
                    │  │  /[orgSlug]/                (overview) │   │
                    │  │  /[orgSlug]/reviews         (explorer) │   │
                    │  │  /[orgSlug]/itineraries                │   │
                    │  │  /[orgSlug]/ships                      │   │
                    │  │  /[orgSlug]/settings        (admin)    │   │
                    │  │  /[orgSlug]/admin           (admin)    │   │
                    │  └──────────────────────────────────────┘   │
                    └──────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │                  Firestore                    │
                    │                                              │
                    │  organizations/{orgId}/                      │
                    │    ├── (org config doc: theme, merchants,    │
                    │    │    settings, logo, appTitle)            │
                    │    ├── users/{uid}                           │
                    │    ├── reviews/{reviewId}                    │
                    │    ├── summaries/{summaryId}                 │
                    │    ├── monthly_summaries/{docId}             │
                    │    ├── sync_meta/{merchantId}                │
                    │    └── itinerary_mappings/{mappingId}        │
                    │                                              │
                    │  platform/config (global settings)           │
                    │  super_admins/{uid}                          │
                    │  org_profiles/{orgId} (public branding)      │
                    │  user_org_map/{uid} (cross-org lookup)       │
                    └──────────────────────────────────────────────┘

                    ┌──────────────────────────────────────────────┐
                    │               Cloud Functions                 │
                    │                                              │
                    │  syncScheduler (daily)                       │
                    │    → Query all orgs from Firestore           │
                    │    → For each: fetch credentials, sync       │
                    │    → Write to organizations/{orgId}/reviews  │
                    │                                              │
                    │  manualSync (HTTP, authenticated)            │
                    │    → Validate user is org admin              │
                    │    → Sync specific org's merchants           │
                    │                                              │
                    │  batchClassify (HTTP, authenticated)         │
                    │    → Classify reviews for specific org       │
                    └──────────────────────────────────────────────┘
```

### URL Routing Strategy: Path-Based

All tenants share a single domain with path-based routing:

```
https://feefo-reviews.web.app/                         ← Login / org selection
https://feefo-reviews.web.app/uniworld-journeys/       ← Uniworld dashboard
https://feefo-reviews.web.app/acme-travel/             ← Acme Travel dashboard
https://feefo-reviews.web.app/uniworld-journeys/reviews
https://feefo-reviews.web.app/acme-travel/settings
```

**Why path-based (not subdomains):**
- Single domain, single SSL certificate, zero DNS management per tenant
- Firebase App Hosting supports this natively
- Next.js `[orgSlug]` dynamic segments handle routing trivially
- Middleware extracts and validates `orgSlug` on every request
- Simpler local development (no hosts file or wildcard DNS)
- Custom domains (e.g., `reviews.uniworld.com`) can be layered on later via reverse proxy if needed (Phase 5+ concern)

**Root URL (`/`) behavior:**
- Unauthenticated users see the login page
- Authenticated users with a single org membership are redirected to `/{orgSlug}/`
- Authenticated users with multiple org memberships see an org picker
- Authenticated users with no org membership see "Create Organization" or "Contact your admin"

---

### Data Model (Firestore)

```
organizations/
  {orgId}/                          ← Document ID = URL slug (IMMUTABLE — see Design Principles)
    name: string                    ← Display name (e.g., "Uniworld Journeys")
    slug: string                    ← URL slug, matches document ID
    theme: {
      primary: string               ← 6-token theme system from Phase 1
      primaryDark: string
      accent: string
      accentLight: string
      neutral: string
      surfaceWarm: string
    }
    logoPath: string                ← Firebase Storage path (e.g., "organizations/{orgId}/assets/logo.png"), resolved via SDK
    logoAlt: string
    appTitle: string                ← e.g., "Feefo Review Intelligence Dashboard"
    merchants: [
      {
        feefoMerchantId: string     ← Value passed to Feefo API
        label: string               ← Display name in UI
        showShips: boolean           ← Per-merchant flag (from Phase 1 design)
      }
    ]
    settings: {
      defaultDateRange: string      ← "last30d" | "last90d" | "lastYear" | "allTime"
      enabledPages: string[]        ← ["overview", "reviews", "itineraries", "ships", "admin"]
      exportFormat: string          ← "csv" | "xlsx"
    }
    status: string                  ← "active" | "suspended" | "pending_setup"
    createdAt: timestamp
    updatedAt: timestamp
    createdBy: string               ← UID of the user who created the org

organizations/{orgId}/users/
  {uid}/                            ← Firebase Auth UID
    email: string
    displayName: string
    role: "owner" | "admin" | "viewer"
    addedAt: timestamp
    addedBy: string                 ← UID of admin who added them
    lastLoginAt: timestamp | null

organizations/{orgId}/invites/
  {normalizedEmail}/                ← Email-keyed (lowercase, trimmed)
    email: string
    role: "admin" | "viewer"
    invitedBy: string               ← UID of admin who invited them
    invitedAt: timestamp
    status: "pending" | "accepted" | "expired"

organizations/{orgId}/credentials/
  feefo/                            ← Metadata document (secrets in Google Cloud Secret Manager)
    secretRefClientId: string       ← Secret Manager resource name for client ID
    secretRefClientSecret: string   ← Secret Manager resource name for client secret
    lastVerified: timestamp         ← Last successful API call
    status: "valid" | "invalid" | "unverified"

organizations/{orgId}/reviews/
  {reviewId}/                       ← Same schema as current top-level reviews collection
    ...existing review fields...
    merchantId: string              ← Which merchant this review belongs to

organizations/{orgId}/summaries/
  {summaryId}/                      ← Compound key: "{merchantId}" or "{merchantId}_ship_{slug}" or "{merchantId}_itinerary_{slug}"
    merchantId: string              ← Which merchant this summary covers (or "combined" for all)
    scope: "fleet" | "ship" | "itinerary"
    scopeValue: string | null       ← Ship name, itinerary name, or null for fleet
    ...existing summary metric fields...

organizations/{orgId}/monthly_summaries/
  {docId}/
    ...existing monthly summary fields...

organizations/{orgId}/sync_meta/
  {merchantId}/
    lastSyncAt: timestamp
    status: "idle" | "syncing" | "error"
    reviewCount: number
    lastError: string | null

organizations/{orgId}/itinerary_mappings/
  {mappingId}/
    ...existing mapping fields...

organizations/{orgId}/operation_logs/
  {logId}/
    ...existing log fields...

# Platform-level collections (not per-org)
platform/
  config/                           ← Global platform settings (single document)
    maintenanceMode: boolean
    allowSelfServiceSignup: boolean
    defaultTheme: { ...6 tokens... }

super_admins/                         ← Top-level collection (valid 2-segment doc path)
  {uid}/
    email: string
    addedAt: timestamp

org_profiles/                         ← Public org profiles for pre-auth display (login branding)
  {orgId}/                            ← Readable by anyone, synced from org config via Cloud Functions
    name: string
    slug: string
    logoPath: string                  ← Firebase Storage path (NOT a download URL)
    theme: { ...6 tokens... }
    appTitle: string

user_org_map/                         ← Cross-org user lookup
  {uid}/
    orgs: [{ orgId: string, role: string }]
    primaryOrgId: string
    updatedAt: timestamp
```

---

## Phase Summary & Dependencies

```
Phase 1: Theme Engine & UI Refresh          ← COMPLETE
  │
  ▼
Phase 1.5: Infrastructure Migration          ← NEW (this doc)
  │ (remove static export, enable SSR,
  │  path-based routing, middleware,
  │  minimal org-membership lookup)
  │
  ▼
Phase 2: Firestore Data Model & Security     ← UPDATED (was "Settings UI")
  │ (tenant-scoped collections, security
  │  rules, data migration, credential
  │  storage, tenant-aware sync,
  │  user_org_map + invite system)
  │
  ▼
Phase 3: Settings UI & Brand Configuration   ← RENUMBERED (was Phase 2)
  │ (theme editor, logo upload, merchant
  │  management, general settings)
  │
  ▼
Phase 4: User Management & Auth Refinement   ← RENUMBERED/UPDATED (was Phase 3)
  │ (user-to-org mapping, role management,
  │  multi-org support, access denied flow)
  │
  ▼
Phase 5: Organization Onboarding             ← RENUMBERED/UPDATED (was Phase 4)
  │ (admin-provisioned first, then
  │  self-service wizard, Feefo credential
  │  verification)
```

---

## Phase 1: Theme Engine & UI Refresh

**Status:** COMPLETE
**See:** `2026-04-02-theme-engine-and-ui-refresh-phase1.md`

**Deliverables (all shipped):**
- Configurable 6-token theme system with programmatic derivation
- Uniworld Journeys brand applied as first theme
- Brand-aware dark mode (derived from same 6 tokens)
- Consolidated single-bar header with inline navigation
- Mobile hamburger drawer
- Full CSS variable migration (no hardcoded colors)
- Default/vanilla fallback theme

**Key Phase 1 decisions that affect later phases:**
- Active brand is set via `ACTIVE_BRAND_ID = "uniworld-journeys"` in static config. Phase 2 replaces this with a Firestore fetch.
- `BrandMerchant.showShips` is a per-merchant flag, not a global toggle. Settings UI must expose this per merchant.
- The `id` field on `BrandMerchant` doubles as the Feefo merchant ID. Phase 2 should reconcile to a dedicated `feefoMerchantId` field.

---

## Phase 1.5: Infrastructure Migration

**Status:** Not started
**Depends on:** Phase 1 complete
**Priority:** CRITICAL - This is a prerequisite for all subsequent phases
**Estimated effort:** Medium (3-5 days)

### Why This Phase Exists

The current app uses `output: "export"` in `next.config.ts`, which compiles to static HTML served by Firebase Hosting. This prevents:
- Server-side middleware (needed for tenant resolution and auth guards)
- Dynamic route segments resolved at request time
- Server-side theme injection (prevents flash-of-wrong-theme for non-default tenants)
- Next.js API routes (if needed in future)

Multi-tenant requires **server-side rendering** to resolve which organization a request belongs to before the page renders.

### Scope

1. **Remove static export** from Next.js config
2. **Migrate hosting** from Firebase Hosting (static) to Firebase App Hosting (Cloud Run SSR)
3. **Add `[orgSlug]` route structure** with dynamic segments
4. **Add Next.js middleware** for tenant resolution and auth validation
5. **Update CI/CD pipeline** for new deployment target
6. **Update `theme-init.js`** for multi-tenant theme bootstrapping

### Implementation Details

#### 1.5a. Remove Static Export

**File:** `app/next.config.ts`

Change from:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
```

To:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR mode (default) — required for middleware and dynamic routing
};

export default nextConfig;
```

#### 1.5b. Restructure Routes to `[orgSlug]` Pattern

Move all dashboard pages under a dynamic `[orgSlug]` segment:

**Current route structure:**
```
app/src/app/
  layout.tsx              ← Root layout
  page.tsx                ← Dashboard overview
  reviews/page.tsx
  itineraries/page.tsx
  ships/page.tsx
  admin/page.tsx
  admin/logs/page.tsx
```

**New route structure:**
```
app/src/app/
  layout.tsx              ← Root layout (ThemeProvider, minimal shell)
  page.tsx                ← Login page / org picker (unauthenticated landing)
  [orgSlug]/
    layout.tsx            ← Org layout (OrgProvider, AuthGate, Header, Navigation)
    page.tsx              ← Dashboard overview
    reviews/page.tsx
    itineraries/page.tsx
    ships/page.tsx
    settings/page.tsx     ← NEW (Phase 3 builds the UI)
    admin/page.tsx
    admin/logs/page.tsx
  access-denied/page.tsx  ← Shown when user has no org membership
```

**Root layout (`app/src/app/layout.tsx`):**
- Keeps: `ThemeProvider`, fonts, metadata, `theme-init.js` script
- Removes: `DashboardProvider`, `AuthGate`, `Header`, `Navigation` (these move to `[orgSlug]/layout.tsx`)

**Org layout (`app/src/app/[orgSlug]/layout.tsx`):**
- Receives `params.orgSlug` from Next.js
- Fetches org config from Firestore (server component or client fetch)
- Wraps children in: `OrgProvider` (new, replaces DashboardProvider) -> `AuthGate` -> `Header` + `Navigation` + `main`
- Applies org theme tokens via `injectThemeTokens()` or server-side CSS injection

**Root page (`app/src/app/page.tsx`):**
- Unauthenticated: Shows landing page with "Sign In with Microsoft" button
- Authenticated: Queries `user_org_map/{uid}` for org membership
  - 1 org: Redirects to `/{orgSlug}/`
  - 2+ orgs: Shows org picker
  - 0 orgs: Redirects to `/access-denied`
- **Phase 1.5 simplification:** During initial migration (before Phase 4 builds full user management), the root page can hardcode a redirect to `/uniworld-journeys/` for all authenticated users. The org picker and `user_org_map` lookup are built in Phase 2/4.

#### 1.5c. Add Next.js Middleware

**File:** `app/src/middleware.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

// Reserved root paths that are NOT org slugs
const RESERVED_PATHS = new Set([
  "access-denied",
  "platform-admin",
  "onboard",
  "api",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets, Next.js internals, and Firebase Auth handler
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/__/auth") ||
    pathname === "/" ||
    pathname === "/favicon.ico" ||
    RESERVED_PATHS.has(pathname.split("/")[1] || "")
  ) {
    return NextResponse.next();
  }

  // Extract orgSlug from path: /orgSlug/...
  const segments = pathname.split("/").filter(Boolean);
  const orgSlug = segments[0];

  if (!orgSlug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(orgSlug)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Pass through — auth and org membership are validated client-side by AuthGate
  // The [orgSlug] layout receives the slug via params, no header passing needed
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Auth model:** The app continues to use client-side Firebase Auth (`signInWithPopup`). The middleware does NOT validate auth or org membership — it only validates the path format and skips reserved routes. Auth and org membership are enforced by `AuthGate` (client-side) and Firestore security rules. This avoids the complexity of server-side session cookies while still getting the benefits of SSR for layout and theme rendering.

The `[orgSlug]/layout.tsx` receives the slug directly from Next.js `params` — no custom headers needed.

#### 1.5d. Create OrgContext (Replaces DashboardContext)

**File:** `app/src/contexts/OrgContext.tsx`

This context replaces `DashboardContext` and adds org-awareness:

```typescript
interface OrgConfig {
  id: string;           // Document ID = slug
  name: string;
  slug: string;
  theme: ThemeTokens;   // The 6-token theme from Phase 1
  logo: string;
  logoAlt: string;
  appTitle: string;
  merchants: BrandMerchant[];
  settings: OrgSettings;
  status: string;
}

interface OrgContextValue {
  org: OrgConfig;
  activeMerchant: BrandMerchant | "combined";
  setActiveMerchant: (m: BrandMerchant | "combined") => void;
  dateRange: DateRange;
  setDateRange: (dr: DateRange) => void;
  lastSynced: string | null;
  dataVersion: number;
  bumpDataVersion: () => void;
}
```

**Migration path:**
- Every component that imports `useDashboard()` switches to `useOrg()`
- The `brand` field becomes `activeMerchant.feefoMerchantId` for Firestore queries
- The "combined" option queries all merchants in the org

#### 1.5e. Update CI/CD Pipeline

**File:** `.github/workflows/firebase-deploy.yml`

The deployment command changes from:
```yaml
firebase deploy --project feefo-reviews --only functions,hosting
```

To (for Firebase App Hosting):
```yaml
# Firebase App Hosting deploys automatically on git push when connected,
# OR use the CLI:
firebase apphosting:backends:create --project feefo-reviews
```

**Note:** Firebase App Hosting uses a `apphosting.yaml` file in the repo root for configuration. See the manual setup instructions document for Firebase Console steps.

**New file:** `apphosting.yaml` (repo root)
```yaml
runConfig:
  minInstances: 0
  maxInstances: 10
  concurrency: 80
  cpu: 1
  memoryMiB: 512
env:
  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
    value: feefo-reviews
  - variable: NEXT_PUBLIC_FIREBASE_API_KEY
    value: AIzaSyDNU-M25IlolRoaWFCgdRWMJ5e6b08oIMU
  - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    value: feefo-reviews.firebaseapp.com
  - variable: NEXT_PUBLIC_FUNCTIONS_URL
    value: https://us-central1-feefo-reviews.cloudfunctions.net
```

#### 1.5f. Update theme-init.js for Multi-Tenant

**File:** `app/public/theme-init.js`

The current script only handles light/dark mode. No changes needed to `theme-init.js` itself.

**Theme loading strategy:** The `[orgSlug]/layout.tsx` fetches the org's public profile (`org_profiles/{orgId}`) which includes theme tokens. This fetch does NOT require auth (the `org_profiles` collection is publicly readable). The layout injects the 6 theme tokens as CSS variables via an inline `<style>` tag in the server-rendered HTML, preventing flash-of-wrong-theme.

The `AuthGate` component (rendered inside the layout) handles authentication. If the user is not authenticated, they see the login page styled with the org's theme. If authenticated but not a member of this org, they are redirected to `/access-denied`.

#### 1.5g. Update firebase.json

**File:** `firebase.json`

Remove the `hosting` section (Firebase App Hosting manages this separately):

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "codebase": "default",
    "predeploy": [
      "npm --prefix shared run build",
      "node scripts/copy-shared.js",
      "npm --prefix functions run build"
    ]
  }
}
```

### Key Files (Phase 1.5)

| File | Action | Purpose |
|---|---|---|
| `app/next.config.ts` | Modify | Remove `output: "export"` |
| `app/src/app/[orgSlug]/layout.tsx` | Create | Org-scoped layout with theme injection |
| `app/src/app/[orgSlug]/page.tsx` | Move | Dashboard overview (from `app/src/app/page.tsx`) |
| `app/src/app/[orgSlug]/reviews/page.tsx` | Move | Reviews explorer |
| `app/src/app/[orgSlug]/itineraries/page.tsx` | Move | Itineraries page |
| `app/src/app/[orgSlug]/ships/page.tsx` | Move | Ships page |
| `app/src/app/[orgSlug]/admin/page.tsx` | Move | Admin page |
| `app/src/app/[orgSlug]/admin/logs/page.tsx` | Move | Admin logs page |
| `app/src/app/page.tsx` | Rewrite | Login / org picker landing page |
| `app/src/app/access-denied/page.tsx` | Create | No-org-membership error page |
| `app/src/app/layout.tsx` | Modify | Slim down (remove org-specific providers) |
| `app/src/middleware.ts` | Create | Path-based tenant resolution |
| `app/src/contexts/OrgContext.tsx` | Create | Replace DashboardContext with org-aware context |
| `app/src/contexts/DashboardContext.tsx` | Delete | Replaced by OrgContext |
| `apphosting.yaml` | Create | Firebase App Hosting configuration |
| `firebase.json` | Modify | Remove `hosting` section |
| `.github/workflows/firebase-deploy.yml` | Modify | Update deployment commands |

### Risks & Mitigations (Phase 1.5)

| Risk | Impact | Mitigation |
|---|---|---|
| Firebase App Hosting is newer, less mature | Medium | Test thoroughly in staging. Fallback: deploy to Vercel, keep Firestore/Functions on Firebase |
| Breaking all existing URLs | High | Add redirect: `/{old-path}` -> `/uniworld-journeys/{old-path}` in middleware during transition |
| Cold start latency (Cloud Run) | Low | Set `minInstances: 1` in `apphosting.yaml` if needed (adds cost) |
| DashboardContext -> OrgContext migration breaks components | Medium | Mechanical rename; all component interfaces stay the same. Add `useDashboard()` as deprecated alias initially |

---

## Phase 2: Firestore Data Model, Security Rules & Data Migration

**Status:** Not started
**Depends on:** Phase 1.5 complete
**Priority:** CRITICAL - Data isolation must be in place before any multi-org features
**Estimated effort:** Large (5-8 days)

### Why This Phase Exists (New in v2)

The v1 roadmap deferred security rules to Phase 4 and didn't address data migration or credential storage. These are foundational requirements that must be in place before building any UI that reads/writes org-scoped data.

### Scope

1. **Create the `organizations/` Firestore collection** with the data model above
2. **Write and deploy tenant-scoped security rules** that enforce data isolation
3. **Migrate existing Uniworld data** from top-level collections to `organizations/uniworld-journeys/`
4. **Set up encrypted Feefo credential storage** using Google Cloud Secret Manager
5. **Make Cloud Functions tenant-aware** (sync, classification, mappings)
6. **Create a seed script** for the initial Uniworld organization document

### 2a. Firestore Security Rules

**File:** `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ─── Helpers ───────────────────────────────────────────
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOrgMember(orgId) {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/organizations/$(orgId)/users/$(request.auth.uid));
    }

    function getOrgUser(orgId) {
      return get(/databases/$(database)/documents/organizations/$(orgId)/users/$(request.auth.uid));
    }

    function isOrgAdmin(orgId) {
      return isOrgMember(orgId) &&
        getOrgUser(orgId).data.role in ["admin", "owner"];
    }

    function isOrgOwner(orgId) {
      return isOrgMember(orgId) &&
        getOrgUser(orgId).data.role == "owner";
    }

    function isSuperAdmin() {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/super_admins/$(request.auth.uid));
    }

    // ─── Organization Config ──────────────────────────────
    match /organizations/{orgId} {
      // Members can read org config; all writes via Cloud Functions/Admin SDK only
      allow read: if isOrgMember(orgId) || isSuperAdmin();
      allow write: if false; // Admin SDK only — prevents unvalidated field mutations

      // ─── Users subcollection ────────────────────────────
      match /users/{userId} {
        allow read: if isOrgMember(orgId) || isSuperAdmin();
        allow write: if false; // Admin SDK only — role changes, invites, removals go through Cloud Functions
      }

      // ─── Invites subcollection (email-keyed) ───────────
      match /invites/{email} {
        allow read: if isOrgAdmin(orgId) || isSuperAdmin();
        allow write: if false; // Admin SDK only
      }

      // ─── Credentials subcollection ──────────────────────
      match /credentials/{credId} {
        // NO client reads — credentials only accessed via Admin SDK in Cloud Functions
        allow read, write: if false;
      }

      // ─── Reviews (read by members, write only via Admin SDK) ─
      match /reviews/{reviewId} {
        allow read: if isOrgMember(orgId) || isSuperAdmin();
        allow write: if false;
      }

      // ─── Summaries ──────────────────────────────────────
      match /summaries/{summaryId} {
        allow read: if isOrgMember(orgId) || isSuperAdmin();
        allow write: if false;
      }

      // ─── Monthly summaries ──────────────────────────────
      match /monthly_summaries/{docId} {
        allow read: if isOrgMember(orgId) || isSuperAdmin();
        allow write: if false;
      }

      // ─── Sync metadata ─────────────────────────────────
      match /sync_meta/{merchantId} {
        allow read: if isOrgMember(orgId) || isSuperAdmin();
        allow write: if false;
      }

      // ─── Itinerary mappings ─────────────────────────────
      match /itinerary_mappings/{mappingId} {
        allow read: if isOrgMember(orgId) || isSuperAdmin();
        allow create, update: if isOrgAdmin(orgId);
        allow delete: if isOrgAdmin(orgId);
      }

      // ─── Operation logs ─────────────────────────────────
      match /operation_logs/{logId} {
        allow read: if isOrgAdmin(orgId) || isSuperAdmin();
        allow write: if false;
      }
    }

    // ─── Platform-level collections ───────────────────────
    match /platform/{docId} {
      allow read: if isSuperAdmin();
      allow write: if false; // Admin SDK only
    }

    match /super_admins/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow write: if false; // Admin SDK only
    }

    // ─── Public org profiles (pre-auth branding) ──────────
    match /org_profiles/{orgId} {
      allow read: if true; // Public — name, logo, theme only
      allow write: if false; // Admin SDK only (synced from org config)
    }

    // ─── User-to-org mapping ──────────────────────────────
    match /user_org_map/{userId} {
      allow read: if isAuthenticated() && request.auth.uid == userId;
      allow write: if false; // Admin SDK only (maintained by triggers)
    }

    // ─── Legacy collections (read-only during migration) ──
    // CRITICAL: Remove or restrict to super-admin BEFORE onboarding org #2.
    // These rules allow any authenticated user to read all legacy data,
    // which breaks tenant isolation once a second org exists.
    match /reviews/{reviewId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }
    match /summaries/{summaryId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }
    match /monthly_summaries/{docId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }
    match /sync_meta/{brandId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }
    match /itinerary_mappings/{mappingId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    // ─── Deny everything else ─────────────────────────────
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**CRITICAL NOTES:**
- The `credentials` subcollection has `allow read, write: if false` — Feefo API secrets are ONLY accessed via Cloud Functions using the Firebase Admin SDK (which bypasses security rules)
- Legacy top-level collection rules remain during migration but should be removed once migration is verified complete
- `isSuperAdmin()` requires a document in `super_admins/{uid}` — this must be manually created in the Firebase Console for the initial platform admin

### 2b. Data Migration Script

**File:** `scripts/migrate-to-multi-tenant.ts`

A one-time Node.js script (run locally or as a Cloud Function) that:

1. Creates the `organizations/uniworld-journeys` document with current config
2. Copies all documents from `reviews/` to `organizations/uniworld-journeys/reviews/`
3. Copies `summaries/` to `organizations/uniworld-journeys/summaries/`
4. Copies `monthly_summaries/` to `organizations/uniworld-journeys/monthly_summaries/`
5. Copies `sync_meta/` to `organizations/uniworld-journeys/sync_meta/`
6. Copies `itinerary_mappings/` to `organizations/uniworld-journeys/itinerary_mappings/`
7. Copies `admin_users/` to `organizations/uniworld-journeys/users/` (mapping email -> uid, role)
8. Copies `operation_logs/` to `organizations/uniworld-journeys/operation_logs/`
9. Creates `super_admins/{uid}` for the initial super-admin
10. Writes a migration log with counts and status

**Migration strategy:**
- Use Firestore `bulkWriter` for efficient batch writes
- Run in "dry run" mode first (logs what it would do, no writes)
- Preserve all document IDs where possible
- Do NOT delete original collections (keep as read-only backup)
- After verification, update Cloud Functions and queries to read from new paths
- After 30 days of stable operation, delete legacy collections

**Cutover plan (prevents data divergence):**
1. Announce a maintenance window (30-60 minutes)
2. **Pause the sync scheduler** — disable the `dailySync` Cloud Function in Firebase Console
3. Run migration script in dry-run mode, verify counts
4. Run migration for real
5. Deploy updated Cloud Functions that read/write from `organizations/{orgId}/` paths
6. Deploy updated frontend that queries new paths
7. **Resume the sync scheduler**
8. Verify: trigger a manual sync, confirm reviews appear in new paths
9. Legacy collections remain as read-only backup for 30 days

### 2c. Feefo Credential Storage (Google Cloud Secret Manager)

**Current state:** Feefo OAuth credentials stored as environment variables (`FEEFO_UNIWORLD_CLIENT_ID`, etc.) in Cloud Functions runtime.

**Problem:** Can't add credentials for new orgs without redeploying Cloud Functions.

**Solution:** Store credentials in Google Cloud Secret Manager. Firestore holds only metadata (status, last verified); actual secrets live in Secret Manager.

**Architecture:**

1. Org admin enters Feefo credentials in Settings UI (Phase 3)
2. Frontend sends credentials to a Cloud Function endpoint
3. Cloud Function stores them in Secret Manager:
   - `projects/feefo-reviews/secrets/org-{orgId}-feefo-client-id`
   - `projects/feefo-reviews/secrets/org-{orgId}-feefo-client-secret`
4. Cloud Function writes metadata to `organizations/{orgId}/credentials/feefo`
5. Sync function reads secrets from Secret Manager at runtime
6. Uses credentials to call Feefo API

**Cloud Function for credential management:**

```typescript
// functions/src/credentials.ts
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const secretClient = new SecretManagerServiceClient();
const PROJECT_ID = "feefo-reviews";

export async function storeOrgSecret(orgId: string, name: string, value: string): Promise<string> {
  const secretId = `org-${orgId}-feefo-${name}`;
  const parent = `projects/${PROJECT_ID}`;

  // Create secret if it doesn't exist, then add a version
  try {
    await secretClient.createSecret({ parent, secretId, secret: { replication: { automatic: {} } } });
  } catch (err: any) {
    if (err.code !== 6) throw err; // 6 = ALREADY_EXISTS
  }

  const [version] = await secretClient.addSecretVersion({
    parent: `${parent}/secrets/${secretId}`,
    payload: { data: Buffer.from(value) },
  });

  return version.name!;
}

export async function getOrgSecret(orgId: string, name: string): Promise<string> {
  const secretId = `org-${orgId}-feefo-${name}`;
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${secretId}/versions/latest`,
  });
  return version.payload!.data!.toString();
}
```

**Feefo credential assumption:** The plan assumes a single Feefo credential pair (client ID + client secret) works across all merchant IDs within one org. If different merchants require different OAuth credentials, secrets should be stored at the merchant-connection level: `org-{orgId}-merchant-{merchantId}-feefo-client-id`. Validate this with Feefo documentation before implementation.

**For Uniworld migration:** The migration script reads current env vars and stores them in Secret Manager, then writes metadata references to `organizations/uniworld-journeys/credentials/feefo`.

### 2d. Tenant-Aware Cloud Functions

All Cloud Functions must be updated to work with the new `organizations/` collection structure.

**Sync scheduler (`functions/src/sync/`):**

```typescript
// Current: hardcoded brands
const BRANDS = ["uniworld", "luxury-gold"];

// New: dynamic org iteration
async function syncAllOrganizations() {
  const orgsSnapshot = await admin.firestore()
    .collection("organizations")
    .where("status", "==", "active")
    .get();

  for (const orgDoc of orgsSnapshot.docs) {
    const orgId = orgDoc.id;
    const org = orgDoc.data();

    // Get decrypted credentials
    const credDoc = await admin.firestore()
      .doc(`organizations/${orgId}/credentials/feefo`)
      .get();

    if (!credDoc.exists) {
      console.warn(`No Feefo credentials for org: ${orgId}`);
      continue;
    }

    const clientId = await decryptCredential(credDoc.data()!.clientId);
    const clientSecret = await decryptCredential(credDoc.data()!.clientSecret);

    // Sync each merchant
    for (const merchant of org.merchants) {
      await syncMerchant(orgId, merchant.feefoMerchantId, clientId, clientSecret);
    }
  }
}
```

**Scaling to 50+ orgs (Cloud Tasks fan-out):**

The sequential loop above works for a small number of orgs but will hit Cloud Function timeout limits (540s) and Feefo API rate limits at scale. For production with 50+ orgs:

1. The `syncScheduler` function enqueues one Cloud Task per organization
2. Each task runs as a separate Cloud Function invocation with its own timeout
3. Tasks include a configurable delay between orgs to respect Feefo rate limits
4. Failed tasks retry independently without blocking other orgs

```typescript
// Scalable sync scheduler using Cloud Tasks
import { CloudTasksClient } from "@google-cloud/tasks";

async function enqueueSyncTasks() {
  const tasksClient = new CloudTasksClient();
  const queue = `projects/feefo-reviews/locations/us-central1/queues/feefo-sync`;

  const orgsSnapshot = await admin.firestore()
    .collection("organizations")
    .where("status", "==", "active")
    .get();

  for (let i = 0; i < orgsSnapshot.docs.length; i++) {
    const orgId = orgsSnapshot.docs[i].id;
    await tasksClient.createTask({
      parent: queue,
      task: {
        httpRequest: {
          url: `https://us-central1-feefo-reviews.cloudfunctions.net/syncOrg`,
          body: Buffer.from(JSON.stringify({ orgId })).toString("base64"),
          headers: { "Content-Type": "application/json" },
        },
        // Stagger tasks by 30 seconds to avoid Feefo rate limits
        scheduleTime: { seconds: Math.floor(Date.now() / 1000) + (i * 30) },
      },
    });
  }
}
```

**Manual sync endpoint:**
- Validates the requesting user is an admin of the specified org
- Only syncs that org's merchants

**Batch classify endpoint:**
- Scoped to a single org
- Reads reviews from `organizations/{orgId}/reviews/`
- Writes classifications back to same subcollection

**All Firestore paths updated:**
| Current Path | New Path |
|---|---|
| `reviews/{reviewId}` | `organizations/{orgId}/reviews/{reviewId}` |
| `summaries/{scope}` | `organizations/{orgId}/summaries/{scope}` |
| `monthly_summaries/{docId}` | `organizations/{orgId}/monthly_summaries/{docId}` |
| `sync_meta/{brandId}` | `organizations/{orgId}/sync_meta/{merchantId}` |
| `itinerary_mappings/{id}` | `organizations/{orgId}/itinerary_mappings/{id}` |
| `operation_logs/{id}` | `organizations/{orgId}/operation_logs/{id}` |
| `admin_users/{id}` | `organizations/{orgId}/users/{uid}` |

### 2e. Client-Side Firestore Query Updates

**File:** `app/src/lib/firestore/queries.ts`

All queries must be updated to include the `orgId` path prefix. Example:

```typescript
// Current
export async function getFleetSummary(brand: Brand) {
  const db = getClientDb();
  const docRef = doc(db, "summaries", brand);
  ...
}

// New
export async function getFleetSummary(orgId: string, merchantId: string) {
  const db = getClientDb();
  // Summary doc ID follows compound key: "{merchantId}" for fleet summaries
  // Ship summaries: "{merchantId}_ship_{slug}", Itinerary: "{merchantId}_itinerary_{slug}"
  const docRef = doc(db, "organizations", orgId, "summaries", merchantId);
  ...
}
```

Every query function gains an `orgId` parameter. The `OrgContext` provides the current `orgId` to all components.

### Key Files (Phase 2)

| File | Action | Purpose |
|---|---|---|
| `firestore.rules` | Rewrite | Tenant-scoped security rules |
| `firestore.indexes.json` | Update | Add indexes for new collection paths |
| `scripts/migrate-to-multi-tenant.ts` | Create | One-time data migration |
| `functions/src/credentials.ts` | Create | KMS encrypt/decrypt helpers |
| `functions/src/sync/index.ts` | Modify | Tenant-aware sync scheduler |
| `functions/src/index.ts` | Modify | Update all endpoints for org-scoped paths |
| `shared/src/feefo/client.ts` | Modify | Accept credentials as params (not env vars) |
| `app/src/lib/firestore/queries.ts` | Modify | Add orgId to all query paths |
| `app/src/lib/firestore/admin-queries.ts` | Modify | Add orgId to all admin query paths |
| `app/src/lib/firestore/itinerary-queries.ts` | Modify | Add orgId to itinerary query paths |
| `app/src/lib/firestore/ship-queries.ts` | Modify | Add orgId to ship query paths |

### Risks & Mitigations (Phase 2)

| Risk | Impact | Mitigation |
|---|---|---|
| Security rule bugs leak data across orgs | CRITICAL | Write comprehensive rule tests using Firebase Emulator. Test: member reads own org (pass), member reads other org (deny), unauthenticated reads (deny), credential reads (deny) |
| Data migration corrupts or loses data | HIGH | Dry-run mode, preserve originals, verify counts match, keep legacy collections for 30 days |
| Cloud KMS adds latency to sync | LOW | Cache decrypted credentials in memory for the duration of a sync run (not across invocations) |
| Firestore composite index limits | MEDIUM | Plan indexes upfront. Firestore allows 200 composite indexes per database — track usage |

---

## Phase 3: Settings UI & Brand Configuration

**Status:** Not started
**Depends on:** Phase 2 complete (data model and security rules must exist)
**Estimated effort:** Medium (5-7 days)

### Scope

Build the `/[orgSlug]/settings` page where org admins configure their organization.

### Settings Page Sections

**3a. Theme Configuration**
- Color picker for each of the 6 brand tokens (primary, primaryDark, accent, accentLight, neutral, surfaceWarm)
- Live preview panel showing how the theme looks (header mock, card mock, chart mock)
- "Reset to default" button (resets to `defaultTheme` from Phase 1)
- Save persists to Firestore `organizations/{orgId}` (the `theme` field)
- Validation: warn if selected colors fail WCAG AA contrast checks (4.5:1 ratio)
- Changes trigger real-time re-derivation via existing `injectThemeTokens()` pipeline

**3b. Brand Identity**
- Logo upload (stored in Firebase Storage at `organizations/{orgId}/assets/logo`)
- App title text field (displayed in header)
- Logo alt text field
- Save updates `organizations/{orgId}` document

**3c. Merchant ID Management**
- List current merchants with labels and Feefo merchant IDs
- Add new merchant: Feefo merchant ID + display label + `showShips` toggle
- Remove merchant (with confirmation dialog — does NOT delete synced data)
- Reorder merchants (drag-and-drop or up/down buttons)
- **Feefo API credential entry:** Client ID and Client Secret fields per org (not per merchant — Feefo uses one credential pair per account)
- "Verify Credentials" button: calls a Cloud Function that tests the credentials against the Feefo API
- Credentials are encrypted and stored via the Phase 2 credential system

**3d. General Settings**
- Default date range selector (last 30 days, last 90 days, last year, all time)
- Enabled pages checkboxes (overview, reviews, itineraries, ships, admin)
- Export format preference (CSV, XLSX)

### Implementation Notes

- `/[orgSlug]/settings` page gated by `role: "admin"` or `role: "owner"` from `OrgContext`
- Settings nav link only visible to admins (same visibility pattern as current Admin page)
- `OrgContext` already holds the org config fetched from Firestore — settings page writes back to the same document
- Theme token changes immediately update CSS variables in the current session via `injectThemeTokens()`
- Logo upload uses Firebase Storage with org-scoped paths and org-scoped storage rules

### Key Files (Phase 3)

| File | Action | Purpose |
|---|---|---|
| `app/src/app/[orgSlug]/settings/page.tsx` | Create | Settings page shell with tabbed sections |
| `app/src/components/settings/ThemeConfigurator.tsx` | Create | Color pickers + live preview |
| `app/src/components/settings/BrandIdentityForm.tsx` | Create | Logo upload + app title |
| `app/src/components/settings/MerchantManager.tsx` | Create | CRUD for merchant IDs + credentials |
| `app/src/components/settings/GeneralSettings.tsx` | Create | Toggles and preferences |
| `app/src/lib/firestore/org-queries.ts` | Create | Firestore read/write for org config |
| `storage.rules` | Create | Firebase Storage rules for org-scoped uploads |

---

## Phase 4: User Management & Auth Refinement

**Status:** Not started
**Depends on:** Phase 3 complete
**Estimated effort:** Large (5-8 days)

### Scope

Formalize user-to-org mapping, role management, and the auth flow for multi-org scenarios.

### Auth Flow (Updated for Multi-Tenant)

```
User visits /
  → Not authenticated?
    → Show login page with "Sign In with Microsoft"
    → After SSO: query Firestore for all orgs where this user exists
      → 0 orgs: redirect to /access-denied
      → 1 org: redirect to /{orgSlug}/
      → 2+ orgs: show org picker, user chooses, redirect to /{orgSlug}/

User visits /{orgSlug}/...
  → Not authenticated? Redirect to /
  → Authenticated but not a member of this org? Redirect to /access-denied
  → Authenticated and member: load org config, show dashboard
```

### User-to-Org Lookup

When a user logs in, the app needs to find which org(s) they belong to. Firestore doesn't support querying across subcollections efficiently, so we need a **user-to-org mapping collection**:

```
user_org_map/
  {uid}/
    orgs: [
      { orgId: "uniworld-journeys", role: "admin" },
      { orgId: "acme-travel", role: "viewer" }
    ]
    primaryOrgId: "uniworld-journeys"    ← Default org for redirect
    updatedAt: timestamp
```

This collection is maintained by Cloud Functions with Firestore triggers on `organizations/{orgId}/users/{uid}`:
- **onCreate:** Add the org to `user_org_map/{uid}.orgs`
- **onUpdate:** Sync role changes to `user_org_map/{uid}.orgs`
- **onDelete:** Remove the org from `user_org_map/{uid}.orgs`
- **Repair function:** A manually-triggered Cloud Function that rebuilds `user_org_map` from all `organizations/*/users/*` documents in case of trigger failures or drift

### User Management UI (in Settings)

- **Invite user:** Admin enters email, selects role (viewer/admin). Cloud Function creates the user document in `organizations/{orgId}/users/{uid}` and updates `user_org_map/{uid}`.
- **Remove user:** Admin removes user from org. Cloud Function cleans up both collections.
- **Change role:** Admin promotes viewer to admin, or demotes admin to viewer. Owner role can only be transferred, not granted additively.
- **Self-service:** Users cannot change their own role.
- **Transfer ownership:** Owner can transfer ownership to another admin (one owner per org).

### Roles & Permissions

| Role | View Dashboard | Edit Settings | Manage Users | Manage Org | Delete Org |
|---|---|---|---|---|---|
| viewer | Yes | No | No | No | No |
| admin | Yes | Yes | Yes (not owners) | No | No |
| owner | Yes | Yes | Yes (all) | Yes | Yes |
| super_admin | Yes (all orgs) | Yes (all orgs) | Yes (all orgs) | Yes | Yes |

### Key Files (Phase 4)

| File | Action | Purpose |
|---|---|---|
| `app/src/components/settings/UserManager.tsx` | Create | Add/remove/role-manage users |
| `app/src/app/[orgSlug]/settings/users/page.tsx` | Create | User management settings tab |
| `app/src/app/access-denied/page.tsx` | Update | Better messaging, "request access" option |
| `app/src/app/page.tsx` | Update | Add org picker for multi-org users |
| `app/src/lib/auth/user-org-mapping.ts` | Create | Query user's org membership |
| `functions/src/user-management.ts` | Create | Cloud Functions for user CRUD + org-map sync |
| `firestore.rules` | Update | Add `user_org_map` rules |

---

## Phase 5: Organization Onboarding

**Status:** Future
**Depends on:** Phase 4 complete
**Estimated effort:** Medium-Large (5-8 days)

### Scope

Enable new organizations to be added to the platform. Start with admin-provisioned, then add self-service.

### Phase 5a: Admin-Provisioned Onboarding

A super-admin creates new organizations via a `/platform-admin` page:

1. Enter organization name and slug (URL path)
2. System validates slug uniqueness against Firestore
3. Creates `organizations/{slug}` document with default theme
4. Adds initial admin user by email
5. Admin receives notification and can configure theme, merchants, credentials via Settings

**Super-admin page route:** `/platform-admin` (outside the `[orgSlug]` tree)

### Phase 5b: Self-Service Onboarding (Future)

Public sign-up wizard accessible from the root login page:

```
Step 1: "Create Your Organization"
  → Organization name, slug (auto-generated from name, editable)
  → Admin's email (pre-filled from SSO)

Step 2: "Connect Your Feefo Account"
  → Enter Feefo Client ID and Client Secret
  → "Verify" button tests credentials
  → Enter merchant ID(s) with labels

Step 3: "Customize Your Brand" (optional, can skip)
  → 6-token theme picker with live preview
  → Logo upload
  → App title

Step 4: "Invite Your Team" (optional, can skip)
  → Email addresses + roles
  → Sends invitation emails

Step 5: "You're All Set!"
  → Redirect to /{orgSlug}/
  → First sync triggered automatically
```

### Key Considerations

- **Slug uniqueness:** Validate against `organizations/` collection before creation
- **Reserved slugs:** Block `admin`, `platform-admin`, `api`, `access-denied`, `settings`, `_next`, etc.
- **Rate limiting:** Prevent abuse of self-service sign-up (consider requiring email verification)
- **Billing:** Out of scope for this plan. Can be added as Phase 6.

### Key Files (Phase 5)

| File | Action | Purpose |
|---|---|---|
| `app/src/app/platform-admin/page.tsx` | Create | Super-admin org management |
| `app/src/app/platform-admin/layout.tsx` | Create | Super-admin auth gate |
| `app/src/components/platform/CreateOrgWizard.tsx` | Create | Org creation form |
| `app/src/app/onboard/page.tsx` | Create | Self-service sign-up wizard (5b) |
| `functions/src/org-provisioning.ts` | Create | Cloud Function for org creation |

---

## Estimated Complexity & Timeline

| Phase | Scope | Effort | Key Risk |
|---|---|---|---|
| Phase 1 | Complete | -- | -- |
| Phase 1.5 | Medium — hosting migration, route restructure | 3-5 days | Firebase App Hosting maturity, breaking existing URLs |
| Phase 2 | Large — data model, security rules, migration, credential storage | 5-8 days | Security rule correctness, data migration integrity |
| Phase 3 | Medium — CRUD UI + Firestore integration | 5-7 days | Live preview performance, credential verification UX |
| Phase 4 | Large — auth flow, user management, multi-org | 5-8 days | User-org mapping consistency, role permission edge cases |
| Phase 5 | Medium-Large — provisioning UI + self-service | 5-8 days | Slug uniqueness race conditions, credential verification |

**Total estimated:** 23-36 days of engineering effort

---

## Design Principles (All Phases)

1. **Organization = tenant** — An organization is the unit of isolation for data, theme, settings, and users
2. **Slugs are immutable** — The org slug is the Firestore document ID and appears in URLs. It cannot be changed after creation. If an org needs a different URL, set up a redirect rather than renaming the document (which would require copying the entire subcollection tree).
3. **Path-based routing** — `/{orgSlug}/...` for all tenant-scoped pages. Single domain, zero DNS management.
4. **Login determines org** — No org selection within the dashboard; the authenticated user's org mapping controls everything. Multi-org users get a picker at login.
5. **Merchant switcher for data scope** — Within an org, the merchant switcher filters which Feefo data is displayed
6. **Semantic tokens over hardcoded values** — Every color references a semantic CSS variable derived from the org's 6 theme tokens
7. **Derive, don't duplicate** — Dark mode and variant colors are computed from 6 tokens, not manually specified
8. **Credentials never in client** — Feefo API secrets stored encrypted in Firestore, accessed only via Admin SDK in Cloud Functions
9. **Security rules from day one** — Tenant isolation enforced at the Firestore level, not just the application level
10. **Progressive enhancement** — Each phase builds on the last; the app works at every stage
11. **WCAG AA compliance** — All text/background combinations must meet 4.5:1 contrast ratio
12. **Mobile-first** — Responsive behavior is a first-class concern
