# Phase 1: Theme Engine & UI Refresh

**Date:** 2026-04-02
**Status:** Complete (Steps 1–5 implemented; Step 6 QA pending)
**Scope:** Build configurable theme engine, apply Uniworld Journeys brand, consolidate header/nav, responsive improvements

---

## Context

The Feefo Reviews dashboard is evolving from a single-brand tool (Uniworld/Luxury Gold) into a multi-tenant platform. Each brand/tenant will have its own theme, settings, logo, and one or more Feefo merchant IDs. Phase 1 lays the foundation by building the theme engine and applying the first brand theme (Uniworld Journeys), while also modernizing the header/navigation layout for better responsive behavior.

### Brand Background

- Uniworld is absorbing the Luxury Gold brand and rebranding to "Uniworld Journeys"
- Historical reviews remain split by Feefo merchant ID, so the merchant switcher must persist
- New brand identity designed by King & Partners (R6, March 2026)
- Palette is warm neutrals: Charcoal, Taupe, Willow, Parchment, Plaster, with restrained Gold accent

### Key Decisions Made

- **6 minimal tokens** per brand theme — all other colors derived programmatically
- **Brand-aware dark mode** — derived from the same 6 tokens, not configured separately
- **Consolidated single header bar** — header and nav merge into one row
- **Gold accent usage: relaxed** — allowed for tab indicators, star ratings, and badges (not just logo)
- **Typography: Geist Sans retained** — neutral, data-friendly, works across brands
- **Settings page (Phase 2)** — separate from Admin, handles brand config
- **Phase 1 scope** — theme engine + Uniworld reskin + responsive header; Settings UI and multi-tenant auth deferred

---

## 1. Theme Token System

### 1.1 Token Definitions

Create `src/lib/theme/tokens.ts`:

```typescript
export interface BrandTheme {
  id: string;
  name: string;
  // The 6 minimal configurable tokens
  tokens: {
    primary: string;       // Header bg, active states, primary actions
    primaryDark: string;   // Deepest tone — dark mode bg, strong emphasis
    accent: string;        // Tab indicators, star ratings, badges
    accentLight: string;   // Accent hover/glow states
    neutral: string;       // Mid-tone — secondary text, borders, muted UI
    surfaceWarm: string;   // Warm tint for backgrounds and surfaces
  };
  // Brand assets
  logo?: string;           // URL to logo image
  logoAlt?: string;        // Alt text for logo
  appTitle: string;        // Displayed in header (e.g., "Feefo Reviews")
  // Merchant IDs
  merchants: {
    id: string;
    label: string;         // Display name (e.g., "Uniworld", "Luxury Gold")
  }[];
}
```

### 1.2 Uniworld Journeys Theme

```typescript
export const uniworldJourneysTheme: BrandTheme = {
  id: 'uniworld-journeys',
  name: 'Uniworld Journeys',
  tokens: {
    primary: '#373535',       // Charcoal
    primaryDark: '#1E1C1C',   // Dark Charcoal
    accent: '#C2AB82',        // Gold (dark end of gradient)
    accentLight: '#E7D39C',   // Gold (light end of gradient)
    neutral: '#655E51',       // Taupe
    surfaceWarm: '#F1EEEA',   // Plaster
  },
  appTitle: 'Feefo Reviews',
  merchants: [
    { id: 'uniworld', label: 'Uniworld' },
    { id: 'luxury-gold', label: 'Luxury Gold' },
  ],
};
```

### 1.3 Default/Vanilla Theme

```typescript
export const defaultTheme: BrandTheme = {
  id: 'default',
  name: 'Default',
  tokens: {
    primary: '#1e293b',       // Slate 800
    primaryDark: '#0f172a',   // Slate 900
    accent: '#3b82f6',        // Blue 500
    accentLight: '#60a5fa',   // Blue 400
    neutral: '#64748b',       // Slate 500
    surfaceWarm: '#f8fafc',   // Slate 50
  },
  appTitle: 'Feefo Reviews',
  merchants: [],
};
```

### 1.4 Derivation Logic

Create `src/lib/theme/derive.ts`:

Takes the 6 brand tokens and produces a full set of CSS custom properties for both light and dark modes. Use CSS `color-mix()` for browser-native color manipulation where possible; fall back to JS hex manipulation for older browser support if needed.

