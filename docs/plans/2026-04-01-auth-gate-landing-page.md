# Auth Gate & Landing Page Design

## Goal

Require Microsoft SSO authentication before users can access any dashboard content. Show a polished landing page for unauthenticated visitors.

## Architecture

### Auth Gate (Layout-Level)

The root layout wraps all content in an `AuthGate` component (`src/components/layout/AuthGate.tsx`). It uses `onAuthStateChanged` to track Firebase auth state and conditionally renders one of three states:

1. **Loading** — Minimal navy screen while Firebase resolves auth state. Prevents flash of landing page for already-authenticated users.
2. **Unauthenticated** — Full-screen landing page with sign-in button.
3. **Authenticated** — Current layout (Header, Navigation, page content).

```
<ThemeProvider>
  <DashboardProvider>
    <AuthGate>
      <Header />
      <Navigation />
      <main>{children}</main>
    </AuthGate>
  </DashboardProvider>
</ThemeProvider>
```

### Landing Page (Rendered by AuthGate when unauthenticated)

Full-viewport navy (#1B3A5C) background, content centered vertically and horizontally:

- **Title**: "Feefo Review Intelligence Dashboard" — white, large bold text (text-3xl mobile, text-5xl desktop)
- **Subtitle**: "Real-time review analytics and insights for Uniworld Journeys" — white/70 opacity, medium size, below title with breathing room
- **Sign-in button**: Gold (#C5A258) background, white text, rounded, generous padding. Text: "Sign In with Microsoft". Hover darkens gold slightly.
- **Footer note**: Small muted text near bottom: "Internal tool — company credentials required"
- **Background accent**: Subtle radial gradient or soft glow behind centered content for depth

No dark/light mode toggle on landing page — always navy theme. Theme toggle appears inside dashboard.

### Nav Reorganization (Mobile Fix)

Move auth/sync controls out of Navigation into Header to prevent overlap with tabs on mobile.

**Header layout (new):**

Row 1: `[Feefo Reviews]` .............. `[Date Range] [Theme Toggle] [Sign Out]`
Row 2: `[Uniworld | Luxury Gold | Combined]` ... `[Refresh]`

**Navigation:** Tabs only (Overview, Itineraries, Ships, Reviews, Admin). No auth controls.

Changes:
- **Header.tsx** — Add AuthButton (sign out only) next to ThemeToggle, add RefreshButton next to BrandSwitcher
- **Navigation.tsx** — Remove AuthButton and RefreshButton

## Components

| Component | File | Purpose |
|-----------|------|---------|
| AuthGate | `src/components/layout/AuthGate.tsx` | Layout-level auth check, renders landing or dashboard |
| Header | `src/components/layout/Header.tsx` | Move auth + refresh controls here from Navigation |
| Navigation | `src/components/layout/Navigation.tsx` | Tabs only, remove auth controls |

## Implementation Steps

1. Create `AuthGate.tsx` — auth state, loading screen, landing page, wraps children
2. Update `layout.tsx` — wrap Header/Navigation/main inside AuthGate
3. Move AuthButton and RefreshButton from Navigation.tsx to Header.tsx
4. Remove auth controls from Navigation.tsx
