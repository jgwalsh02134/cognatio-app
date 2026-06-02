import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, MessageSquare, Send, ThumbsUp, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEdit } from "@/components/EditContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/family";
import {
  addCommunityNote,
  communityNotesStatus,
  deleteCommunityNote,
  listCommunityNotes,
  markCommunityNoteHelpful,
  type CommunityNote,
} from "@/lib/communityNotes";

// Remember the contributor's name across people for the session (no storage —
// the deployed site runs in a sandbox that blocks it).
let lastAuthor = "";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helpfulDone = useRef<Set<string>>(new Set());
  const [, force] = useState(0);

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
    if (!passcode) {
      setError("Unlock edit mode (lock icon, top right) to contribute.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const note = await addCommunityNote({
        personId: person.id,
        author: author.trim() || "Anonymous",
        body: text,
        passcode,
      });
      lastAuthor = author.trim();
      setNotes((prev) => [note, ...prev]);
      setBody("");
      toast({ title: "Note posted", description: "Your community note is now visible to the family." });
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
    if (!window.confirm("Delete this community note?")) return;
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

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-display text-base font-semibold flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-primary" />
            Community notes
            {notes.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                ({notes.length})
              </span>
            )}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Shared family observations, corrections, memories, and source tips for this person.
          Anyone can read them; contributing uses the family passphrase.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
          </div>
        ) : enabled === false ? (
          <div className="rounded-md border border-card-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            Community notes are stored on the live site's server and aren't available on this
            offline build.
          </div>
        ) : (
          <>
            {notes.length > 0 ? (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-card-border bg-background px-3 py-2.5"
                    data-testid={`community-note-${n.id}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                        {initials(n.author)}
                      </span>
                      <span className="text-xs font-medium text-foreground truncate">{n.author}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {timeAgo(n.created_at)}
                      </span>
                      {unlocked && (
                        <button
                          type="button"
                          onClick={() => remove(n)}
                          aria-label="Delete note"
                          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:text-destructive hover-elevate active-elevate-2 shrink-0"
                          data-testid={`community-note-delete-${n.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line break-words">
                      {n.body}
                    </p>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => helpful(n)}
                        disabled={helpfulDone.current.has(n.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 min-h-8 text-[11px] hover-elevate active-elevate-2 disabled:opacity-60",
                          helpfulDone.current.has(n.id)
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-card-border text-muted-foreground",
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
              <p className="text-sm text-muted-foreground py-1">
                No community notes yet — be the first to add one.
              </p>
            )}

            {/* Contribute */}
            <div className="mt-4 pt-4 border-t border-border/60">
              {unlocked ? (
                <div className="space-y-2">
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
                    placeholder="Add a note, correction, memory, or source tip…"
                    rows={3}
                    className="text-sm resize-none"
                    data-testid="community-note-body"
                  />
                  {error && <p className="text-xs text-destructive break-words">{error}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to post</span>
                    <Button
                      size="sm"
                      onClick={submit}
                      disabled={submitting || !body.trim()}
                      data-testid="community-note-submit"
                      className="min-h-9"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Posting…
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 mr-1.5" /> Post note
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Unlock edit mode (the lock icon, top right) to contribute a community note.
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
