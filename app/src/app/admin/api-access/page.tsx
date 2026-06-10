"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getClientAuth } from "@/lib/firebase";
import {
  getCurrentAdminAccess,
  type CurrentAdminAccess,
} from "@/lib/firestore/admin-queries";
import ApiClientsManager from "@/components/admin/ApiClientsManager";

export default function ApiAccessPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [currentAccess, setCurrentAccess] = useState<CurrentAdminAccess | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const canManageApiClients = Boolean(currentAccess?.permissions.manageApiClients);

  useEffect(() => {
    try {
      const auth = getClientAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthResolved(true);
      });
    } catch {
      queueMicrotask(() => setAuthResolved(true));
      router.replace("/");
      return;
    }
  }, [router]);

  useEffect(() => {
    if (!authResolved) {
      return;
    }

    if (!user) {
      queueMicrotask(() => {
        setCurrentAccess(null);
        setCheckingAccess(false);
      });
      router.replace("/");
      return;
    }

    let cancelled = false;
    queueMicrotask(() => setCheckingAccess(true));

    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setCurrentAccess(access);
        if (!access.permissions.manageApiClients) {
          router.replace("/admin");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentAccess(null);
        router.replace("/");
      })
      .finally(() => {
        if (cancelled) return;
        setCheckingAccess(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authResolved, router, user]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  if (!authResolved || checkingAccess || !canManageApiClients) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 text-sm font-medium text-text-secondary">
          <Link href="/admin" className="hover:text-text-primary hover:underline">
            Admin
          </Link>
          <span className="mx-2 text-text-tertiary">/</span>
          API Access
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">API Access</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Credentials for the public reviews API — server-to-server only. Consumers
          exchange their client ID + secret for a bearer token, exactly like the Feefo
          API. See the Postman collection in{" "}
          <code className="rounded bg-surface-alt px-1 py-0.5 text-xs">docs/api/</code> for
          the full contract.
        </p>
      </div>

      <ApiClientsManager onToast={setToast} />

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
