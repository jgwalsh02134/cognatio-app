import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  CHAT_MODELS,
  useAI,
  type ChatMessage,
} from "@/components/AIContext";
import type { AiMode } from "@/components/AIContext";
import { useEdit } from "@/components/EditContext";
import { Textarea } from "@/components/ui/textarea";
import { chat, buildArchiveSummary, type AiAuth } from "@/lib/openai";
import { people, getPerson, fullDisplayName } from "@/lib/family";
import { cn } from "@/lib/utils";

/**
 * Floating chat button + side drawer. Talks to OpenAI (Responses API with
 * web_search). Renders assistant replies as GitHub-flavored Markdown, with
 * copy / share / regenerate controls per message.
 */
export function AIChat() {
  const {
    aiMode,
    aiReady,
    getAuth,
    openKeyDialog,
    chatOpen,
    setChatOpen,
    chatHistory,
    appendChat,
    updateChat,
    removeChat,
    clearChat,
    chatModel,
    setChatModel,
  } = useAI();

  // When the EditSaveBar is visible we need to lift the launcher above it so
  // the two floating CTAs don't overlap.
  const { unlocked: editUnlocked, hasChanges: editHasChanges } = useEdit();

  // Memoize the archive summary once per session (~50 KB).
  const archiveSummary = useMemo(() => buildArchiveSummary(people), []);

  // Current page → page-aware suggestions.
  const [location] = useLocation();
  const editBarVisible = editUnlocked && editHasChanges && location !== "/changes";
  const currentPerson = useMemo(() => {
    const m = location.match(/^\/person\/(.+)$/);
    if (!m) return null;
    try {
      return getPerson(decodeURIComponent(m[1])) ?? null;
    } catch {
      return null;
    }
  }, [location]);

  return (
    <>
      {/* Floating launcher — inline-flex + w-fit guarantees shrink-to-fit
          inside any container/iframe. Hidden when the drawer is open so it
          never overlaps the Sheet animation. */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          data-ai-launcher
          className={cn(
            "fixed z-40 right-4 md:right-6 transition-[bottom] duration-200 print:hidden",
            editBarVisible
              ? "bottom-[calc(8rem+env(safe-area-inset-bottom))] md:bottom-20"
              : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6",
            "inline-flex w-fit items-center gap-2 rounded-full bg-primary text-primary-foreground",
            "px-4 py-2.5 shadow-lg hover-elevate active-elevate-2",
          )}
          aria-label="Open AI chat"
          data-testid="open-ai-chat"
        >
          <MessageCircle className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline text-sm font-medium whitespace-nowrap">Ask AI</span>
        </button>
      )}

      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md md:max-w-xl p-0 flex flex-col gap-0"
          data-testid="ai-chat-sheet"
        >
          <header className="flex items-center justify-between gap-2 px-4 py-3 border-b">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">Archive AI</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  OpenAI · web search
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <ModelPicker value={chatModel} onChange={setChatModel} />
              {chatHistory.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearChat}
                  className="h-8 px-2 text-[11px]"
                  data-testid="ai-chat-clear"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setChatOpen(false)}
                className="h-8 w-8"
                data-testid="ai-chat-close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {!aiReady ? (
            <ConnectKeyEmpty mode={aiMode} onConnect={openKeyDialog} />
          ) : (
            <ChatBody
              archiveSummary={archiveSummary}
              getAuth={getAuth}
              model={chatModel}
              history={chatHistory}
              appendChat={appendChat}
              updateChat={updateChat}
              removeChat={removeChat}
              currentPersonName={
                currentPerson
                  ? `${fullDisplayName(currentPerson)} (${currentPerson.id})`
                  : null
              }
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const current = CHAT_MODELS.find((m) => m.id === value) ?? CHAT_MODELS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-[11px] gap-1"
          data-testid="ai-chat-model"
        >
          {current.label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CHAT_MODELS.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => onChange(m.id)}
            className="flex flex-col items-start gap-0.5"
          >
            <div className="flex items-center gap-2 text-sm">
              {m.id === value && <Check className="h-3 w-3 text-primary" />}
              <span className={cn(m.id !== value && "pl-5")}>{m.label}</span>
            </div>
            <div className="pl-5 text-[10px] text-muted-foreground">{m.hint}</div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConnectKeyEmpty({
  mode,
  onConnect,
}: {
  mode: AiMode;
  onConnect: () => void;
}) {
  const proxy = mode === "proxy";
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="rounded-full bg-primary/10 p-3 mb-3">
        <KeyRound className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-display text-base font-semibold">
        {proxy ? "Unlock AI to chat" : "Connect OpenAI to chat"}
      </h3>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-xs">
        Chat sends a compact summary of every person in this archive to the
        chosen OpenAI model, with built-in web search when fresh facts are
        needed.{" "}
        {proxy
          ? "Enter the family access passphrase to unlock it."
          : "The key is held only in this browser tab."}
      </p>
      <Button
        onClick={onConnect}
        className="mt-4"
        size="sm"
        data-testid="ai-chat-connect"
        disabled={mode === "loading"}
      >
        <KeyRound className="h-3.5 w-3.5 mr-1.5" />
        {proxy ? "Enter passphrase" : "Add OpenAI key"}
      </Button>
    </div>
  );
}

