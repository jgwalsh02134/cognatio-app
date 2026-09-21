import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Session-based auth for the app.
 *
 * A logged-in user is identified by an httpOnly session cookie set by the
 * server; the browser never handles a token directly. All fetches use
 * `credentials: "same-origin"` so the cookie flows on same-origin requests.
 *
 * Nothing here touches localStorage/cookies directly, so it is safe to mount
 * even inside a sandboxed iframe where those APIs throw — auth simply won't
 * succeed there (the /api/auth/me probe returns null), and the app stays
 * usable read-only.
 */

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  register: (username: string, password: string) => Promise<AuthResult>;
  login: (username: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Auth dialog (login / create account) open state. */
  authDialogOpen: boolean;
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
}

const Ctx = createContext<AuthContextValue | null>(null);

async function readError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string };
    return j.error || `Request failed (${r.status})`;
  } catch {
    return `Request failed (${r.status})`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (!r.ok) {
        setUser(null);
        return;
      }
      const j = (await r.json()) as { user?: AuthUser | null };
      setUser(j.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  // Probe the session once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const register = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      try {
        const r = await fetch("/api/auth/register", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!r.ok) return { ok: false, error: await readError(r) };
        const j = (await r.json()) as { user?: AuthUser };
        setUser(j.user ?? null);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Network error",
        };
      }
    },
    [],
  );

  const login = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      try {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!r.ok) return { ok: false, error: await readError(r) };
        const j = (await r.json()) as { user?: AuthUser };
        setUser(j.user ?? null);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Network error",
        };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      /* ignore network errors — clear local state regardless */
    }
    setUser(null);
  }, []);

  const openAuthDialog = useCallback(() => setAuthDialogOpen(true), []);
  const closeAuthDialog = useCallback(() => setAuthDialogOpen(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      register,
      login,
      logout,
      refresh,
      authDialogOpen,
      openAuthDialog,
      closeAuthDialog,
    }),
    [
      user,
      loading,
      register,
      login,
      logout,
      refresh,
      authDialogOpen,
      openAuthDialog,
      closeAuthDialog,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
