"use client";

import { useState, useEffect, useCallback, type SetStateAction, type Dispatch } from "react";

/**
 * Like useState, but persists the value to localStorage.
 * SSR-safe: renders with `defaultValue` on the server / first client paint,
 * then hydrates from localStorage in a useEffect.
 *
 * Supports functional updates like React's useState:
 *   setPersistedState(prev => next)
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const readStoredValue = useCallback((): T => {
    if (typeof window === "undefined") {
      return defaultValue;
    }

    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }, [defaultValue, key]);

  const [state, setState] = useState<T>(readStoredValue);

  // Hydrate from localStorage on mount (or when key changes)
  useEffect(() => {
    setState(readStoredValue());
  }, [readStoredValue]);

  const setPersistedState: Dispatch<SetStateAction<T>> = useCallback(
    (action: SetStateAction<T>) => {
      setState((prev) => {
        const next = typeof action === "function"
          ? (action as (prev: T) => T)(prev)
          : action;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Ignore quota errors
        }
        return next;
      });
    },
    [key]
  );

  return [state, setPersistedState];
}