function defaultPrompts(personName: string | null): string[] {
  const base = [
    "Which ancestors served in WWII? Make a Markdown table with name, branch, conflict.",
    "List the Walsh ancestors known to have emigrated from Ireland with dates and counties.",
    "What surnames are most common in this archive, and roughly when did each line arrive in New York?",
  ];
  if (personName) {
    return [
      `Find an obituary, FindAGrave entry, or census record for ${personName}. Summarize sources as a list with links.`,
      `Suggest the most likely parents and birth year for ${personName} based on people already in the archive.`,
      ...base,
    ];
  }
  return base;
}

function ChatBody({
  archiveSummary,
  getAuth,
  model,
  history,
  appendChat,
  updateChat,
  removeChat,
  currentPersonName,
}: {
  archiveSummary: string;
  getAuth: () => AiAuth | null;
  model: string;
  history: ChatMessage[];
  appendChat: (m: ChatMessage) => void;
  updateChat: (id: string, p: Partial<ChatMessage>) => void;
  removeChat: (id: string) => void;
  currentPersonName: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [history.length, sending]);

  async function send(content?: string, replaceHistoryTo?: number) {
    const text = (content ?? draft).trim();
    if (!text || sending) return;
    const auth = getAuth();
    if (!auth) return;
    setSending(true);
    setDraft("");

    // For regenerate: use a snapshot of history up to (but not including) the
    // old assistant message, then append a fresh user/assistant pair.
    const baseHistory =
      typeof replaceHistoryTo === "number"
        ? history.slice(0, replaceHistoryTo)
        : history;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantId = `a-${Date.now()}`;
    if (typeof replaceHistoryTo !== "number") {
      appendChat(userMsg);
    }
    appendChat({ id: assistantId, role: "assistant", content: "", pending: true });

    try {
      const result = await chat({
        auth,
        model,
        contextBlock: archiveSummary,
        history: baseHistory.map((h) => ({
          role: h.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: h.content,
        })),
        userMessage: text,
      });
      updateChat(assistantId, {
        content: result.text,
        sources: result.sources,
        pending: false,
      });
    } catch (e) {
      updateChat(assistantId, {
        content: "",
        error: e instanceof Error ? e.message : "Chat failed",
        pending: false,
      });
    } finally {
      setSending(false);
    }
  }

  function regenerate(assistantIdx: number) {
    // Find the user message immediately before this assistant message.
    const prior = [...history.slice(0, assistantIdx)].reverse().find((m) => m.role === "user");
    if (!prior) return;
    const assistantMsg = history[assistantIdx];
    removeChat(assistantMsg.id);
    void send(prior.content, assistantIdx);
  }

  const prompts = useMemo(() => defaultPrompts(currentPersonName), [currentPersonName]);

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
      >
        {history.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ask anything about people, places, or relationships in this
              archive — or have the AI search the open web for missing facts.
              Replies come back as formatted Markdown with source citations.
            </p>
            {currentPersonName && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-foreground">
                <span className="opacity-70">Viewing </span>
                <span className="font-medium">{currentPersonName}</span>
                <span className="opacity-70"> — prompts below are tailored to them.</span>
              </div>
            )}
            <div className="grid gap-1.5">
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-left text-xs rounded-md border border-card-border bg-card px-3 py-2 hover-elevate active-elevate-2 leading-relaxed"
                  data-testid={`suggested-prompt-${p.slice(0, 20)}`}
                >
                  <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          history.map((m, idx) => (
            <ChatBubble
              key={m.id}
              msg={m}
              canRegenerate={
                m.role === "assistant" && !m.pending && idx === history.length - 1
              }
              onRegenerate={() => regenerate(idx)}
            />
          ))
        )}
      </div>

      <div className="border-t px-3 py-2.5">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about a person, surname, place…"
            rows={1}
            className="resize-none min-h-[40px] max-h-[120px] text-sm"
            data-testid="ai-chat-input"
            disabled={sending}
          />
          <Button
            size="icon"
            onClick={() => send()}
            disabled={sending || !draft.trim()}
            data-testid="ai-chat-send"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
          Enter to send · Shift+Enter for newline · responses render as Markdown
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ChatBubble (markdown renderer + copy/share/regenerate)
// ---------------------------------------------------------------------------

