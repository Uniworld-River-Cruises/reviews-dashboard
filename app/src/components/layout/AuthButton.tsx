"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
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
      await signOut(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white/70">
        Checking auth...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user?.email ? (
        <span className="hidden max-w-[180px] truncate text-xs text-white/80 sm:inline">
          {user.email}
        </span>
      ) : null}
      <button
        onClick={user ? handleSignOut : handleSignIn}
        disabled={busy}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
      >
        {busy ? "Working..." : user ? "Sign Out" : "Sign In"}
      </button>
      {error ? (
        <span className="hidden max-w-[220px] truncate text-xs text-red-200 lg:inline">
          {error}
        </span>
      ) : null}
    </div>
  );
}
