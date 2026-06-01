import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PersonWebFinding } from "@/components/WebFindingsCard";

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
  /** Current OpenAI API key, or null if not set this session. */
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
  /** UI state for the "enter key" modal. */
  keyDialogOpen: boolean;
  openKeyDialog: () => void;
  closeKeyDialog: () => void;

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
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [researched, setResearchedState] = useState<Record<string, PersonWebFinding>>({});
  const [researching, setResearchingState] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatModel, setChatModel] = useState<string>("gpt-5.4-mini");

  const setApiKey = useCallback((key: string | null) => {
    setApiKeyState(key && key.trim() ? key.trim() : null);
  }, []);

  const openKeyDialog = useCallback(() => setKeyDialogOpen(true), []);
  const closeKeyDialog = useCallback(() => setKeyDialogOpen(false), []);

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
      apiKey,
      setApiKey,
      keyDialogOpen,
      openKeyDialog,
      closeKeyDialog,
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
      apiKey,
      setApiKey,
      keyDialogOpen,
      openKeyDialog,
      closeKeyDialog,
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
