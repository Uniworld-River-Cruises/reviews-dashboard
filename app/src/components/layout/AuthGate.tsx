"use client";

import { useEffect, useState } from "react";
import {
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from "firebase/auth";
import {
  getClientAuth,
  hasFirebaseWebConfig,
  getFirebaseWebConfigError,
} from "@/lib/firebase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasConfig = hasFirebaseWebConfig();
  const configError = getFirebaseWebConfigError();

  useEffect(() => {
    if (!hasConfig) {
      setLoading(false);
      return;
    }

    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (user) => {
        setAuthenticated(Boolean(user));
        setLoading(false);
      });
    } catch {
      setAuthenticated(false);
      setLoading(false);
    }
  }, [hasConfig]);

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
          : "Sign-in failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  if (configError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-header-bg px-6">
        <h1 className="text-xl font-semibold text-white">Configuration Error</h1>
        <p className="mt-3 max-w-md text-center text-sm text-white/60">
          {configError}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-header-bg">
        <div className="text-sm text-white/50">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-header-bg px-6">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(197,162,88,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex max-w-xl flex-col items-center text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Feefo Review Intelligence Dashboard
          </h1>
          <p className="mt-4 text-base text-white/70 sm:mt-6 sm:text-lg">
            Real-time review analytics and insights for Uniworld Journeys
          </p>
          <button
            onClick={handleSignIn}
            disabled={busy}
            className="mt-8 cursor-pointer rounded-full bg-brand-accent px-8 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:opacity-90 disabled:opacity-50 sm:mt-10 sm:px-10 sm:py-3.5 sm:text-base"
          >
            {busy ? "Signing in..." : "Sign In with Microsoft"}
          </button>
          {error ? (
            <p className="mt-4 max-w-sm text-sm text-red-300">{error}</p>
          ) : null}
        </div>

        <p className="absolute bottom-8 text-xs text-white/30">
          Internal tool — company credentials required
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