**Light mode derivations:**

| CSS Variable | Derivation |
|---|---|
| `--background` | `surfaceWarm` |
| `--foreground` | `primary` |
| `--surface` | `#ffffff` |
| `--surface-hover` | `color-mix(in srgb, surfaceWarm 60%, white)` |
| `--surface-alt` | `color-mix(in srgb, surfaceWarm 80%, white)` |
| `--border` | `color-mix(in srgb, neutral 20%, transparent)` |
| `--border-light` | `color-mix(in srgb, neutral 10%, transparent)` |
| `--text-primary` | `primaryDark` |
| `--text-secondary` | `neutral` |
| `--text-tertiary` | `color-mix(in srgb, neutral 60%, surfaceWarm)` |
| `--header-bg` | `primary` |
| `--header-text` | `#ffffff` (or derive from contrast check against primary) |
| `--nav-active-text` | `primary` |
| `--nav-active-indicator` | `accent` |
| `--nav-inactive-text` | `neutral` |
| `--brand-accent` | `accent` |
| `--brand-accent-light` | `accentLight` |
| `--brand-accent-hover` | `color-mix(in srgb, accent 10%, transparent)` |
| `--brand-primary-hover` | `color-mix(in srgb, primary 5%, transparent)` |
| `--brand-primary-light` | `color-mix(in srgb, primary 10%, transparent)` |
| `--input-bg` | `#ffffff` |
| `--input-border` | `color-mix(in srgb, neutral 30%, surfaceWarm)` |
| `--badge-gray-bg` | `color-mix(in srgb, surfaceWarm 70%, neutral)` |
| `--badge-gray-text` | `neutral` |
| `--spinner-accent` | `accent` |
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| `--shadow` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` |

**Dark mode derivations:**

| CSS Variable | Derivation |
|---|---|
| `--background` | `primaryDark` |
| `--foreground` | `surfaceWarm` |
| `--surface` | `color-mix(in srgb, primaryDark 92%, surfaceWarm)` |
| `--surface-hover` | `color-mix(in srgb, primaryDark 85%, surfaceWarm)` |
| `--surface-alt` | `color-mix(in srgb, primaryDark 95%, surfaceWarm)` |
| `--border` | `color-mix(in srgb, primaryDark 75%, neutral)` |
| `--border-light` | `color-mix(in srgb, primaryDark 85%, neutral)` |
| `--text-primary` | `surfaceWarm` |
| `--text-secondary` | `color-mix(in srgb, neutral 40%, surfaceWarm)` |
| `--text-tertiary` | `neutral` |
| `--header-bg` | `primaryDark` |
| `--header-text` | `surfaceWarm` |
| `--nav-active-text` | `surfaceWarm` |
| `--nav-active-indicator` | `accent` |
| `--nav-inactive-text` | `color-mix(in srgb, surfaceWarm 60%, primaryDark)` |
| `--brand-accent` | `accentLight` (lighter variant for dark backgrounds) |
| `--brand-accent-light` | `accentLight` |
| `--brand-accent-hover` | `color-mix(in srgb, accentLight 10%, transparent)` |
| `--brand-primary-hover` | `color-mix(in srgb, accentLight 8%, transparent)` |
| `--brand-primary-light` | `color-mix(in srgb, accentLight 15%, transparent)` |
| `--input-bg` | `color-mix(in srgb, primaryDark 92%, surfaceWarm)` |
| `--input-border` | `color-mix(in srgb, primaryDark 65%, neutral)` |
| `--badge-gray-bg` | `color-mix(in srgb, primaryDark 80%, neutral)` |
| `--badge-gray-text` | `color-mix(in srgb, neutral 40%, surfaceWarm)` |
| `--spinner-accent` | `accentLight` |
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.3)` |
| `--shadow` | `0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.3)` |

### 1.5 Token Injection

Create `src/lib/theme/inject.ts`:

```typescript
export function injectThemeTokens(theme: BrandTheme, isDark: boolean): void {
  const vars = deriveTokens(theme.tokens, isDark);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
```

This runs:
- On initial app load (from BrandContext provider)
- When dark/light mode toggles
- The `theme-init.js` script should be updated to apply a minimal set of tokens before hydration to prevent flash

