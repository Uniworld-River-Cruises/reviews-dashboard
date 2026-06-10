"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBrand } from "@/contexts/BrandContext";
import {
  createApiClient,
  listApiClients,
  revokeApiClient,
  rotateApiClient,
  type ApiClient,
} from "@/lib/firestore/admin-queries";

/**
 * Create / list / rotate / revoke credentials for the public reviews API.
 *
 * The client secret exists in the browser exactly once — in the reveal
 * dialog right after create/rotate. It is never persisted client-side and
 * cannot be retrieved again (the backend stores only a hash), which is why
 * the dialog refuses to close until the user confirms they stored it.
 */

interface SecretReveal {
  kind: "created" | "rotated";
  label: string;
  clientId: string;
  clientSecret: string;
}

type MerchantMode = "all" | "selected";

function CopyButton({
  value,
  what,
  autoFocus,
}: {
  value: string;
  what: string;
  autoFocus?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / non-secure context); the value
      // is visible in the adjacent box for manual selection.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      autoFocus={autoFocus}
      className="inline-flex shrink-0 items-center rounded-lg border border-input-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary shadow-sm hover:bg-surface-hover"
      aria-label={`Copy ${what}`}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function MerchantChips({ merchants }: { merchants: string[] }) {
  const { brand } = useBrand();
  if (merchants.includes("*")) {
    return (
      <span className="inline-flex rounded-full bg-brand-primary-light px-2 py-0.5 text-xs font-medium text-text-primary">
        All merchants
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {merchants.map((id) => (
        <span
          key={id}
          className="inline-flex rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-secondary"
        >
          {brand.merchants.find((m) => m.id === id)?.label ?? id}
        </span>
      ))}
    </span>
  );
}

function StatusBadge({ status }: { status: ApiClient["status"] }) {
  return status === "active" ? (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
      Revoked
    </span>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function ApiClientsManager({
  onToast,
}: {
  onToast: (message: string) => void;
}) {
  const { brand } = useBrand();
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [label, setLabel] = useState("");
  const [merchantMode, setMerchantMode] = useState<MerchantMode>("all");
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Row actions
  const [busyClientId, setBusyClientId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    { kind: "rotate" | "revoke"; client: ApiClient } | null
  >(null);

  // One-time secret reveal
  const [reveal, setReveal] = useState<SecretReveal | null>(null);

  // Guard async state updates against unmount (route change / permission
  // redirect mid-request). Set true inside the effect so StrictMode's
  // dev-time remount doesn't leave it permanently false.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listApiClients();
      if (!mountedRef.current) return;
      setClients(next);
    } catch (err) {
      if (!mountedRef.current) return;
      onToast(err instanceof Error ? err.message : "Failed to load API clients");
    }
    if (mountedRef.current) setLoading(false);
  }, [onToast]);

  useEffect(() => {
    Promise.resolve().then(() => loadClients());
  }, [loadClients]);

  function toggleMerchant(id: string) {
    setSelectedMerchants((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id]
    );
  }

  async function handleCreate() {
    const trimmed = label.trim();
    if (!trimmed) {
      onToast("Enter a label, e.g. “Marketing website (prod)”");
      return;
    }
    const merchants = merchantMode === "all" ? ["*"] : selectedMerchants;
    if (merchants.length === 0) {
      onToast("Select at least one merchant");
      return;
    }

    setCreating(true);
    try {
      const { client, clientSecret } = await createApiClient(trimmed, merchants);
      if (!mountedRef.current) return;
      setReveal({
        kind: "created",
        label: client.label,
        clientId: client.clientId,
        clientSecret,
      });
      setLabel("");
      setMerchantMode("all");
      setSelectedMerchants([]);
      await loadClients();
    } catch (err) {
      if (!mountedRef.current) return;
      onToast(err instanceof Error ? err.message : "Failed to create API client");
    }
    if (mountedRef.current) setCreating(false);
  }

  async function handleRotate(client: ApiClient) {
    setBusyClientId(client.clientId);
    try {
      const { clientSecret } = await rotateApiClient(client.clientId);
      if (!mountedRef.current) return;
      setReveal({
        kind: "rotated",
        label: client.label,
        clientId: client.clientId,
        clientSecret,
      });
      await loadClients();
    } catch (err) {
      if (!mountedRef.current) return;
      onToast(err instanceof Error ? err.message : "Failed to rotate secret");
    }
    if (mountedRef.current) setBusyClientId(null);
  }

  async function handleRevoke(client: ApiClient) {
    setBusyClientId(client.clientId);
    try {
      await revokeApiClient(client.clientId);
      if (!mountedRef.current) return;
      onToast(`Revoked “${client.label}” — its tokens are dead immediately`);
      await loadClients();
    } catch (err) {
      if (!mountedRef.current) return;
      onToast(err instanceof Error ? err.message : "Failed to revoke API client");
    }
    if (mountedRef.current) setBusyClientId(null);
  }

  return (
    <div className="space-y-8">
      {/* Create */}
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-6 py-5">
          <h2 className="text-xl font-semibold text-text-primary">Create API Client</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Issues a <span className="font-mono">client_id</span> +{" "}
            <span className="font-mono">client_secret</span> for server-to-server access
            to the public reviews API. The secret is shown once, right after creation.
          </p>
        </div>
        <div className="grid gap-6 px-6 py-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary" htmlFor="api-client-label">
              Label
            </label>
            <input
              id="api-client-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Marketing website (prod)"
              maxLength={100}
              className="w-full rounded-lg border border-input-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            />
            <p className="mt-1 text-xs text-text-secondary">
              Who or what will use this credential.
            </p>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-text-primary">Merchant access</span>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-input-border bg-surface px-3 py-2">
              <label className="inline-flex items-center gap-1.5 text-sm text-text-primary">
                <input
                  type="radio"
                  name="merchant-mode"
                  checked={merchantMode === "all"}
                  onChange={() => setMerchantMode("all")}
                />
                All merchants
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm text-text-primary">
                <input
                  type="radio"
                  name="merchant-mode"
                  checked={merchantMode === "selected"}
                  onChange={() => setMerchantMode("selected")}
                />
                Only:
              </label>
              {brand.merchants.map((merchant) => (
                <label
                  key={merchant.id}
                  className={`inline-flex items-center gap-1.5 text-sm ${
                    merchantMode === "selected" ? "text-text-primary" : "text-text-tertiary"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={merchantMode !== "selected"}
                    checked={selectedMerchants.includes(merchant.id)}
                    onChange={() => toggleMerchant(merchant.id)}
                  />
                  {merchant.label}
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center justify-center rounded-lg bg-header-bg px-4 py-2 text-sm font-medium text-header-text shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Client"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">API Clients</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Rotating a secret or revoking a client kills its outstanding tokens immediately.
            </p>
          </div>
          <button
            onClick={loadClients}
            className="inline-flex items-center rounded-lg border border-input-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface-hover"
          >
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
            </div>
          ) : clients.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-text-secondary">
              No API clients yet. Create the first one above to give a consumer access to
              the reviews API.
            </div>
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-surface-alt text-left text-text-secondary">
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Client ID</th>
                  <th className="px-4 py-3 font-medium">Merchants</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last used</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const busy = busyClientId === client.clientId;
                  const revoked = client.status === "revoked";
                  return (
                    <tr
                      key={client.clientId}
                      className={`border-t border-border ${revoked ? "opacity-60" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">{client.label}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <code className="rounded bg-surface-alt px-1.5 py-0.5 text-xs text-text-primary">
                            {client.clientId}
                          </code>
                          <CopyButton value={client.clientId} what="client id" />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <MerchantChips merchants={client.merchants} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={client.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatDate(client.lastUsedAt)}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(client.createdAt)}
                        {client.createdBy ? (
                          <div className="text-xs text-text-tertiary">by {client.createdBy}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {revoked ? (
                          <span className="text-xs text-text-tertiary">—</span>
                        ) : (
                          <div className="inline-flex items-center gap-3">
                            <button
                              onClick={() => setConfirmAction({ kind: "rotate", client })}
                              disabled={busy}
                              className="text-xs font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50"
                            >
                              {busy ? "Working..." : "Rotate secret"}
                            </button>
                            <button
                              onClick={() => setConfirmAction({ kind: "revoke", client })}
                              disabled={busy}
                              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirm rotate / revoke */}
      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-action-title"
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
          >
            <h3 id="confirm-action-title" className="text-lg font-semibold text-text-primary">
              {confirmAction.kind === "rotate" ? "Rotate secret?" : "Revoke client?"}
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              {confirmAction.kind === "rotate" ? (
                <>
                  The current secret for{" "}
                  <strong className="text-text-primary">{confirmAction.client.label}</strong>{" "}
                  stops working and every outstanding access token dies immediately. You&rsquo;ll
                  get a new secret to hand to the consumer.
                </>
              ) : (
                <>
                  <strong className="text-text-primary">{confirmAction.client.label}</strong>{" "}
                  is permanently disabled: token exchanges fail and every outstanding access
                  token dies immediately. This cannot be undone — create a new client to
                  restore access.
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                autoFocus
                className="rounded-lg border border-input-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  if (action.kind === "rotate") handleRotate(action.client);
                  else handleRevoke(action.client);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 ${
                  confirmAction.kind === "rotate" ? "bg-amber-600" : "bg-red-600"
                }`}
              >
                {confirmAction.kind === "rotate" ? "Rotate secret" : "Revoke client"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* One-time secret reveal */}
      {reveal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="secret-reveal-title"
            className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl"
          >
            <h3 id="secret-reveal-title" className="text-lg font-semibold text-text-primary">
              {reveal.kind === "created" ? "API client created" : "Secret rotated"}
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Credentials for <strong className="text-text-primary">{reveal.label}</strong>.
            </p>
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This is the <strong>only time the secret is shown</strong>. Store both values
              in a password manager before closing — the secret cannot be retrieved again,
              only rotated.
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Client ID
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-alt px-3 py-2 text-xs text-text-primary">
                    {reveal.clientId}
                  </code>
                  {/* Initial focus lands on a safe action — copying — rather
                   * than the close button, so Enter can't dismiss an
                   * unstored secret. */}
                  <CopyButton value={reveal.clientId} what="client id" autoFocus />
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Client Secret
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-alt px-3 py-2 text-xs text-text-primary">
                    {reveal.clientSecret}
                  </code>
                  <CopyButton value={reveal.clientSecret} what="client secret" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setReveal(null)}
                className="rounded-lg bg-header-bg px-4 py-2 text-sm font-medium text-header-text shadow-sm hover:opacity-90"
              >
                I&rsquo;ve stored both — close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
