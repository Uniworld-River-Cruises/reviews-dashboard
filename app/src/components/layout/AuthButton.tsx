"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
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
      const provider = new GoogleAuthProvider();
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
            ? "border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-white/15 dark:bg-white/5 dark:text-white/70"
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
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
            isNeutral
              ? "border border-[#1B3A5C]/10 bg-[#1B3A5C]/[0.06] text-[#1B3A5C] dark:border-white/10 dark:bg-white/5 dark:text-white/80"
              : "border border-white/15 bg-white/10 text-white/80"
          }`}
          title={user.email}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="hidden max-w-[180px] truncate sm:inline">
            {user.email}
          </span>
          <span className="sm:hidden">Signed in</span>
        </div>
      ) : null}
      {user && !showEmail && showStatus ? (
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
            isNeutral
              ? "border border-[#1B3A5C]/10 bg-[#1B3A5C]/[0.06] text-[#1B3A5C] dark:border-white/10 dark:bg-white/5 dark:text-white/80"
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
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          isNeutral
            ? "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            : "border border-white/20 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {busy ? "Working..." : user ? "Sign Out" : "Sign In"}
      </button>
      {error ? (
        <span
          className={`hidden max-w-[220px] truncate text-xs xl:inline ${
            isNeutral ? "text-rose-600 dark:text-rose-300" : "text-red-200"
          }`}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
