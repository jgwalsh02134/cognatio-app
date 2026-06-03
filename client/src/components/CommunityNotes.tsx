import { useEffect, useRef, useState } from "react";
import { Check, Info, Loader2, Lock, Send, StickyNote, ThumbsUp, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEdit } from "@/components/EditContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/family";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import {
  addCommunityNote,
  communityNotesStatus,
  deleteCommunityNote,
  listCommunityNotes,
  markCommunityNoteHelpful,
  NEON_COLORS,
  type CommunityNote,
} from "@/lib/communityNotes";
import memoAnimation from "@/assets/lottie/memo.json";

// Remember the contributor's name + last color across people for the session
// (no storage — the deployed site runs in a sandbox that blocks it).
let lastAuthor = "";
let lastColor: string = NEON_COLORS[1]; // default yellow

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t || Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// Deterministic slight tilt per note id so stickies look hand-placed but don't
// jump around on re-render.
function tilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 5) - 2; // -2deg … +2deg
}

const COLOR_LABELS: Record<string, string> = {
  "#FF10F0": "Pink",
  "#FFF01F": "Yellow",
  "#FF5E00": "Orange",
  "#39FF14": "Green",
  "#04D9FF": "Blue",
};

/**
 * Community notes for a person — shared, attributed observations that anyone can
 * read. Contributing is gated behind the family passphrase (the editor unlock),
 * matching the rest of the trusted-family write model. Persists server-side;
 * on builds with no server the section explains the feature is unavailable.
 */
