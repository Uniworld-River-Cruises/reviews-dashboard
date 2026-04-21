# Multi-Tenant Platform Roadmap

**Date:** 2026-04-02
**Status:** Planning
**Overview:** Transform the Feefo Reviews dashboard from a single-brand tool into a multi-tenant platform where each brand has its own theme, settings, users, and Feefo merchant IDs.

---

## Architecture Vision

```
┌─────────────────────────────────────────────────────┐
│                    Application                       │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Brand Theme  │  │ Brand Config │  │ User Auth  │ │
│  │ (6 tokens)   │  │ (merchants,  │  │ (MS 365    │ │
│  │              │  │  settings,   │  │  SSO, role  │ │
│  │ Derives:     │  │  logo)       │  │  mapping)  │ │
│  │ - Light mode │  │              │  │            │ │
│  │ - Dark mode  │  │              │  │            │ │
│  │ - All CSS    │  │              │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │        │
│         └────────┬────────┘                │        │
│                  │                         │        │
│         ┌────────▼────────┐       ┌────────▼──────┐ │
│         │  BrandContext   │       │  AuthContext   │ │
│         │  (theme +       │◄──────│  (user →      │ │
│         │   config +      │       │   brand       │ │
│         │   merchants)    │       │   mapping)    │ │
│         └────────┬────────┘       └───────────────┘ │
│                  │                                   │
│         ┌────────▼────────┐                         │
│         │  Dashboard UI   │                         │
│         │  (themed,       │                         │
│         │   data-scoped   │                         │
│         │   per merchant) │                         │
│         └─────────────────┘                         │
└─────────────────────────────────────────────────────┘
```

### Data Model (Firestore)

```
brands/
  {brandId}/
    name: string
    theme: {
      primary: string
      primaryDark: string
      accent: string
      accentLight: string
      neutral: string
      surfaceWarm: string
    }
    logo: string (URL)
    logoAlt: string
    appTitle: string
    merchants: [
      { id: string, label: string, feefoMerchantId: string }
    ]
    settings: {
      defaultDateRange: string
      showShipsPage: boolean
      // ... extensible
    }
    createdAt: timestamp
    updatedAt: timestamp

brands/{brandId}/users/
  {userId}/
    email: string
    role: 'admin' | 'viewer'
    displayName: string
    addedAt: timestamp

brands/{brandId}/reviews/
  // ... existing review data structure, per merchant
```

---

## Phase 1: Theme Engine & UI Refresh (Current)

**Status:** Complete — see `2026-04-02-theme-engine-and-ui-refresh-phase1.md`

**Deliverables (all shipped):**
- Configurable 6-token theme system with programmatic derivation (`src/lib/theme/`)
- Uniworld Journeys brand applied as first theme (`src/config/brands/uniworld-journeys.ts`)
- Brand-aware dark mode (derived from same 6 tokens)
- Consolidated single-bar header with inline navigation
- Mobile hamburger drawer (with admin-access-gated admin link)
- Full CSS variable migration (no hardcoded colors in any component)
- Responsive improvements (mobile chart theming, `useThemeColors` hook for Recharts)
- Default/vanilla fallback theme (`defaultTheme` in `src/lib/theme/tokens.ts`)

**Key Phase 1 architecture decisions that affect Phase 2:**

- Brand config lives in `src/config/brands/index.ts`. The active brand is set via
  `ACTIVE_BRAND_ID = "uniworld-journeys"`. The **only change needed in Phase 2**
  is replacing `getActiveBrandConfig()` with a Firestore fetch — `BrandContext`
  and all consumers remain unchanged.
- `BrandMerchant` has a `showShips?: boolean` flag per merchant (not a global brand
  toggle). The Phase 2 Settings UI should expose this at the merchant level, not as
  a single brand-wide switch.
- The `id` field on `BrandMerchant` doubles as the Feefo merchant ID (the value
  passed to Firestore queries). The Firestore data model below shows a separate
  `feefoMerchantId` field — Phase 2 should reconcile these (likely rename `id` →
  `feefoMerchantId` in the Firestore doc and map back in `BrandContext`).

---

## Phase 2: Settings UI & Brand Configuration

**Status:** Not started
**Depends on:** Phase 1 complete ✓