---

## 2. Consolidated Header & Navigation

### 2.1 New Header Layout

Rewrite `src/components/layout/Header.tsx` to be a single bar containing both branding and navigation.

**Desktop (lg+):**
```
┌──────────────────────────────────────────────────────────────────────┐
│ [Logo/Title]  Overview  Itineraries  Ships  Reviews  Admin  Settings │
│                                         [MerchantSwitcher] [DatePicker] [ThemeToggle] [Auth] │
└──────────────────────────────────────────────────────────────────────┘
```

- `height: 48-56px` (down from ~100px with two bars)
- Background: `var(--header-bg)`
- Text: `var(--header-text)`
- Max-width: `7xl` inner container (matches content area)
- Flexbox: logo + nav left, utilities right
- Active tab: `var(--nav-active-indicator)` underline (2px), `font-semibold`
- Inactive tab: `var(--header-text)` at 60% opacity, hover to 80%

**Tablet (md):**
- Same single bar
- Nav tabs may use shorter labels if space is tight
- DateRangePicker shows compact icon trigger (calendar icon, expands on click)

**Mobile (below md):**
```
┌──────────────────────────────────┐
│ [Logo/Title]       [Hamburger ☰] │
└──────────────────────────────────┘
```

- Logo/title left, hamburger icon right
- Hamburger opens a slide-out drawer (from right, animated)
- Drawer contains (in order):
  1. Nav links (Overview, Itineraries, Ships, Reviews, Admin, Settings)
  2. Divider
  3. Merchant Switcher (if 2+ merchants)
  4. Date Range Picker
  5. Theme Toggle
  6. Auth / Sign Out
- Drawer closes on: navigation, outside tap, close button
- Backdrop overlay behind drawer

### 2.2 Navigation Component

The current `Navigation.tsx` merges into `Header.tsx` as an inline element. Options:
- **Option A:** Delete `Navigation.tsx`, inline the tab rendering into Header
- **Option B:** Keep `Navigation.tsx` as a sub-component imported by Header (cleaner separation)

Recommend **Option B** — keep as sub-component `NavTabs.tsx` that renders the tab list, imported by Header for desktop and by the mobile drawer.

### 2.3 BrandSwitcher → MerchantSwitcher

Rename and refactor:
- Only renders when `brand.merchants.length > 1`
- Dropdown or segmented control showing merchant labels
- Include an "All" option to view combined data
- Styled with theme tokens (not hardcoded colors)
- In mobile drawer: renders as a list of radio-style options

### 2.4 RefreshButton

Absorb into DateRangePicker as an inline icon button. No longer a standalone header element. The refresh icon sits inside the date picker component, next to the date display.

### 2.5 Layout.tsx Changes

```tsx
// Before (two sticky bars)
<div className="sticky top-0 z-40">
  <Header />
  <Navigation />
</div>

// After (single sticky bar)
<div className="sticky top-0 z-40">
  <Header />  {/* Now contains nav inline */}
</div>
```

---

## 3. CSS Variable Migration

### 3.1 globals.css Overhaul

**Replace the current structure:**

Current `globals.css` has:
- `:root` with hardcoded light mode variables
- `.dark` class with hardcoded dark mode variables
- Dozens of `.dark .bg-white`, `.dark .text-gray-*` overrides with `!important`
- `@theme inline` Tailwind mapping

**New structure:**

```css
/* 1. Brand token slots (overridden at runtime by inject.ts) */
:root {
  /* These are defaults — will be overridden by JS */
  --brand-primary: #1e293b;
  --brand-primary-dark: #0f172a;
  --brand-accent: #3b82f6;
  --brand-accent-light: #60a5fa;
  --brand-neutral: #64748b;
  --brand-surface-warm: #f8fafc;
}

/* 2. Semantic tokens derived from brand tokens */
:root {
  --background: var(--derived-background);
  --foreground: var(--derived-foreground);
  --surface: var(--derived-surface);
  /* ... all semantic tokens ... */
}

/* 3. Dark mode — just swaps which derived values are active */
/* (handled by inject.ts re-running with isDark=true) */

/* 4. Tailwind theme mapping */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  /* ... mapped to Tailwind utilities ... */
}

/* 5. Utility styles (animations, focus rings, etc.) */
/* Keep non-color utilities as-is */
```

