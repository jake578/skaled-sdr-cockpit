import { useCallback, useRef } from "react";

const memoryCache = new Map();
const pendingWrites = new Map();
const DEBOUNCE_MS = 500;

export function useStore() {
  const timersRef = useRef(new Map());

  const get = useCallback(async (key) => {
    // Return from memory cache if available
    if (memoryCache.has(key)) {
      return memoryCache.get(key);
    }

    try {
      const res = await fetch(
        `/.netlify/functions/store-get?key=${encodeURIComponent(key)}`,
        { credentials: "same-origin" }
      );

      if (!res.ok) {
        throw new Error(`Store fetch failed: ${res.status}`);
      }

      const data = await res.json();
      const value = data.value;

      if (value !== null && value !== undefined) {
        memoryCache.set(key, value);
      }

      return value;
    } catch {
      // Fall back to localStorage
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          memoryCache.set(key, parsed);
          return parsed;
        }
      } catch {
        // ignore parse errors
      }
      return null;
    }
  }, []);

  const set = useCallback((key, value) => {
    // Update memory cache immediately
    memoryCache.set(key, value);

    // Also write to localStorage as fallback
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage may be full or unavailable
    }

    // Debounce the server write
    const existingTimer = timersRef.current.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      timersRef.current.delete(key);
      try {
        const res = await fetch("/.netlify/functions/store-set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ key, value }),
        });

        if (!res.ok) {
          console.warn(`Store write failed for key "${key}": ${res.status}`);
        }
      } catch (err) {
        console.warn(`Store write error for key "${key}":`, err.message);
        // localStorage fallback already written above, so data is not lost
      }
    }, DEBOUNCE_MS);

    timersRef.current.set(key, timer);
  }, []);

  const remove = useCallback((key) => {
    memoryCache.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    // Write null to server to effectively delete
    set(key, null);
  }, [set]);

  return { get, set, remove };
}