### Scope

Build the `/settings` page where brand admins can configure their brand.

### Settings Page Sections

**2a. Theme Configuration**
- Color picker for each of the 6 brand tokens
- Live preview panel showing how the theme looks (header, card, chart sample)
- "Reset to default" button
- Save persists to Firestore `brands/{brandId}/theme`
- Validation: warn if selected colors fail WCAG AA contrast checks

**2b. Brand Identity**
- Logo upload (stored in Firebase Storage, URL saved to brand doc)
- App title text field
- Logo alt text field

**2c. Merchant ID Management**
- List current merchants with labels
- Add new merchant: Feefo merchant ID + display label
- Remove merchant (with confirmation — does not delete data)
- Reorder merchants (drag or up/down)
- Each merchant's Feefo API credentials (if applicable)

**2d. General Settings**
- Default date range (last 30 days, last 90 days, last year, all time)
- Show/hide Ships page toggle — note: in Phase 1 this is a per-merchant flag
  (`BrandMerchant.showShips`), not a global setting. The UI should expose it
  per merchant in section 2c, not here as a brand-wide switch.
- Show/hide specific dashboard sections
- Export settings (CSV format preferences, etc.)

### Implementation Notes

- `/settings` page gated by `role: 'admin'` permission
- Settings nav item only visible to admins (same pattern as current Admin page)
- **BrandContext migration:** Replace `getActiveBrandConfig()` in
  `src/config/brands/index.ts` with a Firestore fetch for the authenticated
  user's brand document. No other changes to BrandContext or any component.
- Changes to theme tokens trigger real-time re-derivation and CSS injection
  via the existing `injectThemeTokens()` pipeline — no new wiring needed.
- Logo upload uses Firebase Storage with brand-scoped paths
- `public/theme-init.js` (pre-hydration flash prevention) currently has
  Uniworld tokens baked in. Phase 2 should update this to either: (a) fetch
  brand tokens before first paint via a small inline script, or (b) accept
  a brief flash on first load for non-Uniworld tenants until React hydrates.

### Key Files

| File | Purpose |
|---|---|
| `src/app/settings/page.tsx` | Settings page with tabbed sections |
| `src/components/settings/ThemeConfigurator.tsx` | Color pickers + live preview |
| `src/components/settings/BrandIdentityForm.tsx` | Logo upload + app title |
| `src/components/settings/MerchantManager.tsx` | CRUD for merchant IDs |
| `src/components/settings/GeneralSettings.tsx` | Toggles and preferences |
| `src/lib/firestore/brand-queries.ts` | Firestore read/write for brand config |

---

## Phase 3: Microsoft 365 SSO & User-to-Brand Mapping

**Status:** Not started
**Depends on:** Phase 2 complete
**Related doc:** `project_auth.md` in memory

### Scope

Replace the current auth system with Microsoft 365 SSO. Map authenticated users to their brand, which determines the theme and data they see.

### Auth Flow

```
User visits app
  → Redirected to Microsoft 365 login
  → Authenticated, receives user profile (email, name, etc.)
  → App queries Firestore: which brand does this user belong to?
    → brands/{brandId}/users/{userId} exists?
      → Yes: Load brand config, apply theme, show dashboard
      → No: Show "Access Denied" or "Contact your admin" page
```

### User Management (in Settings)

- **Add user:** Admin enters email, selects role (admin/viewer)
- **Remove user:** Admin removes user from brand
- **Role management:** Admin can promote viewer → admin or demote
- **Self-service:** Users cannot change their own role
- **Super-admin concept (optional):** A platform-level admin who can manage all brands (likely just a Firestore flag, not a full UI in Phase 3)

### Implementation Notes

- Use `@azure/msal-browser` or `next-auth` with Microsoft Entra ID provider
- AuthGate component updated to check brand membership after SSO
- BrandContext loads based on authenticated user's brand mapping
- Current email/password auth (if any) removed or kept as fallback during transition
- Session management: JWT or Firebase custom token after SSO validation

### Key Files