**What gets deleted:**
- ALL `.dark .bg-white { background-color: ... !important }` overrides
- ALL `.dark .text-gray-*` overrides
- ALL `.dark .border-gray-*` overrides
- ALL `.dark input, .dark select` overrides
- The hardcoded Recharts dark mode overrides (replace with token-based)
- Any hardcoded hex color that has a semantic equivalent

### 3.2 Component Migration

Every component with hardcoded colors needs updating. Here is the systematic find-and-replace map:

| Find (hardcoded) | Replace with |
|---|---|
| `bg-[#1B3A5C]` | `bg-[var(--header-bg)]` |
| `text-[#1B3A5C]` | `text-[var(--text-primary)]` or `text-[var(--nav-active-text)]` |
| `text-[#C5A258]` / `bg-[#C5A258]` | `text-[var(--brand-accent)]` / `bg-[var(--brand-accent)]` |
| `dark:bg-[#111927]` | Remove — handled by semantic token |
| `dark:border-[#1e2d44]` | Remove — handled by semantic token |
| `dark:text-white/60` | Remove — handled by semantic token |
| `hover:text-[#1B3A5C]` | `hover:text-[var(--nav-active-text)]` |
| `bg-white` (cards/surfaces) | `bg-[var(--surface)]` |
| `text-gray-900` | `text-[var(--text-primary)]` |
| `text-gray-500` / `text-gray-600` | `text-[var(--text-secondary)]` |
| `text-gray-400` | `text-[var(--text-tertiary)]` |
| `border-gray-200` | `border-[var(--border)]` |
| `border-gray-100` | `border-[var(--border-light)]` |
| `bg-gray-50` / `bg-gray-100` | `bg-[var(--surface-alt)]` |
| `hover:bg-[#1B3A5C]/5` | `hover:bg-[var(--brand-primary-hover)]` |

### 3.3 Recharts Theme Integration

Update chart components to use CSS variables:
- Axis tick text: `var(--text-secondary)`
- Grid lines: `var(--border)`
- Bar fills: `var(--brand-accent)` (primary series), `var(--brand-primary-light)` (secondary)
- Tooltip bg: `var(--surface)`, border: `var(--border)`, text: `var(--text-primary)`
- Line stroke: `var(--brand-accent)`

Use a `useThemeColors()` hook that reads computed CSS variable values for Recharts props (since Recharts needs actual hex values, not CSS var references).

### 3.4 theme-init.js Update

The `public/theme-init.js` script runs before React hydration to prevent theme flash. Update it to:

1. Read dark/light preference from localStorage (existing behavior)
2. Read brand token overrides from localStorage cache (new)
3. Apply minimal CSS variables to `:root` immediately
4. The full derivation runs once React hydrates and BrandContext loads

---

## 4. BrandContext

### 4.1 New Context

Create `src/contexts/BrandContext.tsx`:

```typescript
interface BrandContextValue {
  brand: BrandTheme;
  activeMerchant: string | 'all';
  setActiveMerchant: (id: string | 'all') => void;
  isLoading: boolean;
}
```

**Responsibilities:**
- Loads brand config (hardcoded in Phase 1, from Firestore in Phase 2)
- Provides brand theme to the injection system
- Manages active merchant selection
- Replaces the brand-related state currently in DashboardContext

### 4.2 DashboardContext Refactor

Remove brand-switching logic from DashboardContext. It should retain:
- Date range state
- Data version / refresh triggers
- Any other data-layer concerns

The `selectedBrand` state in DashboardContext gets replaced by `activeMerchant` from BrandContext.

---

## 5. Responsive Improvements

### 5.1 Table Auto-View on Mobile

For Itineraries and Ships pages:
- Below `md` breakpoint, default to card view instead of table view
- The view toggle still exists so users can switch, but the smart default avoids horizontal scrolling
- Persist user's choice per page in localStorage

### 5.2 Chart Responsiveness

- Recharts containers should use `ResponsiveContainer` (likely already in use — verify)
- On mobile, trend chart grid (`lg:grid-cols-2`) correctly falls to single column
- No changes needed if already working

