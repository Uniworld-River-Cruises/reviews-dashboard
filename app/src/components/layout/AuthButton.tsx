"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getClientAuth } from "@/lib/firebase";

type AuthButtonProps = {
  tone?: "inverse" | "neutral";
  showEmail?: boolean;
  showStatus?: boolean;
};

export default function AuthButton({
  tone = "inverse",
  showEmail = true,
  showStatus = true,
}: AuthButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNeutral = tone === "neutral";

  useEffect(() => {
    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Auth is unavailable in this environment."
      );
      setLoading(false);
      return;
    }
  }, []);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const auth = getClientAuth();
      const provider = new OAuthProvider("microsoft.com");
      provider.setCustomParameters({
        tenant: "c8e16ff7-b48e-48dc-8e88-56ca27c5c21c",
      });
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sign-in failed. Check Firebase Auth provider configuration."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      const auth = getClientAuth();
      await signOut(auth);
      if (pathname.startsWith("/admin")) {
        router.replace("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        className={`rounded-full px-3 py-1.5 text-xs ${
          isNeutral
            ? "border border-border bg-surface text-text-secondary shadow-sm"
            : "border border-white/20 bg-white/10 text-white/70"
        }`}
      >
        Checking auth...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user?.email && showEmail ? (
        <div
          className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:flex ${
            isNeutral
              ? "border border-brand-primary-light bg-brand-primary-light text-text-primary"
              : "border border-white/15 bg-white/10 text-white/80"
          }`}
          title={user.email}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="max-w-[180px] truncate">
            {user.email}
          </span>
        </div>
      ) : null}
      {user && !showEmail && showStatus ? (
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
            isNeutral
              ? "border border-brand-primary-light bg-brand-primary-light text-text-primary"
              : "border border-white/15 bg-white/10 text-white/80"
          }`}
          title={user.email ?? "Signed in"}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Signed in</span>
        </div>
      ) : null}
      <button
        onClick={user ? handleSignOut : handleSignIn}
        disabled={busy}
        className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          isNeutral
            ? "border border-border bg-surface text-text-primary shadow-sm hover:bg-surface-hover"
            : "border border-white/20 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        <span className="hidden sm:inline">{busy ? "Working..." : user ? "Sign Out" : "Sign In"}</span>
        <svg
          className="h-4 w-4 sm:hidden"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={user
              ? "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              : "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            }
          />
        </svg>
      </button>
      {error ? (
        <span
          className={`hidden max-w-[220px] truncate text-xs xl:inline ${
            isNeutral ? "text-rose-600" : "text-red-200"
          }`}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
