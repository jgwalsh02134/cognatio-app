import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Person } from "@/lib/family";

// SHA-256 hash of the edit-mode passphrase. The plaintext is not stored anywhere —
// only this digest. To rotate the passphrase, run:
//   python3 -c "import hashlib; print(hashlib.sha256(b'NEWPHRASE').hexdigest())"
// and replace this constant in BOTH projects (main + JG3 fork).
const EDIT_PASSPHRASE_HASH =
  "e86d40bcfa645d4ddf651e9ff464144243505d98b94f25810d0879adca55cc17";

export interface EditableSource {
  title: string;
  url: string;
}

/**
 * Subset of Person that v1 allows editing. Stored as Partial so we only carry
 * the fields the user actually touched, which keeps diffs small and lets us
 * round-trip new fields (e.g. `sources`) that may not exist on the original.
 */
export type PersonPatch = Partial<{
  given: string;
  surname: string;
  suffix: string;
  sex: string | null;
  birth: Person["birth"];
  death: Person["death"];
  burial: Person["burial"];
  notes: string[];
  sources: EditableSource[];
  links: NonNullable<Person["links"]>;
  photo: Person["photo"];
  genetics: NonNullable<Person["genetics"]>;
  affiliations: NonNullable<Person["affiliations"]>;
  occupations: string[];
  residences: Person["residences"];
  educations: Person["educations"];
}>;

interface EditContextValue {
  unlocked: boolean;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  /**
   * The plaintext passphrase entered at unlock, kept in memory for the session
   * so authenticated saves can send it to the server (POST /api/archive). Null
   * when locked. Never persisted.
   */
  passcode: string | null;
  pending: Record<string, PersonPatch>;
  setPatch: (id: string, patch: PersonPatch) => void;
  discard: (id: string) => void;
  discardAll: () => void;
  count: number;
  hasChanges: boolean;
  /** Merge any pending (and already-saved-this-session) edits into a display copy. */
  merge: <T extends Person>(p: T) => T;

  /** Whether the server can persist edits permanently (proxy/archive mode). */
  archiveEnabled: boolean | null;
  /** True while a permanent save is in flight. */
  saving: boolean;
  /**
   * Commit all pending edits to the server archive in one call. On success the
   * edits move into a session overlay (so the view stays correct WITHOUT a full
   * page reload) and `pending` is cleared. Returns the outcome so callers can
   * surface a toast.
   */
  commitToArchive: () => Promise<{ ok: boolean; error?: string; saved?: number }>;
}

const Ctx = createContext<EditContextValue | null>(null);

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function EditProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, PersonPatch>>({});
  // Edits saved to the server THIS session. Kept as an overlay so a successful
  // save reflects immediately without forcing a full-page reload.
  const [saved, setSaved] = useState<Record<string, PersonPatch>>({});
  const [archiveEnabled, setArchiveEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // Probe once whether the server can persist edits permanently.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/archive/status")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => {
        if (!cancelled) setArchiveEnabled(!!j.enabled);
      })
      .catch(() => {
        if (!cancelled) setArchiveEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    const trimmed = passphrase.trim();
    const hash = await sha256(trimmed);
    if (hash === EDIT_PASSPHRASE_HASH) {
      setUnlocked(true);
      setPasscode(trimmed);
      return true;
    }
    return false;
  }, []);

  const lock = useCallback(() => {
    setUnlocked(false);
    setPasscode(null);
  }, []);

  const setPatch = useCallback((id: string, patch: PersonPatch) => {
    setPending((prev) => {
      const next = { ...prev };
      const existing = next[id] || {};
      const merged = { ...existing, ...patch };
      // Drop keys that are explicitly `undefined` from the patch
      for (const k of Object.keys(patch) as (keyof PersonPatch)[]) {
        if (patch[k] === undefined) delete (merged as Record<string, unknown>)[k];
      }
      // If empty after merge, drop the whole entry
      if (Object.keys(merged).length === 0) {
        delete next[id];
      } else {
        next[id] = merged;
      }
      return next;
    });
  }, []);

  const discard = useCallback((id: string) => {
    setPending((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const discardAll = useCallback(() => {
    setPending({});
  }, []);

  const merge = useCallback(
    <T extends Person>(p: T): T => {
      const s = saved[p.id];
      const patch = pending[p.id];
      if (!s && !patch) return p;
      return { ...p, ...(s || {}), ...(patch || {}) } as T;
    },
    [saved, pending],
  );

  const commitToArchive = useCallback(async () => {
    if (!passcode) {
      return { ok: false, error: "Unlock edit mode first so the save can be authenticated." };
    }
    const toSave = pending;
    const n = Object.keys(toSave).length;
    if (n === 0) return { ok: true, saved: 0 };
    setSaving(true);
    try {
      const r = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-passcode": passcode },
        body: JSON.stringify({ patches: toSave }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || `Server responded ${r.status}`);
      // Move saved edits into the session overlay, then clear pending — no reload.
      setSaved((prev) => {
        const next = { ...prev };
        for (const [id, patch] of Object.entries(toSave)) {
          next[id] = { ...(next[id] || {}), ...patch };
        }
        return next;
      });
      setPending({});
      return { ok: true, saved: n };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
    } finally {
      setSaving(false);
    }
  }, [passcode, pending]);

  const count = Object.keys(pending).length;
  const hasChanges = count > 0;

  // Warn before unload if there are unsaved edits.
  useEffect(() => {
    if (!hasChanges) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

  const value = useMemo<EditContextValue>(
    () => ({
      unlocked,
      unlock,
      lock,
      passcode,
      pending,
      setPatch,
      discard,
      discardAll,
      count,
      hasChanges,
      merge,
      archiveEnabled,
      saving,
      commitToArchive,
    }),
    [
      unlocked, unlock, lock, passcode, pending, setPatch, discard, discardAll,
      count, hasChanges, merge, archiveEnabled, saving, commitToArchive,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEdit() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEdit must be used inside <EditProvider>");
  return v;
}