### 5.3 Date Picker Mobile

- Verify the calendar dropdown doesn't overflow the viewport on small screens
- If it does, switch to a bottom sheet or full-screen modal on mobile

---

## 6. Uniworld Journeys Brand Reference

### Complete Color Palette (from K&P Brand Identity R6)

**Primary Colors:**

| Name | Hex | Usage |
|---|---|---|
| Plaster | `#F1EEEA` | Light backgrounds, page bg |
| Parchment | `#D6D0C5` | Secondary light surfaces |
| Taupe | `#655E51` | Mid-tone, secondary text |
| Charcoal | `#373535` | Primary anchor, header bg |
| Willow | `#9F907C` | Warm gray-green accent |

**Secondary Colors:**

| Name | Hex | Usage |
|---|---|---|
| Gold (light) | `#E7D39C` | Logo gradient start, accent hover |
| Gold (dark) | `#C2AB82` | Logo gradient end, primary accent |

**Extended Digital Palette:**

| Name | Hex |
|---|---|
| Dark Charcoal | `#1E1C1C` |
| Charcoal 95 | `#433F3F` |
| Charcoal 90 | `#494545` |
| Charcoal 85 | `#514D4D` |
| Dark Taupe | `#5A5246` |
| Taupe 95 | `#766B5C` |
| Dark Willow | `#8B7C69` |
| Willow 95 | `#A5967E` |
| Willow 90 | `#AC9E88` |
| Willow 85 | `#B7AB98` |
| Dark Parchment | `#BFB9AE` |
| Parchment 95 | `#DED7CB` |
| Plaster 95 | `#F3F1EC` |
| Plaster 90 | `#F7F5F2` |
| Plaster 85 | `#FBFBF9` |
| White | `#FFFFFF` |

### WCAG AA Compliance Notes

- Dark Charcoal, Charcoal, Charcoal 95, Charcoal 90, Charcoal 85 all pass AA against Plaster, Plaster 95, Plaster 90, Plaster 85, and White backgrounds
- Taupe and Dark Taupe pass AA against all Plaster shades and White
- Willow shades do NOT pass AA against light backgrounds — use only for decorative/non-essential text
- Gold does NOT pass AA for text on light backgrounds — use only for icons, indicators, badges (non-text)

---

## 7. Implementation Order

Execute in this sequence:

### Step 1: Theme Token Foundation
1. Create `src/lib/theme/tokens.ts` — types, default theme, Uniworld theme
2. Create `src/lib/theme/derive.ts` — derivation logic with all light/dark mappings
3. Create `src/lib/theme/inject.ts` — CSS variable injection utility
4. Write unit tests for derivation logic

### Step 2: BrandContext & Integration
5. Create `src/contexts/BrandContext.tsx`
6. Refactor `src/contexts/DashboardContext.tsx` — remove brand state
7. Update `src/app/layout.tsx` — add BrandContext provider, wire up token injection
8. Update `public/theme-init.js` — brand-aware pre-hydration
9. Update `src/contexts/ThemeContext.tsx` — integrate with brand token system

### Step 3: CSS Migration
10. Overhaul `src/app/globals.css` — new token structure, delete dark mode overrides
11. Update Tailwind `@theme inline` block
12. Migrate all components from hardcoded hex → semantic CSS variables (systematic find-and-replace per Section 3.2 table)

### Step 4: Header Consolidation
13. Create `src/components/layout/NavTabs.tsx` — extracted tab navigation
14. Create `src/components/layout/MobileDrawer.tsx` — hamburger slide-out menu
15. Rewrite `src/components/layout/Header.tsx` — single bar with inline nav
16. Refactor `src/components/layout/BrandSwitcher.tsx` → MerchantSwitcher
17. Absorb RefreshButton into DateRangePicker
18. Update `src/app/layout.tsx` — remove Navigation import, single Header
19. Delete or archive `src/components/layout/Navigation.tsx`

### Step 5: Responsive Polish
20. Auto-default to card view on mobile for Itineraries/Ships pages
21. Verify date picker mobile behavior
22. Create `useThemeColors()` hook for Recharts
23. Update all chart components to use theme-derived colors

