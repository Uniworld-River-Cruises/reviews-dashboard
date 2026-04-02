"use client";

import { format } from "date-fns";
import type { OperationLogEntry, OperationLogLevel } from "@/lib/firestore/admin-queries";

function LevelBadge({ level }: { level: OperationLogLevel }) {
  const className =
    level === "success"
      ? "bg-emerald-100 text-emerald-700"
      : level === "warning"
        ? "bg-amber-100 text-amber-700"
        : level === "error"
          ? "bg-red-100 text-red-700"
          : "bg-badge-gray-bg text-badge-gray-text";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {level}
    </span>
  );
}

type DetailRow = {
  label: string;
  value: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return format(parsed, "M/d/yyyy h:mm:ss a");
}

function formatCount(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function formatText(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return null;
}

function brandLabel(value: unknown): string | null {
  if (value === "uniworld") return "Uniworld";
  if (value === "luxury-gold") return "Luxury Gold";
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function formatRequestCounts(value: unknown): string | null {
  if (!isRecord(value)) return null;

  const parts = [
    typeof value.succeeded === "number" ? `${value.succeeded} succeeded` : null,
    typeof value.processing === "number" ? `${value.processing} processing` : null,
    typeof value.errored === "number" ? `${value.errored} errored` : null,
    typeof value.expired === "number" ? `${value.expired} expired` : null,
    typeof value.canceled === "number" ? `${value.canceled} canceled` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function getCycleClassificationSummary(value: unknown): DetailRow[] {
  if (!isRecord(value)) return [];

  const rows: DetailRow[] = [];
  const batchId = formatText(value.submittedBatchId ?? value.batchId);
  const batchStatus = formatText(value.batchStatus ?? value.polledStatus ?? value.status);
  const submittedReviews = formatCount(value.submittedReviews ?? value.submittedCount);
  const processedReviews = formatCount(value.processedReviews ?? value.processed);
  const skippedReason = formatText(value.skippedReason);
  const error = formatText(value.error);
  const themesUpdated = formatText(value.themesUpdated);

  if (submittedReviews) {
    rows.push({ label: "Classification submitted", value: `${submittedReviews} review(s)` });
  }
  if (processedReviews) {
    rows.push({ label: "Themes applied", value: `${processedReviews} review(s)` });
  }
  if (batchStatus) {
    rows.push({ label: "Classification status", value: batchStatus });
  }
  if (batchId) {
    rows.push({ label: "Classification batch", value: batchId });
  }
  if (themesUpdated) {
    rows.push({ label: "Themes updated", value: themesUpdated });
  }
  if (skippedReason) {
    rows.push({ label: "Classification skipped", value: skippedReason });
  }
  if (error) {
    rows.push({ label: "Classification error", value: error });
  }

  return rows;
}

function getDetailRows(log: OperationLogEntry): DetailRow[] {
  const rows: DetailRow[] = [];
  const details = isRecord(log.details) ? log.details : null;

  if (log.brand) {
    rows.push({ label: "Brand", value: brandLabel(log.brand) ?? log.brand });
  }
  if (log.source) {
    rows.push({ label: "Triggered by", value: log.source });
  }
  if (log.actorEmail) {
    rows.push({ label: "Actor", value: log.actorEmail });
  }

  if (!details) {
    return rows;
  }

  if (log.action === "brand_sync_complete" || log.action === "brand_sync_failed") {
    const totalProcessed = formatCount(details.totalProcessed);
    const newReviews = formatCount(details.newReviews);
    const updatedReviews = formatCount(details.updatedReviews);
    const unchangedReviews = formatCount(details.unchangedReviews);
    const writtenReviews = formatCount(details.writtenReviews);
    const errorCount = formatCount(details.errorCount);
    const maxSourceUpdatedAt = formatDateTime(
      typeof details.maxSourceUpdatedAt === "string" ? details.maxSourceUpdatedAt : null
    );
    const error = formatText(details.error);

    if (totalProcessed) rows.push({ label: "Feefo reviews checked", value: totalProcessed });
    if (newReviews) rows.push({ label: "New reviews found", value: newReviews });
    if (updatedReviews) rows.push({ label: "Existing reviews updated", value: updatedReviews });
    if (unchangedReviews) rows.push({ label: "Already up to date", value: unchangedReviews });
    if (writtenReviews) rows.push({ label: "Written to Firestore", value: writtenReviews });
    if (errorCount) rows.push({ label: "Errors", value: errorCount });
    if (maxSourceUpdatedAt) rows.push({ label: "Newest Feefo update", value: maxSourceUpdatedAt });
    if (error) rows.push({ label: "Error", value: error });
    return rows;
  }

  if (log.action === "cycle_complete" || log.action === "cycle_failed") {
    const fullSync = formatText(details.fullSync);
    const error = formatText(details.error);
    if (fullSync) {
      rows.push({ label: "Full historical sync", value: fullSync });
    }
    if (Array.isArray(details.brands)) {
      for (const item of details.brands) {
        if (!isRecord(item)) continue;
        const name = brandLabel(item.brand) ?? "Brand";
        const checked = formatCount(item.totalProcessed) ?? "0";
        const newReviews = formatCount(item.newReviews) ?? "0";
        const updatedReviews = formatCount(item.updatedReviews) ?? "0";
        const unchangedReviews = formatCount(item.unchangedReviews) ?? "0";
        const errors = formatCount(item.errorCount) ?? "0";
        rows.push({
          label: `${name} sync`,
          value: `${checked} checked, ${newReviews} new, ${updatedReviews} updated, ${unchangedReviews} unchanged, ${errors} errors`,
        });
      }
    }
    rows.push(...getCycleClassificationSummary(details.classification));
    if (error) rows.push({ label: "Error", value: error });
    return rows;
  }

  if (log.action === "batch_submitted") {
    const totalRequests = formatCount(details.totalRequests);
    const status = formatText(details.status);
    const batchId = formatText(details.batchId);
    if (totalRequests) rows.push({ label: "Reviews submitted", value: totalRequests });
    if (status) rows.push({ label: "Batch status", value: status });
    if (batchId) rows.push({ label: "Batch ID", value: batchId });
    return rows;
  }

  if (log.action === "batch_poll_in_progress") {
    const batchId = formatText(details.batchId);
    const requestCounts = formatRequestCounts(details.requestCounts);
    if (batchId) rows.push({ label: "Batch ID", value: batchId });
    if (requestCounts) rows.push({ label: "Requests", value: requestCounts });
    return rows;
  }

  if (log.action === "batch_complete") {
    const batchId = formatText(details.batchId);
    const processed = formatCount(details.processed);
    const total = formatCount(details.total);
    if (batchId) rows.push({ label: "Batch ID", value: batchId });
    if (processed) rows.push({ label: "Reviews classified", value: processed });
    if (total) rows.push({ label: "Results received", value: total });
    return rows;
  }

  if (log.action === "batch_submit_failed" || log.action === "automation_failed") {
    const error = formatText(details.error);
    const attemptedCount = formatCount(details.attemptedCount);
    if (attemptedCount) rows.push({ label: "Reviews attempted", value: attemptedCount });
    if (error) rows.push({ label: "Error", value: error });
    return rows;
  }

  if (log.action === "batch_submit_skipped" || log.action === "automation_skipped_unconfigured") {
    const batchId = formatText(details.batchId);
    const status = formatText(details.status);
    const missingSetting = formatText(details.missingSetting);
    if (batchId) rows.push({ label: "Batch ID", value: batchId });
    if (status) rows.push({ label: "Current status", value: status });
    if (missingSetting) rows.push({ label: "Missing setting", value: missingSetting });
    return rows;
  }

  if (log.action === "recompute") {
    const reviewCount = formatCount(details.reviewCount);
    const shipCount = formatCount(details.shipCount);
    const itineraryCount = formatCount(details.itineraryCount);
    const error = formatText(details.error);
    if (reviewCount) rows.push({ label: "Reviews included", value: reviewCount });
    if (shipCount) rows.push({ label: "Ships summarized", value: shipCount });
    if (itineraryCount) rows.push({ label: "Itineraries summarized", value: itineraryCount });
    if (error) rows.push({ label: "Error", value: error });
    return rows;
  }

  const fallbackRows = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 5)
    .map(([key, value]) => ({
      label: key,
      value:
        typeof value === "object" ? JSON.stringify(value) : typeof value === "boolean"
          ? value ? "Yes" : "No"
          : String(value),
    }));

  return rows.concat(fallbackRows);
}

function actionLabel(action: string): string {
  switch (action) {
    case "cycle_started":
      return "Sync run started";
    case "cycle_complete":
      return "Sync run finished";
    case "cycle_failed":
      return "Sync run failed";
    case "brand_sync_complete":
      return "Brand sync finished";
    case "brand_sync_failed":
      return "Brand sync failed";
    case "brand_skipped_locked":
      return "Skipped because another sync is active";
    case "batch_submit_skipped":
      return "Classification skipped";
    case "batch_submitted":
      return "Classification submitted";
    case "batch_submit_failed":
      return "Classification submit failed";
    case "batch_poll_in_progress":
      return "Classification still running";
    case "batch_complete":
      return "Classification finished";
    case "automation_skipped_unconfigured":
      return "Classification not configured";
    case "automation_failed":
      return "Classification automation failed";
    case "recompute":
      return "Summary refresh";
    case "manual_recompute_requested":
      return "Manual summary refresh";
    default:
      return action.replace(/_/g, " ");
  }
}

export default function OperationLogsTable({
  logs,
  loading,
  emptyMessage,
}: {
  logs: OperationLogEntry[];
  loading: boolean;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-spinner-track border-t-spinner-accent" />
      </div>
    );
  }

  if (logs.length === 0) {
    return <div className="px-4 py-6 text-sm text-text-secondary">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="bg-surface-alt text-left text-text-secondary">
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Message</th>
            <th className="px-4 py-3 font-medium">Context</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const detailRows = getDetailRows(log);

            return (
              <tr key={log.id} className="border-t border-border-light align-top">
                <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                  {log.createdAt ? format(new Date(log.createdAt), "M/d/yyyy h:mm:ss a") : "-"}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-brand-primary-light px-2 py-0.5 text-xs font-medium capitalize text-text-primary">
                    {log.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <LevelBadge level={log.level} />
                </td>
                <td className="px-4 py-3 text-text-primary">
                  <div className="font-medium">{log.message}</div>
                  <div className="mt-1 text-xs text-text-secondary">{actionLabel(log.action)}</div>
                </td>
                <td className="px-4 py-3 text-xs leading-5 text-text-secondary">
                  {detailRows.length > 0 ? (
                    <dl className="space-y-1.5">
                      {detailRows.map((row) => (
                        <div key={`${log.id}-${row.label}`} className="grid grid-cols-[132px_minmax(0,1fr)] gap-2">
                          <dt className="font-medium text-text-secondary">{row.label}</dt>
                          <dd className="break-words text-text-primary">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
