import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PersonWebFinding } from "@/components/WebFindingsCard";
import { safeGet, safeRemove, safeSet } from "@/lib/safeStorage";
import { checkServerAI, type AiAuth } from "@/lib/openai";
import { useAuth } from "@/components/AuthContext";

/**
 * How AI is authenticated this session:
 *  - "loading": still probing the server.
 *  - "proxy":   server holds the OpenAI key; access is gated by login (the
 *               session cookie), so no client secret is needed.
 *  - "direct":  no server key; the user brings their own OpenAI key (BYOK).
 */
export type AiMode = "loading" | "proxy" | "direct";

/** Storage key for the opt-in remembered BYOK OpenAI key (direct mode only). */
const DIRECT_KEY_STORAGE = "cognatio.openai_key";

/**
 * Session-only AI state. Holds:
 *  - The user-supplied OpenAI key (never persisted; lost on refresh).
 *  - Per-person web findings collected this session (overlay on static JSON).
 *  - Chat history.
 *
 * Rationale: the deployed site is a static bundle running inside a sandbox
 * that blocks localStorage/cookies. The key lives only in React state, which
 * is the right security posture anyway for a personal genealogy site.
 */

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  sources?: { title?: string; url: string }[];
  /** When true, this message is still streaming/loading. */
  pending?: boolean;
  error?: string;
}

interface AIContextValue {
  /** Server-probed auth mode (see AiMode). */
  aiMode: AiMode;
  /**
   * The user-supplied OpenAI key for direct (BYOK) mode. Null in proxy mode
   * (where login is the auth) or before a key is entered.
   */
  secret: string | null;
  /**
   * Set (or clear) the secret. Pass `remember: true` to persist it on this
   * device via crash-safe storage; `false` (or null) clears any stored copy.
   * When omitted, the current `rememberSecret` preference is used.
   */
  setSecret: (value: string | null, remember?: boolean) => void;
  /** Whether the secret is (or should be) persisted on this device. */
  rememberSecret: boolean;
  setRememberSecret: (remember: boolean) => void;
  /**
   * True once AI is usable: in proxy mode this means logged in; in direct
   * (BYOK) mode it means an OpenAI key has been provided.
   */
  aiReady: boolean;
  /** Build the auth object for openai.ts calls, or null if not ready. */
  getAuth: () => AiAuth | null;
  /** UI state for the direct-mode "enter OpenAI key" modal. */
  keyDialogOpen: boolean;
  openKeyDialog: () => void;
  closeKeyDialog: () => void;
  /**
   * Prompt the user for whatever AI access is missing: the OpenAI-key dialog in
   * direct mode, or the sign-in dialog in proxy mode.
   */
  promptForAiAccess: () => void;

  /** Runtime per-person findings. */
  researched: Record<string, PersonWebFinding>;
  setResearched: (id: string, finding: PersonWebFinding) => void;

  /** Currently in-flight research targets so the button can show a spinner. */
  researching: Set<string>;
  setResearching: (id: string, on: boolean) => void;

  /** Chat */
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  chatHistory: ChatMessage[];
  appendChat: (msg: ChatMessage) => void;
  updateChat: (id: string, patch: Partial<ChatMessage>) => void;
  removeChat: (id: string) => void;
  clearChat: () => void;
  /** Chat model name. */
  chatModel: string;
  setChatModel: (m: string) => void;
}

/**
 * Chat model picker. Names match OpenAI Responses API model IDs as of
 * mid-2026. gpt-5.4-mini is the default — fast, cheap, supports the
 * native web_search tool. gpt-5.5 is the flagship (slower, smartest).
 * gpt-5.4-nano is the cheapest option for high-volume use.
 */
export const CHAT_MODELS = [
  { id: "gpt-5.4-mini", label: "GPT\u20115.4 mini", hint: "Fast · cheap · default" },
  { id: "gpt-5.4", label: "GPT\u20115.4", hint: "Balanced · stronger reasoning" },
  { id: "gpt-5.5", label: "GPT\u20115.5", hint: "Flagship · smartest, slowest" },
  { id: "gpt-5.4-nano", label: "GPT\u20115.4 nano", hint: "Cheapest · short answers" },
] as const;