### Step 6: Testing & QA
24. Visual regression: light mode, dark mode, mobile, tablet, desktop
25. Verify all WCAG AA compliance per brand guide
26. Test with default theme (vanilla) to ensure it works without Uniworld config
27. Test merchant switcher with single merchant (should not render) and multiple merchants
28. Cross-browser testing (Chrome, Firefox, Safari, Edge)

---

## 8. Files Changed Summary

### New Files
| File | Purpose |
|---|---|
| `src/lib/theme/tokens.ts` | Token type definitions + vanilla default theme only — no brand-specific data |
| `src/lib/theme/derive.ts` | 6 tokens → full CSS variable derivation |
| `src/lib/theme/inject.ts` | Runtime CSS variable injection |
| `src/config/brands/uniworld-journeys.ts` | Uniworld Journeys brand config (Phase 1 stand-in for Firestore doc) |
| `src/config/brands/index.ts` | Phase 1 brand loader — swap for Firestore fetch in Phase 2 |
| `src/contexts/BrandContext.tsx` | Brand/merchant state management |
| `src/components/layout/NavTabs.tsx` | Extracted tab navigation sub-component |
| `src/components/layout/MobileDrawer.tsx` | Hamburger menu slide-out drawer |
| `src/hooks/useThemeColors.ts` | Read computed CSS vars for Recharts |

### Modified Files
| File | Changes |
|---|---|
| `src/app/globals.css` | Full overhaul: semantic tokens, delete dark overrides |
| `src/app/layout.tsx` | BrandContext provider, single Header layout |
| `src/components/layout/Header.tsx` | Full rewrite: single bar, inline nav, hamburger |
| `src/components/layout/BrandSwitcher.tsx` | Rename to MerchantSwitcher, conditional render |
| `src/components/layout/ThemeToggle.tsx` | Move into new header, update token usage |
| `src/components/layout/DateRangePicker.tsx` | Add compact mode, absorb RefreshButton |
| `src/components/layout/AuthButton.tsx` | Move into new header layout |
| `src/contexts/DashboardContext.tsx` | Remove brand state (moved to BrandContext) |
| `src/contexts/ThemeContext.tsx` | Integrate with brand token derivation |
| `public/theme-init.js` | Brand-aware pre-hydration tokens |
| `src/app/page.tsx` | Replace hardcoded colors with semantic tokens |
| `src/app/reviews/page.tsx` | Replace hardcoded colors with semantic tokens |
| `src/app/itineraries/page.tsx` | Replace hardcoded colors, mobile card default |
| `src/app/ships/page.tsx` | Replace hardcoded colors, mobile card default |
| `src/app/admin/page.tsx` | Replace hardcoded colors with semantic tokens |
| `src/components/dashboard/*.tsx` | All: replace hardcoded colors |
| `src/components/reviews/*.tsx` | All: replace hardcoded colors |
| `src/components/itineraries/*.tsx` | Replace hardcoded colors |
| `src/components/ships/*.tsx` | Replace hardcoded colors |
| `src/components/ui/*.tsx` | Replace hardcoded colors |

### Deleted Files
| File | Reason |
|---|---|
| `src/components/layout/Navigation.tsx` | Merged into Header as NavTabs sub-component |
| `src/components/layout/RefreshButton.tsx` | Absorbed into DateRangePicker |

---

## 9. Acceptance Criteria

- [x] Dashboard renders with Uniworld Journeys warm neutral palette (Charcoal header, Plaster backgrounds, Gold accents)
- [x] Dark mode derives from the same brand tokens and feels cohesive (warm-tinted, not generic gray)
- [x] Header and nav occupy a single row on desktop (~48-56px)
- [x] Mobile hamburger menu works with smooth slide-out animation
- [x] No hardcoded hex color values remain in component files (all use CSS variables)
- [x] All `.dark .class { !important }` overrides removed from globals.css
- [x] Merchant switcher only appears when brand has 2+ merchant IDs
- [x] Default/vanilla theme renders correctly when no brand config is present
- [x] Charts use theme-derived colors in both light and dark mode
- [x] Itineraries and Ships pages default to card view on mobile
- [ ] All text passes WCAG AA contrast requirements per brand guide  *(to verify in QA — palette follows brand guide)*
- [ ] No visual regression in existing functionality  *(manual QA pass required)*