function ChatBubble({
  msg,
  canRegenerate,
  onRegenerate,
}: {
  msg: ChatMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
      data-testid={`chat-bubble-${msg.role}`}
    >
      <div
        className={cn(
          "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {msg.pending ? (
          <PendingDots />
        ) : msg.error ? (
          <div className="text-xs text-destructive break-words">
            <span className="font-medium">Error:</span> {msg.error}
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {msg.content}
          </div>
        ) : (
          <AssistantMarkdown text={msg.content} />
        )}

        {msg.sources && msg.sources.length > 0 && <SourceList sources={msg.sources} />}

        {!isUser && !msg.pending && !msg.error && msg.content && (
          <MessageActions
            text={msg.content}
            sources={msg.sources}
            canRegenerate={canRegenerate}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}

function PendingDots() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground py-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="text-xs">Thinking & searching…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Pre-process: turn bare "(t0:I12345)" person ID refs into a markdown link to
 * the person page, so ReactMarkdown emits a real anchor we can intercept.
 */
function linkifyPersonIds(text: string): string {
  return text.replace(
    /\((t[01]:[A-Z0-9_]+)\)/g,
    (_, id) => `([${id}](#/person/${encodeURIComponent(id)}))`,
  );
}

function AssistantMarkdown({ text }: { text: string }) {
  const processed = useMemo(() => linkifyPersonIds(text), [text]);
  return (
    <div className="markdown-body leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...rest }) {
            const url = href ?? "";
            // In-app person links (hash router) → wouter Link
            const m = url.match(/^#\/person\/(.+)$/);
            if (m) {
              return (
                <Link
                  href={`/person/${m[1]}`}
                  className="text-primary hover:underline font-medium"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
                {...rest}
              >
                {children}
              </a>
            );
          },
          p({ children }) {
            return <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          h1({ children }) {
            return (
              <h3 className="font-display text-base font-semibold mt-2 mb-1">{children}</h3>
            );
          },
          h2({ children }) {
            return (
              <h3 className="font-display text-sm font-semibold mt-2 mb-1">{children}</h3>
            );
          },
          h3({ children }) {
            return (
              <h4 className="font-display text-sm font-semibold mt-1.5 mb-1">{children}</h4>
            );
          },
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-foreground/90 italic">
                {children}
              </blockquote>
            );
          },
          code({ className, children }) {
            const isBlock = (className ?? "").includes("language-");
            if (isBlock) {
              return (
                <pre className="my-2 rounded-md bg-foreground/5 border border-foreground/10 p-2.5 text-[11px] overflow-x-auto">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-foreground/10 px-1 py-0.5 text-[0.85em] font-mono">
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="border-b border-foreground/20">{children}</thead>;
          },
          th({ children }) {
            return <th className="text-left font-semibold py-1 pr-3 align-top">{children}</th>;
          },
          td({ children }) {
            return (
              <td className="py-1 pr-3 align-top border-b border-foreground/10">
                {children}
              </td>
            );
          },
          hr() {
            return <hr className="my-3 border-foreground/15" />;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources + actions
// ---------------------------------------------------------------------------

function SourceList({ sources }: { sources: { title?: string; url: string }[] }) {
  return (
    <div className="mt-2.5 pt-2 border-t border-foreground/10 space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider opacity-70">Sources</div>
      {sources.slice(0, 10).map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-[11px] hover:underline opacity-90"
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{s.title || s.url}</span>
        </a>
      ))}
    </div>
  );
}

function MessageActions({
  text,
  sources,
  canRegenerate,
  onRegenerate,
}: {
  text: string;
  sources?: { title?: string; url: string }[];
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  function shareText(): string {
    let out = text.trim();
    if (sources && sources.length) {
      out += "\n\n---\nSources:\n";
      sources.forEach((s, i) => {
        out += `${i + 1}. ${s.title ? `${s.title} — ` : ""}${s.url}\n`;
      });
    }
    return out;
  }

  async function copy() {
    const payload = shareText();
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access was blocked. Select the text manually.",
        variant: "destructive",
      });
    }
  }

  async function share() {
    const payload = shareText();
    const data = { title: "Archive AI answer", text: payload };
    // Use the native share sheet if available (mobile, modern desktop)
    const navAny = navigator as Navigator & {
      share?: (d: ShareData) => Promise<void>;
      canShare?: (d: ShareData) => boolean;
    };
    if (navAny.share && (!navAny.canShare || navAny.canShare(data))) {
      try {
        await navAny.share(data);
        return;
      } catch (e) {
        // User cancelled or share failed → fall through to clipboard.
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(payload);
      toast({
        title: "Copied to clipboard",
        description: "Sharing isn't available in this browser, so the answer was copied instead.",
      });
    } catch {
      toast({
        title: "Share unavailable",
        description: "Could not share or copy in this browser.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mt-2 pt-1.5 flex items-center gap-1 -mx-1">
      <button
        onClick={copy}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded hover-elevate active-elevate-2 text-muted-foreground"
        data-testid="chat-copy"
        aria-label="Copy answer"
      >
        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        onClick={share}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded hover-elevate active-elevate-2 text-muted-foreground"
        data-testid="chat-share"
        aria-label="Share answer"
      >
        <Share2 className="h-3 w-3" />
        Share
      </button>
      {canRegenerate && (
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded hover-elevate active-elevate-2 text-muted-foreground"
          data-testid="chat-regenerate"
          aria-label="Regenerate answer"
        >
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </button>
      )}
    </div>
  );
}
