"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Like useState, but persists the value to localStorage.
 * SSR-safe: renders with `defaultValue` on the server / first client paint,
 * then hydrates from localStorage in a useEffect.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(defaultValue);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        setState(JSON.parse(stored) as T);
      }
    } catch {
      // Ignore parse errors or disabled localStorage
    }
  }, [key]);

  const setPersistedState = useCallback(
    (value: T) => {
      setState(value);
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Ignore quota errors
      }
    },
    [key]
  );

  return [state, setPersistedState];
}
