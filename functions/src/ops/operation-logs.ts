import { getFirestore, type Query } from "firebase-admin/firestore";

export type OperationLogType = "sync" | "classification" | "summary" | "apiClient";
export type OperationLogLevel = "info" | "success" | "warning" | "error";
export type OperationLogSource = "scheduled" | "manual" | "system";

export interface OperationLogRecord {
  id: string;
  type: OperationLogType;
  level: OperationLogLevel;
  action: string;
  message: string;
  createdAt: string;
  brand?: string | null;
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
  details?: Record<string, unknown> | null;
}

const OPERATION_LOGS_COLLECTION = "operation_logs";

export async function writeOperationLog(input: {
  type: OperationLogType;
  level: OperationLogLevel;
  action: string;
  message: string;
  brand?: string | null;
  source?: OperationLogSource;
  actorEmail?: string | null;
  actorUid?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getFirestore();

  try {
    const createdAt = new Date().toISOString();
    await db.collection(OPERATION_LOGS_COLLECTION).add({
      type: input.type,
      level: input.level,
      action: input.action,
      message: input.message,
      createdAt,
      brand: input.brand ?? null,
      source: input.source ?? "system",
      actorEmail: input.actorEmail ?? null,
      actorUid: input.actorUid ?? null,
      details: input.details ?? null,
    } satisfies Omit<OperationLogRecord, "id">);
  } catch (error) {
    console.error("Failed to write operation log:", error);
  }
}

export async function listOperationLogs(options?: {
  hours?: number | null;
  limit?: number;
}): Promise<OperationLogRecord[]> {
  const db = getFirestore();
  let query: Query = db.collection(OPERATION_LOGS_COLLECTION);

  if (typeof options?.hours === "number" && options.hours > 0) {
    const since = new Date(Date.now() - options.hours * 60 * 60 * 1000).toISOString();
    query = query.where("createdAt", ">=", since);
  }

  query = query.orderBy("createdAt", "desc");

  if (typeof options?.limit === "number" && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};
    return {
      id: doc.id,
      type:
        data.type === "classification" || data.type === "summary" || data.type === "apiClient"
          ? data.type
          : "sync",
      level:
        data.level === "success" ||
        data.level === "warning" ||
        data.level === "error"
          ? data.level
          : "info",
      action: typeof data.action === "string" ? data.action : "unknown",
      message: typeof data.message === "string" ? data.message : "No message",
      createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
      brand: typeof data.brand === "string" || data.brand === null ? data.brand : null,
      source:
        data.source === "scheduled" || data.source === "manual" || data.source === "system"
          ? data.source
          : "system",
      actorEmail:
        typeof data.actorEmail === "string" || data.actorEmail === null
          ? data.actorEmail
          : null,
      actorUid:
        typeof data.actorUid === "string" || data.actorUid === null ? data.actorUid : null,
      details:
        typeof data.details === "object" && data.details !== null
          ? (data.details as Record<string, unknown>)
          : null,
    } satisfies OperationLogRecord;
  });
}
