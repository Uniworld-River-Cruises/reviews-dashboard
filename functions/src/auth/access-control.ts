import { getFirestore } from "firebase-admin/firestore";

export type AccessPermission =
  | "sync"
  | "batchClassify"
  | "manageMappings"
  | "manageUsers"
  | "manageApiClients";

export type AdminRole = "owner" | "admin" | "sync";

export interface AdminUserRecord {
  email: string;
  role: AdminRole;
  active: boolean;
  permissions?: Partial<Record<AccessPermission, boolean>>;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

const ADMIN_USERS_COLLECTION = "admin_users";
const KNOWN_USERS_COLLECTION = "known_users";

export interface KnownUserRecord {
  email: string;
  uid?: string;
  displayName?: string | null;
  photoURL?: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeRole(value: unknown): AdminRole {
  if (value === "owner" || value === "admin" || value === "sync") {
    return value;
  }
  return "admin";
}

export async function getAdminUserByEmail(
  email: string | null | undefined
): Promise<AdminUserRecord | null> {
  if (!email) return null;

  const db = getFirestore();
  const docId = normalizeEmail(email);
  const snapshot = await db.collection(ADMIN_USERS_COLLECTION).doc(docId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  return {
    email: typeof data.email === "string" ? normalizeEmail(data.email) : docId,
    role: normalizeRole(data.role),
    active: data.active !== false,
    permissions:
      typeof data.permissions === "object" && data.permissions !== null
        ? (data.permissions as Partial<Record<AccessPermission, boolean>>)
        : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    createdBy:
      typeof data.createdBy === "string" || data.createdBy === null
        ? data.createdBy
        : undefined,
    updatedBy:
      typeof data.updatedBy === "string" || data.updatedBy === null
        ? data.updatedBy
        : undefined,
  };
}

export function hasPermission(
  user: AdminUserRecord | null,
  permission: AccessPermission
): boolean {
  if (!user || user.active === false) {
    return false;
  }

  if (user.role === "owner") {
    return true;
  }

  if (user.permissions?.[permission] === true) {
    return true;
  }

  switch (permission) {
    case "sync":
    case "batchClassify":
      return user.role === "admin" || user.role === "sync";
    case "manageMappings":
    case "manageApiClients":
      return user.role === "admin";
    case "manageUsers":
      return false;
    default:
      return false;
  }
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const db = getFirestore();
  const snapshot = await db.collection(ADMIN_USERS_COLLECTION).get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return {
        email:
          typeof data.email === "string"
            ? normalizeEmail(data.email)
            : normalizeEmail(doc.id),
        role: normalizeRole(data.role),
        active: data.active !== false,
        permissions:
          typeof data.permissions === "object" && data.permissions !== null
            ? (data.permissions as Partial<Record<AccessPermission, boolean>>)
            : undefined,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
        createdBy:
          typeof data.createdBy === "string" || data.createdBy === null
            ? data.createdBy
            : undefined,
        updatedBy:
          typeof data.updatedBy === "string" || data.updatedBy === null
            ? data.updatedBy
            : undefined,
      } satisfies AdminUserRecord;
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function upsertAdminUser(input: {
  email: string;
  role: AdminRole;
  active?: boolean;
  updatedBy?: string | null;
}): Promise<AdminUserRecord> {
  const db = getFirestore();
  const email = normalizeEmail(input.email);
  const docRef = db.collection(ADMIN_USERS_COLLECTION).doc(email);
  const now = new Date().toISOString();
  const existing = await docRef.get();

  const record: AdminUserRecord = {
    email,
    role: input.role,
    active: input.active ?? true,
    createdAt:
      existing.exists && typeof existing.data()?.createdAt === "string"
        ? existing.data()?.createdAt
        : now,
    updatedAt: now,
    createdBy:
      existing.exists && (typeof existing.data()?.createdBy === "string" || existing.data()?.createdBy === null)
        ? existing.data()?.createdBy
        : input.updatedBy ?? null,
    updatedBy: input.updatedBy ?? null,
  };

  await docRef.set(record, { merge: true });
  return record;
}

export async function deleteAdminUser(email: string): Promise<void> {
  const db = getFirestore();
  await db.collection(ADMIN_USERS_COLLECTION).doc(normalizeEmail(email)).delete();
}

export async function getOwnerCount(): Promise<number> {
  const users = await listAdminUsers();
  return users.filter((user) => user.active !== false && user.role === "owner").length;
}

export async function upsertKnownUser(input: {
  email: string;
  uid?: string;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<KnownUserRecord> {
  const email = normalizeEmail(input.email);
  const db = getFirestore();
  const docRef = db.collection(KNOWN_USERS_COLLECTION).doc(email);
  const snapshot = await docRef.get();
  const existing = snapshot.data() ?? {};
  const now = new Date().toISOString();

  const record: KnownUserRecord = {
    email,
    uid:
      typeof input.uid === "string" && input.uid
        ? input.uid
        : typeof existing.uid === "string"
          ? existing.uid
          : undefined,
    displayName:
      typeof input.displayName === "string"
        ? input.displayName
        : input.displayName === null
          ? null
          : typeof existing.displayName === "string"
            ? existing.displayName
            : existing.displayName === null
              ? null
              : undefined,
    photoURL:
      typeof input.photoURL === "string"
        ? input.photoURL
        : input.photoURL === null
          ? null
          : typeof existing.photoURL === "string"
            ? existing.photoURL
            : existing.photoURL === null
              ? null
              : undefined,
    firstSeenAt:
      typeof existing.firstSeenAt === "string" ? existing.firstSeenAt : now,
    lastSeenAt: now,
  };

  await docRef.set(record, { merge: true });
  return record;
}

export async function listKnownUsers(): Promise<KnownUserRecord[]> {
  const db = getFirestore();
  const snapshot = await db.collection(KNOWN_USERS_COLLECTION).get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return {
        email:
          typeof data.email === "string"
            ? normalizeEmail(data.email)
            : normalizeEmail(doc.id),
        uid: typeof data.uid === "string" ? data.uid : undefined,
        displayName:
          typeof data.displayName === "string" || data.displayName === null
            ? data.displayName
            : undefined,
        photoURL:
          typeof data.photoURL === "string" || data.photoURL === null
            ? data.photoURL
            : undefined,
        firstSeenAt:
          typeof data.firstSeenAt === "string" ? data.firstSeenAt : undefined,
        lastSeenAt:
          typeof data.lastSeenAt === "string" ? data.lastSeenAt : undefined,
      } satisfies KnownUserRecord;
    })
    .sort((a, b) => {
      const left = a.lastSeenAt ?? "";
      const right = b.lastSeenAt ?? "";
      return right.localeCompare(left);
    });
}
