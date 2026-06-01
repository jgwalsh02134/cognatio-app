/**
 * Crash-safe key/value persistence.
 *
 * The production site can run inside a sandboxed iframe where `localStorage`
 * access THROWS (not just returns null). Touching it directly there crashes
 * the page — which is why hard rule #1 forbids raw `localStorage`. This
 * wrapper guards every access in try/catch and transparently falls back to an
 * in-memory map when storage is unavailable, so callers get persistence on a
 * standalone domain and graceful session-only behavior inside a sandbox.
 *
 * Use this ONLY for transient UI/credential preferences (e.g. the OpenAI key),
 * never for genealogical data — the dataset lives in data.json.
 */

const memory = new Map<string, string>();

function backingStore(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probe = "__cognatio_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function safeGet(key: string): string | null {
  const store = backingStore();
  if (store) {
    try {
      return store.getItem(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memory.has(key) ? (memory.get(key) ?? null) : null;
}

export function safeSet(key: string, value: string): void {
  memory.set(key, value);
  const store = backingStore();
  if (store) {
    try {
      store.setItem(key, value);
    } catch {
      /* memory copy already holds it */
    }
  }
}

export function safeRemove(key: string): void {
  memory.delete(key);
  const store = backingStore();
  if (store) {
    try {
      store.removeItem(key);
    } catch {
      /* nothing else to do */
    }
  }
}
