"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { getClientAuth } from "@/lib/firebase";
import { getCurrentAdminAccess } from "@/lib/firestore/admin-queries";
import { useBrand } from "@/contexts/BrandContext";
import {
  WEBSITE_PLACEMENTS,
  getWebsiteQueueCounts,
  getWebsiteQueueFilterOptions,
  getWebsiteQueuePage,
  moderateWebsiteReview,
  type WebsitePlacement,
  type WebsiteQueueFilter,
  type WebsiteQueueFilterOptions,
  type WebsiteQueueReview,
  type WebsiteStatus,
} from "@/lib/firestore/website-queries";

const STATUS_TABS: { status: WebsiteStatus; label: string }[] = [
  { status: "candidate", label: "Candidates" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

const SELECT_CLASS =
  "rounded-lg border border-input-border bg-surface px-3 py-2 text-sm text-text-primary";

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-text-tertiary">n/a</span>;
  return (
    <span className="text-brand-accent" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i}>{i < Math.round(rating) ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function QueueCard({
  review,
  busy,
  onDecide,
}: {
  review: WebsiteQueueReview;
  busy: boolean;
  onDecide: (
    review: WebsiteQueueReview,
    action: "approve" | "reject" | "reset",
    placements: WebsitePlacement[]
  ) => void;
}) {
  const [placements, setPlacements] = useState<WebsitePlacement[]>(review.placements);
  const togglePlacement = (id: WebsitePlacement) =>
    setPlacements((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id]
    );

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary">
            {review.displayName}
            {review.location ? (
              <span className="font-normal text-text-secondary">, {review.location}</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">
            {formatDate(review.date)} · {review.tripName}
            {review.parentSku ? ` (${review.parentSku})` : ""}
            {review.ship ? ` · ${review.ship}` : ""}
          </div>
        </div>
        <div className="text-right text-xs text-text-secondary">
          <div>
            Service <Stars rating={review.serviceRating} />
          </div>
          <div>
            Product <Stars rating={review.productRating} />
          </div>
        </div>
      </div>

      {review.serviceTitle ? (
        <h3 className="mt-3 text-sm font-semibold text-text-primary">{review.serviceTitle}</h3>
      ) : null}
      {review.serviceText ? (
        <p className="mt-1 whitespace-pre-line text-sm text-text-primary">{review.serviceText}</p>
      ) : null}
      {review.productText ? (
        <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">
          <span className="font-medium text-text-primary">Trip: </span>
          {review.productText}
        </p>
      ) : null}
      {review.reply ? (
        <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-alt px-3 py-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Reply: </span>
          {review.reply}
        </p>
      ) : null}

      {review.positiveThemes.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.positiveThemes.map((theme) => (
            <span
              key={theme}
              className="rounded-full bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-text-secondary"
            >
              {theme}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1" disabled={busy || review.status === "rejected"}>
          <legend className="sr-only">Placements</legend>
          {WEBSITE_PLACEMENTS.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={placements.includes(p.id)}
                onChange={() => togglePlacement(p.id)}
              />
              {p.label}
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2">
          {review.status === "candidate" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(review, "reject", [])}
                className="rounded-lg border border-input-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(review, "approve", placements)}
                className="rounded-lg bg-header-bg px-3 py-1.5 text-sm font-medium text-header-text hover:opacity-90 disabled:opacity-50"
              >
                Approve
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(review, "reset", [])}
                className="rounded-lg border border-input-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"
              >
                Undo decision
              </button>
              {review.status === "approved" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(review, "approve", placements)}
                  className="rounded-lg bg-header-bg px-3 py-1.5 text-sm font-medium text-header-text hover:opacity-90 disabled:opacity-50"
                >
                  Save placements
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {review.decidedBy || review.decidedAt ? (
        <p className="mt-2 text-xs text-text-tertiary">
          {review.status === "approved" ? "Approved" : "Rejected"}
          {review.decidedBy ? ` by ${review.decidedBy}` : ""}
          {review.decidedAt ? ` on ${formatDate(review.decidedAt)}` : ""}
        </p>
      ) : null}
    </article>
  );
}

export default function WebsiteQueuePage() {
  const router = useRouter();
  const { brand: brandConfig } = useBrand();
  const merchants = brandConfig.merchants;

  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [merchant, setMerchant] = useState<string>(merchants[0]?.id ?? "uniworld");
  const [status, setStatus] = useState<WebsiteStatus>("candidate");
  const [filter, setFilter] = useState<WebsiteQueueFilter>({ kind: "none" });
  const [options, setOptions] = useState<WebsiteQueueFilterOptions | null>(null);
  const [counts, setCounts] = useState<Record<WebsiteStatus, number> | null>(null);

  const [reviews, setReviews] = useState<WebsiteQueueReview[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      return onAuthStateChanged(getClientAuth(), (nextUser) => {
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
    if (!authResolved) return;
    if (!user) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    getCurrentAdminAccess()
      .then((access) => {
        if (cancelled) return;
        setAllowed(access.permissions.moderateWebsite);
        if (!access.permissions.moderateWebsite) router.replace("/admin");
      })
      .catch(() => {
        if (!cancelled) router.replace("/");
      })
      .finally(() => {
        if (!cancelled) setCheckingAccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authResolved, router, user]);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, nextCounts] = await Promise.all([
        getWebsiteQueuePage(merchant, status, filter, null),
        getWebsiteQueueCounts(merchant, filter),
      ]);
      setReviews(page.reviews);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setCounts(nextCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setReviews([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [merchant, status, filter]);

  useEffect(() => {
    if (!allowed) return;
    void loadFirstPage();
  }, [allowed, loadFirstPage]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getWebsiteQueueFilterOptions(merchant)
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch(() => {
        if (!cancelled) setOptions({ themes: [], ships: [], itineraries: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, merchant]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const page = await getWebsiteQueuePage(merchant, status, filter, cursor);
      setReviews((current) => [...current, ...page.reviews]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const decide = async (
    review: WebsiteQueueReview,
    action: "approve" | "reject" | "reset",
    placements: WebsitePlacement[]
  ) => {
    setBusyId(review.id);
    try {
      await moderateWebsiteReview(review.id, action, placements);
      const keepsTab = action === "approve" && review.status === "approved";
      if (!keepsTab) {
        // The review leaves this tab; drop it locally and adjust the counts.
        setReviews((current) => current.filter((r) => r.id !== review.id));
        void getWebsiteQueueCounts(merchant, filter).then(setCounts).catch(() => undefined);
      } else {
        setReviews((current) =>
          current.map((r) => (r.id === review.id ? { ...r, placements } : r))
        );
      }
      setToast(
        action === "approve"
          ? keepsTab
            ? "Placements saved."
            : "Approved for the website."
          : action === "reject"
            ? "Rejected."
            : "Decision undone."
      );
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const setFilterKind = (kind: WebsiteQueueFilter["kind"], value: string) => {
    setFilter(value ? ({ kind, value } as WebsiteQueueFilter) : { kind: "none" });
  };

  if (!authResolved || checkingAccess || !allowed) {
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
          Website Queue
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">Website Queue</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Reviews the rule proposes for the website (5 stars, a comment, a positive theme, and
          60 to 600 characters of service text). Approved reviews are served by the public API
          with <code className="rounded bg-surface-alt px-1 py-0.5 text-xs">website=approved</code>
          , optionally narrowed by placement.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Brand"
          value={merchant}
          onChange={(e) => {
            setMerchant(e.target.value);
            setFilter({ kind: "none" });
          }}
          className={SELECT_CLASS}
        >
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Theme"
          value={filter.kind === "theme" ? filter.value : ""}
          onChange={(e) => setFilterKind("theme", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">All themes</option>
          {options?.themes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {options && options.ships.length > 0 ? (
          <select
            aria-label="Ship"
            value={filter.kind === "ship" ? filter.value : ""}
            onChange={(e) => setFilterKind("ship", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All ships</option>
            {options.ships.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : null}
        <select
          aria-label="Itinerary"
          value={filter.kind === "itinerary" ? filter.value : ""}
          onChange={(e) => setFilterKind("itinerary", e.target.value)}
          className={`${SELECT_CLASS} max-w-xs`}
        >
          <option value="">All itineraries</option>
          {options?.itineraries.map((i) => (
            <option key={i.parentSku} value={i.parentSku}>
              {i.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-tertiary">One filter at a time.</span>
      </div>

      <div className="mb-5 flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.status}
            type="button"
            onClick={() => setStatus(tab.status)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              status === tab.status
                ? "border-nav-active-indicator text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
            {counts ? (
              <span className="ml-1.5 text-xs text-text-tertiary">
                {counts[tab.status].toLocaleString()}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-primary">
          Could not load the queue: {error}
        </div>
      ) : null}

      <div className="space-y-4">
        {reviews.map((review) => (
          <QueueCard
            key={`${review.id}-${review.status}`}
            review={review}
            busy={busyId === review.id}
            onDecide={decide}
          />
        ))}
      </div>

      {!loading && reviews.length === 0 && !error ? (
        <p className="py-12 text-center text-sm text-text-secondary">Nothing here.</p>
      ) : null}

      <div className="mt-6 flex justify-center">
        {loading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
        ) : hasMore ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-lg border border-input-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            Load more
          </button>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