const Ctx = createContext<AIContextValue | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const { user, openAuthDialog } = useAuth();
  const [aiMode, setAiMode] = useState<AiMode>("loading");
  const [secret, setSecretInternal] = useState<string | null>(null);
  const [rememberSecret, setRememberSecretState] = useState<boolean>(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  // Probe the server once: if it has a key, we use login-gated proxy mode;
  // otherwise fall back to bring-your-own-key direct mode. Then hydrate any
  // remembered BYOK key (direct mode only — proxy mode needs no client secret).
  useEffect(() => {
    let cancelled = false;
    void checkServerAI().then((enabled) => {
      if (cancelled) return;
      const mode: AiMode = enabled ? "proxy" : "direct";
      setAiMode(mode);
      if (mode === "direct") {
        const stored = safeGet(DIRECT_KEY_STORAGE);
        if (stored) {
          setSecretInternal(stored);
          setRememberSecretState(true);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [researched, setResearchedState] = useState<Record<string, PersonWebFinding>>({});
  const [researching, setResearchingState] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatModel, setChatModel] = useState<string>("gpt-5.4-mini");

  // The remembered secret only applies to direct (BYOK) mode.
  const setSecret = useCallback(
    (value: string | null, remember?: boolean) => {
      const clean = value && value.trim() ? value.trim() : null;
      setSecretInternal(clean);
      const shouldRemember = remember ?? rememberSecret;
      if (remember !== undefined) setRememberSecretState(remember);
      if (clean && shouldRemember) {
        safeSet(DIRECT_KEY_STORAGE, clean);
      } else {
        safeRemove(DIRECT_KEY_STORAGE);
      }
    },
    [rememberSecret],
  );

  const setRememberSecret = useCallback(
    (remember: boolean) => {
      setRememberSecretState(remember);
      if (remember && secret) {
        safeSet(DIRECT_KEY_STORAGE, secret);
      } else {
        safeRemove(DIRECT_KEY_STORAGE);
      }
    },
    [secret],
  );

  const getAuth = useCallback((): AiAuth | null => {
    if (aiMode === "proxy") return user ? { mode: "proxy" } : null;
    return secret ? { mode: "direct", apiKey: secret } : null;
  }, [aiMode, secret, user]);

  const aiReady = aiMode === "proxy" ? !!user : !!secret;

  const openKeyDialog = useCallback(() => setKeyDialogOpen(true), []);
  const closeKeyDialog = useCallback(() => setKeyDialogOpen(false), []);

  // Prompt for whatever is missing to use AI: sign-in (proxy) or a key (direct).
  const promptForAiAccess = useCallback(() => {
    if (aiMode === "proxy") openAuthDialog();
    else setKeyDialogOpen(true);
  }, [aiMode, openAuthDialog]);

  const setResearched = useCallback((id: string, finding: PersonWebFinding) => {
    setResearchedState((prev) => ({ ...prev, [id]: finding }));
  }, []);

  const setResearching = useCallback((id: string, on: boolean) => {
    setResearchingState((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const appendChat = useCallback((msg: ChatMessage) => {
    setChatHistory((prev) => [...prev, msg]);
  }, []);

  const updateChat = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setChatHistory((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  }, []);

  const removeChat = useCallback((id: string) => {
    setChatHistory((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clearChat = useCallback(() => setChatHistory([]), []);

  const value = useMemo<AIContextValue>(
    () => ({
      aiMode,
      secret,
      setSecret,
      rememberSecret,
      setRememberSecret,
      aiReady,
      getAuth,
      keyDialogOpen,
      openKeyDialog,
      closeKeyDialog,
      promptForAiAccess,
      researched,
      setResearched,
      researching,
      setResearching,
      chatOpen,
      setChatOpen,
      chatHistory,
      appendChat,
      updateChat,
      removeChat,
      clearChat,
      chatModel,
      setChatModel,
    }),
    [
      aiMode,
      secret,
      setSecret,
      rememberSecret,
      setRememberSecret,
      aiReady,
      getAuth,
      keyDialogOpen,
      openKeyDialog,
      closeKeyDialog,
      promptForAiAccess,
      researched,
      setResearched,
      researching,
      setResearching,
      chatOpen,
      chatHistory,
      appendChat,
      updateChat,
      removeChat,
      clearChat,
      chatModel,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAI(): AIContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useAI must be used inside <AIProvider>");
  }
  return v;
}
