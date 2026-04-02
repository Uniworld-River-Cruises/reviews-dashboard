/**
 * Navigation.tsx — deleted / replaced.
 *
 * This component has been superseded by NavTabs.tsx which is rendered
 * directly inside the consolidated Header bar.  The separate two-bar layout
 * (Header + Navigation) no longer exists.
 *
 * This stub exists only to surface a clear error message if something tries
 * to import this file during the transition period.
 *
 * @deprecated Use NavTabs (embedded in Header) instead.
 */

export default function Navigation() {
  throw new Error(
    "Navigation.tsx has been deleted. " +
    "NavTabs is now embedded inside Header.tsx. " +
    "Remove any import of Navigation from your codebase."
  );
}
