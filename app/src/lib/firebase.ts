"use client";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
const authDomain =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
  (projectId ? `${projectId}.firebaseapp.com` : undefined);

const firebaseConfig = {
  apiKey,
  projectId,
  authDomain,
};

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function hasLikelyApiKey(value: string | undefined): boolean {
  return Boolean(value && /^AIza[0-9A-Za-z_-]{35}$/.test(value));
}

export function getFirebaseWebConfigError(): string | null {
  if (!projectId) {
    return "Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID. Add app/.env.local with the Firebase web config.";
  }

  if (!authDomain) {
    return "Missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN. Add app/.env.local with the Firebase web config.";
  }

  if (!hasLikelyApiKey(apiKey)) {
    return "Missing or invalid NEXT_PUBLIC_FIREBASE_API_KEY. Add app/.env.local with the Firebase web config.";
  }

  return null;
}

export function hasFirebaseWebConfig(): boolean {
  return getFirebaseWebConfigError() === null;
}

export function getClientDb(): Firestore {
  const configError = getFirebaseWebConfigError();
  if (configError) {
    throw new Error(configError);
  }

  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = getFirestore(app);
  return dbInstance;
}

export function getClientAuth(): Auth {
  const configError = getFirebaseWebConfigError();
  if (configError) {
    throw new Error(configError);
  }

  if (authInstance) {
    return authInstance;
  }

  authInstance = getAuth(app);
  return authInstance;
}