export function CommunityNotes({ person }: { person: Person }) {
  const { unlocked, passcode } = useEdit();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [notes, setNotes] = useState<CommunityNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState(lastAuthor);
  const [body, setBody] = useState("");
  const [color, setColor] = useState<string>(lastColor);
  const [composerOpen, setComposerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helpfulDone = useRef<Set<string>>(new Set());
  const [, force] = useState(0);
  const memoRef = useRef<LottieRefCurrentProps | null>(null);

  // Replay the memo animation on each click, then toggle the composer.
  function toggleComposer() {
    memoRef.current?.stop();
    memoRef.current?.play();
    setComposerOpen((o) => !o);
  }

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      const ok = await communityNotesStatus(ctrl.signal);
      if (cancelled) return;
      setEnabled(ok);
      if (ok) {
        const list = await listCommunityNotes(person.id, ctrl.signal);
        if (!cancelled) setNotes(list);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [person.id]);

  async function submit() {
    const text = body.trim();
    if (!text || submitting) return;
    if (enabled === false) {
      setError("Sticky notes need the live site's database — not available on this offline build.");
      return;
    }
    if (!passcode) {
      setError("Unlock edit mode (the lock icon, top right) to post.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const note = await addCommunityNote({
        personId: person.id,
        author: author.trim() || "Anonymous",
        body: text,
        color,
        passcode,
      });
      lastAuthor = author.trim();
      lastColor = color;
      setNotes((prev) => [note, ...prev]);
      setBody("");
      toast({ title: "Sticky posted", description: "Your note is now pinned to this profile for the family." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post note");
    } finally {
      setSubmitting(false);
    }
  }

  async function helpful(note: CommunityNote) {
    if (helpfulDone.current.has(note.id)) return;
    helpfulDone.current.add(note.id);
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, helpful: n.helpful + 1 } : n)));
    force((x) => x + 1);
    try {
      const h = await markCommunityNoteHelpful(note.id);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, helpful: h } : n)));
    } catch {
      // Roll back the optimistic bump on failure.
      helpfulDone.current.delete(note.id);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, helpful: Math.max(0, n.helpful - 1) } : n)));
    }
  }

  async function remove(note: CommunityNote) {
    if (!passcode) return;
    if (!window.confirm("Delete this sticky note?")) return;
    const prev = notes;
    setNotes((cur) => cur.filter((n) => n.id !== note.id));
    try {
      await deleteCommunityNote(note.id, passcode);
    } catch (e) {
      setNotes(prev);
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  }

  // Whether a post can actually go through, and why not.
  const canPost = enabled === true && !!passcode;
  const postBlockedReason =
    enabled === false
      ? "Sticky notes save to the live site's database — they aren't available on this local/offline build."
      : !passcode
        ? "Unlock edit mode (the lock icon at the top right) to post — then pick a color and pin your note."
        : null;

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-display text-base font-semibold flex items-center gap-1.5">
            <StickyNote className="h-4 w-4 text-primary" />
            Sticky notes
            {notes.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                ({notes.length})
              </span>
            )}
          </h2>
          {!loading && (
            <button
              type="button"
              onClick={toggleComposer}
              aria-expanded={composerOpen}
              className="group inline-flex items-center gap-1.5 rounded-md px-3 min-h-10 text-sm font-bold text-neutral-900 transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              style={{
                backgroundColor: "#FFF01F",
                boxShadow:
                  "0 1px 2px rgba(0,0,0,0.3), 0 6px 18px rgba(255,240,31,0.55), inset 0 0 0 1px rgba(0,0,0,0.08)",
              }}
              data-testid="add-sticky-toggle"
            >
              <Lottie
                lottieRef={memoRef}
                animationData={memoAnimation}
                loop={false}
                autoplay={false}
                className="h-6 w-6 shrink-0"
                aria-hidden="true"
              />
              {composerOpen ? "Close" : "Add a sticky"}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Pin a colorful note to this profile — observations, corrections, memories, or source
          tips. Everyone can read the stickies; posting uses the family passphrase.
        </p>

        {/* Composer — opens in any state and always says what's needed to post. */}
        {composerOpen && (
          <div className="mb-5 rounded-md border border-card-border bg-muted/30 p-3 space-y-2">
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your name (optional)"
              className="h-9"
              data-testid="community-note-author"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              placeholder="Write a note, correction, memory, or source tip…"
              rows={3}
              className="text-sm resize-none"
              data-testid="community-note-body"
            />
            {/* Neon color picker — wraps so 5 swatches never overflow narrow phones */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Color
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {NEON_COLORS.map((c) => {
                  const active = color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={COLOR_LABELS[c] ?? c}
                      aria-pressed={active}
                      title={COLOR_LABELS[c] ?? c}
                      className={cn(
                        "relative h-9 w-9 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 active:scale-95",
                        active ? "ring-2 ring-foreground" : "ring-1 ring-black/10",
                      )}
                      style={{ backgroundColor: c }}
                      data-testid={`community-note-color-${c.replace("#", "")}`}
                    >
                      {active && (
                        <Check className="absolute inset-0 m-auto h-4 w-4 text-neutral-900" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {error && <p className="text-xs text-destructive break-words">{error}</p>}
            {postBlockedReason && (
              <div className="flex items-start gap-2 rounded-md bg-background/70 px-2.5 py-2 text-[11px] text-muted-foreground">
                {enabled === false ? (
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                ) : (
                  <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                )}
                <span>{postBlockedReason}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {canPost ? "⌘/Ctrl + Enter to post" : ""}
              </span>
              <Button
                size="sm"
                onClick={submit}
                disabled={submitting || !body.trim() || !canPost}
                data-testid="community-note-submit"
                className="min-h-9"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Posting…
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-1.5" /> Post sticky
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
          </div>
        ) : enabled === false ? (
          !composerOpen && (
            <div className="rounded-md border border-card-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              Sticky notes are stored on the live site's server and aren't available on this
              offline build. Tap <span className="font-medium text-foreground">Add a sticky</span>{" "}
              to see how it works.
            </div>
          )
        ) : notes.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-[3px] p-3 text-neutral-900"
                style={{
                  backgroundColor: n.color,
                  transform: `rotate(${tilt(n.id)}deg)`,
                  boxShadow: `0 1px 2px rgba(0,0,0,0.25), 0 6px 16px ${n.color}66`,
                }}
                data-testid={`community-note-${n.id}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/15 text-neutral-900 text-[10px] font-bold">
                    {initials(n.author)}
                  </span>
                  <span className="text-xs font-semibold truncate">{n.author}</span>
                  <span className="text-[10px] text-neutral-900/60 tabular-nums">
                    {timeAgo(n.created_at)}
                  </span>
                  {unlocked && (
                    <button
                      type="button"
                      onClick={() => remove(n)}
                      aria-label="Delete note"
                      className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded text-neutral-900/55 hover:text-neutral-900 hover:bg-black/10 shrink-0"
                      data-testid={`community-note-delete-${n.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-sm font-medium leading-relaxed whitespace-pre-line break-words">
                  {n.body}
                </p>
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => helpful(n)}
                    disabled={helpfulDone.current.has(n.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 min-h-9 text-[11px] font-medium disabled:opacity-70",
                      helpfulDone.current.has(n.id)
                        ? "bg-black/25 text-neutral-900"
                        : "bg-black/10 text-neutral-900/80 hover:bg-black/20",
                    )}
                    data-testid={`community-note-helpful-${n.id}`}
                  >
                    <ThumbsUp className="h-3 w-3" />
                    Helpful{n.helpful > 0 ? ` · ${n.helpful}` : ""}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !composerOpen && (
            <p className="text-sm text-muted-foreground py-1">
              No sticky notes yet — tap{" "}
              <span className="font-medium text-foreground">Add a sticky</span> to pin the first one.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