| File | Purpose |
|---|---|
| `src/lib/auth/msal.ts` | MSAL configuration and initialization |
| `src/lib/auth/user-brand-mapping.ts` | Query user's brand from Firestore |
| `src/components/layout/AuthGate.tsx` | Updated: SSO flow + brand loading |
| `src/components/layout/AuthButton.tsx` | Updated: MS 365 profile, sign out |
| `src/components/settings/UserManager.tsx` | Add/remove/role-manage users |
| `src/app/access-denied/page.tsx` | Shown when user has no brand |

---

## Phase 4: Multi-Brand Onboarding

**Status:** Future
**Depends on:** Phase 3 complete

### Scope

Enable entirely new brands/companies to onboard onto the platform.

### Brand Provisioning

When a new brand signs up or is provisioned:
1. Create `brands/{brandId}` document with default theme
2. Configure their Feefo merchant ID(s)
3. Add initial admin user(s)
4. Brand admin customizes theme, logo, settings via Settings page
5. Brand admin invites their users

### Provisioning UI Options

**Option A: Self-service onboarding**
- Public sign-up flow for new brands
- Guided wizard: brand name → merchant IDs → theme → invite users
- Requires billing/subscription model (out of scope for this doc)

**Option B: Admin-provisioned**
- A platform super-admin creates new brands manually
- Super-admin dashboard (separate page or section)
- Simpler, appropriate if new brands are onboarded infrequently

**Recommendation:** Start with **Option B** — admin-provisioned. Build a minimal super-admin page where a platform admin can create a new brand, set initial config, and add the first admin user. Self-service can come later if the platform scales.

### Data Isolation

- Each brand's reviews, settings, and users are scoped under `brands/{brandId}/`
- Firestore security rules enforce that users can only read/write their own brand's data
- No cross-brand data access at the application or database level
- API routes (if added) must validate brand membership on every request

### Key Considerations

- **Firestore security rules:** Must be written/updated to enforce brand-level isolation
- **Firebase Storage:** Logo uploads scoped to `brands/{brandId}/assets/`
- **Algolia:** Search indices may need brand-scoping (prefix or separate index per brand)
- **Feefo API sync:** Cloud function needs to know which merchant IDs belong to which brand
- **Cost model:** Consider Firestore read/write costs as brands scale

---

## Phase Summary & Dependencies

```
Phase 1: Theme Engine & UI Refresh
  │ (no external dependencies)
  │
  ▼
Phase 2: Settings UI & Brand Configuration
  │ (depends on: Phase 1 theme system)
  │
  ▼
Phase 3: MS 365 SSO & User-to-Brand Mapping
  │ (depends on: Phase 2 user management UI)
  │ (depends on: Microsoft Entra ID app registration)
  │
  ▼
Phase 4: Multi-Brand Onboarding
  │ (depends on: Phase 3 auth system)
  │ (depends on: Firestore security rules)
```

### Estimated Complexity

| Phase | Scope | Key Risk |
|---|---|---|
| Phase 1 | Medium — mostly UI refactoring, token system | Getting derivation right for all edge cases (contrast, dark mode) |
| Phase 2 | Medium — CRUD UI + Firestore integration | Live preview performance, logo upload edge cases |
| Phase 3 | Large — SSO integration, auth flow rewrite | Microsoft Entra ID configuration, token refresh handling |
| Phase 4 | Medium — provisioning + security rules | Data isolation correctness, Firestore security rule complexity |

---

## Design Principles (All Phases)

1. **Semantic tokens over hardcoded values** — Every color in the UI references a semantic CSS variable, never a raw hex
2. **Derive, don't duplicate** — Dark mode and variant colors are computed from 6 tokens, not manually specified
3. **Brand = tenant** — A brand is the unit of isolation for data, theme, settings, and users
4. **Login determines brand** — No brand selection UI; the authenticated user's brand mapping controls everything
5. **Merchant switcher for data scope** — Within a brand, the merchant switcher filters which Feefo data is displayed
6. **Progressive enhancement** — Each phase builds on the last; the app works at every stage (Phase 1 has hardcoded config, Phase 2 adds UI, Phase 3 adds auth, Phase 4 adds onboarding)
7. **WCAG AA compliance** — All text/background combinations must meet 4.5:1 contrast ratio per the brand guide's ADA compliance chart
8. **Mobile-first** — Responsive behavior is a first-class concern, not an afterthought
