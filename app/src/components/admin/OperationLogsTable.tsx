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
          : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {level}
    </span>
  );
}

function renderDetails(details: Record<string, unknown> | null | undefined): string {
  if (!details) return "";

  const parts = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => {
      if (typeof value === "object") {
        return `${key}: ${JSON.stringify(value)}`;
      }
      return `${key}: ${String(value)}`;
    });

  return parts.join(" | ");
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
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-[#1B3A5C]" />
      </div>
    );
  }

  if (logs.length === 0) {
    return <div className="px-4 py-6 text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Message</th>
            <th className="px-4 py-3 font-medium">Context</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const context = [
              log.brand ? `brand: ${log.brand}` : null,
              log.source ? `source: ${log.source}` : null,
              log.actorEmail ? `actor: ${log.actorEmail}` : null,
              renderDetails(log.details),
            ]
              .filter(Boolean)
              .join(" | ");

            return (
              <tr key={log.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                  {log.createdAt ? format(new Date(log.createdAt), "M/d/yyyy h:mm:ss a") : "-"}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-[#1B3A5C]/10 px-2 py-0.5 text-xs font-medium capitalize text-[#1B3A5C]">
                    {log.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <LevelBadge level={log.level} />
                </td>
                <td className="px-4 py-3 text-gray-900">
                  <div className="font-medium">{log.message}</div>
                  <div className="mt-1 text-xs text-gray-500">{log.action}</div>
                </td>
                <td className="px-4 py-3 text-xs leading-5 text-gray-500">
                  {context || "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
