"use client";

import { useTheme } from "@/contexts/ThemeContext";

type ThemeToggleProps = {
  /**
   * "inverse" (default) — translucent-white styling for use on the dark
   *   header background.
   * "neutral" — border + surface styling for use on light backgrounds
   *   (e.g. the MobileDrawer panel).
   */
  tone?: "inverse" | "neutral";
};

export default function ThemeToggle({ tone = "inverse" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isNeutral = tone === "neutral";

  return (
    <button
      onClick={toggleTheme}
      className={`cursor-pointer relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
        isNeutral
          ? "border border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          : "border border-white/20 bg-white/10 text-white hover:bg-white/20"
      }`}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {/* Sun icon — shown in dark mode */}
      <svg
        className={`h-4 w-4 transition-all duration-300 absolute ${
          theme === "dark"
            ? "opacity-100 rotate-0 scale-100"
            : "opacity-0 rotate-90 scale-0"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
        />
      </svg>
      {/* Moon icon — shown in light mode */}
      <svg
        className={`h-4 w-4 transition-all duration-300 absolute ${
          theme === "light"
            ? "opacity-100 rotate-0 scale-100"
            : "opacity-0 -rotate-90 scale-0"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 006.002-2.082 9.718 9.718 0 003-3.916z"
        />
      </svg>
    </button>
  );
}
