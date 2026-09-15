import { Link } from "wouter";
import React, { useMemo, useState } from "react";
import {
  Bot,
  Check,
  ExternalLink,
  GitMerge,
  Plus,
  Search,
  TriangleAlert,
  Users,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fullDisplayName, getPerson, type Person } from "@/lib/family";
import { useEdit, type PersonPatch } from "@/components/EditContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type WebFindingField =
  | "birth_date" | "birth_place"
  | "death_date" | "death_place"
  | "burial_date" | "burial_place"
  | "occupation" | "military" | "education"
  | "note" | "parents_father" | "parents_mother";

export type WebFinding = {
  field: WebFindingField;
  suggested_value: string;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
  source_title?: string;
  source_url: string;
};

/** A flagged problem with an EXISTING value (date conflict, impossible age,
 *  wrong place, etc.) plus the proposed correction. */
export type WebCorrection = {
  field: WebFindingField;
  current_value: string;
  suggested_value: string;
  issue: string;
  confidence: "high" | "medium" | "low";
  source_title?: string;
  source_url?: string;
};

/** A likely link to ANOTHER person — a duplicate record, or a missing
 *  parent / spouse / sibling / child relationship. */
export type WebConnection = {
  relation: string;
  related_id?: string;
  related_name: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
};

/** A promising-but-unconfirmed record page found on the web. The AI surfaces
 *  these when it can't commit to a specific field value — so the family always
 *  gets real, clickable leads to verify by hand instead of a dead end. */
export type WebLead = {
  title: string;
  url: string;
  site?: string;
  /** Which anchors matched, e.g. "name + birth year + Troy NY". */
  matched?: string;
  /** What's still needed to confirm, e.g. "no spouse listed on the page". */
  missing?: string;
  confidence: "high" | "medium" | "low";
};

export type PersonWebFinding = {
  findings?: WebFinding[];
  corrections?: WebCorrection[];
  connections?: WebConnection[];
  leads?: WebLead[];
  narrative?: string;
  search_log?: string;
};

const CONFIDENCE_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  low: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
};

export const FIELD_LABELS: Record<WebFindingField, string> = {
  birth_date: "Birth date",
  birth_place: "Birth place",
  death_date: "Death date",
  death_place: "Death place",
  burial_date: "Burial date",
  burial_place: "Burial place",
  occupation: "Occupation",
  military: "Military",
  education: "Education",
  note: "Note",
  parents_father: "Father",
  parents_mother: "Mother",
};

/** Translate a WebFinding into a PersonPatch the EditContext can apply. */
export function findingToPatch(person: Person, finding: WebFinding): {
  patch: PersonPatch;
  before: string;
  after: string;
} | null {
  const v = finding.suggested_value.trim();
  if (!v) return null;
  switch (finding.field) {
    case "birth_date":
      return {
        patch: { birth: { ...(person.birth ?? {}), date: v, place: person.birth?.place ?? null, note: person.birth?.note ?? null } },
        before: person.birth?.date || "(empty)",
        after: v,
      };
    case "birth_place":
      return {
        patch: { birth: { ...(person.birth ?? {}), date: person.birth?.date ?? null, place: v, note: person.birth?.note ?? null } },
        before: person.birth?.place || "(empty)",
        after: v,
      };
    case "death_date":
      return {
        patch: { death: { ...(person.death ?? {}), date: v, place: person.death?.place ?? null, note: person.death?.note ?? null } },
        before: person.death?.date || "(empty)",
        after: v,
      };
    case "death_place":
      return {
        patch: { death: { ...(person.death ?? {}), date: person.death?.date ?? null, place: v, note: person.death?.note ?? null } },
        before: person.death?.place || "(empty)",
        after: v,
      };
    case "burial_date":
      return {
        patch: { burial: { ...(person.burial ?? {}), date: v, place: person.burial?.place ?? null, note: person.burial?.note ?? null } },
        before: person.burial?.date || "(empty)",
        after: v,
      };
    case "burial_place":
      return {
        patch: { burial: { ...(person.burial ?? {}), date: person.burial?.date ?? null, place: v, note: person.burial?.note ?? null } },
        before: person.burial?.place || "(empty)",
        after: v,
      };
    case "note":
    case "occupation":
    case "military":
    case "education":
    case "parents_father":
    case "parents_mother": {
      const prefix =
        finding.field === "parents_father" ? "AI suggested father: " :
        finding.field === "parents_mother" ? "AI suggested mother: " :
        finding.field === "occupation" ? "Occupation: " :
        finding.field === "military" ? "Military: " :
        finding.field === "education" ? "Education: " :
        "";
      const noteText = `${prefix}${v}${finding.source_url ? ` [source: ${finding.source_url}]` : ""}`;
      const existingNotes = person.notes || [];
      return {
        patch: { notes: [...existingNotes, noteText] },
        before: "(no note)",
        after: noteText,
      };
    }
  }
}

export function WebFindingsCard({
  person,
  finding,
  title = "Web research findings",
  headerRight,
}: {
  person: Person;
  finding: PersonWebFinding;
  title?: string;
  headerRight?: React.ReactNode;
}) {
  const { unlocked, setPatch, pending } = useEdit();
  const { toast } = useToast();
  const [preview, setPreview] = useState<WebFinding | null>(null);
  const findings = finding.findings ?? [];
  const corrections = finding.corrections ?? [];
  const connections = finding.connections ?? [];
  const leads = finding.leads ?? [];
  // Findings + corrections are both directly applyable as field edits.
  const applyable: WebFinding[] = [
    ...findings,
    ...corrections.map(correctionToFinding),
  ];

  function applyAll() {
    if (applyable.length === 0) return;
    const base = pending[person.id] || {};
    setPatch(person.id, buildFindingsPatch(person, base, applyable));
    toast({
      title: "Edits staged",
      description: `${applyable.length} AI ${applyable.length === 1 ? "suggestion" : "suggestions"} staged — review in the save bar.`,
    });
  }

  function saveAllConnections() {
    if (connections.length === 0) return;
    const base = pending[person.id] || {};
    let notes = base.notes ?? person.notes ?? [];
    for (const c of connections) {
      const ref = c.related_id ? ` (${c.related_id})` : "";
      notes = [...notes, `AI connection — ${c.relation}: ${c.related_name}${ref}. ${c.reasoning}`];
    }
    setPatch(person.id, { ...base, notes });
    toast({
      title: "Connections saved",
      description: `${connections.length} saved as notes — review in the save bar.`,
    });
  }
  const isEmpty =
    findings.length === 0 &&
    corrections.length === 0 &&
    connections.length === 0 &&
    leads.length === 0;

  // Connections can't yet be applied as structural edits (relationships are
  // editor v2), so the actionable move is to record them as a note on this
  // person for the family to review.
  function saveConnectionNote(c: WebConnection) {
    const ref = c.related_id ? ` (${c.related_id})` : "";
    const text = `AI connection — ${c.relation}: ${c.related_name}${ref}. ${c.reasoning}`;
    const existing = pending[person.id] || {};
    const existingNotes = existing.notes ?? person.notes ?? [];
    setPatch(person.id, { ...existing, notes: [...existingNotes, text] });
  }

  return (
    <div
      className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2.5"
      data-testid={`web-findings-${person.id}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-primary">
          <Bot className="h-3 w-3" />
          {title}
        </div>
        <div className="flex items-center gap-2">
          {unlocked && applyable.length > 0 && (
            <Button
              size="sm"
              className="min-h-9 px-3 text-[11px]"
              onClick={applyAll}
              data-testid={`apply-all-${person.id}`}
            >
              <Wand2 className="h-3 w-3 mr-1" />
              Apply all {applyable.length}
            </Button>
          )}
          {headerRight}
        </div>
      </div>
      {finding.narrative && (
        <p className="text-xs leading-relaxed text-foreground/90 mb-2.5 break-words">
          {finding.narrative}
        </p>
      )}
      {findings.length > 0 && (
        <>
          {(corrections.length > 0 || connections.length > 0) && (
            <SectionLabel icon={<Plus className="h-3 w-3" />} text="Suggested additions" />
          )}
        <ul className="space-y-2">
          {findings.map((f, i) => (
            <li
              key={i}
              className="rounded-md border border-card-border bg-background px-2.5 py-2 text-xs"
              data-testid={`web-finding-${person.id}-${i}`}
            >
              <div className="flex items-start gap-2 flex-wrap">
                <span className="inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                  {FIELD_LABELS[f.field] ?? f.field}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                    CONFIDENCE_COLORS[f.confidence],
                  )}
                >
                  {f.confidence}
                </span>
                <span className="font-medium text-foreground/95 flex-1 basis-full min-w-0 break-words">
                  {f.suggested_value}
                </span>
              </div>
              {f.reasoning && (
                <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed break-words">
                  {f.reasoning}
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                {f.source_url && (
                  <a
                    href={f.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[60%]"
                    data-testid={`finding-source-${person.id}-${i}`}
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{f.source_title || f.source_url}</span>
                  </a>
                )}
                {unlocked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-10 px-3 text-[11px]"
                    onClick={() => setPreview(f)}
                    data-testid={`apply-finding-${person.id}-${i}`}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Review & apply
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Unlock editor to apply</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      {/* Possible corrections — flagged problems with existing values. */}
      {corrections.length > 0 && (
        <>
          <SectionLabel
            icon={<TriangleAlert className="h-3 w-3" />}
            text="Possible corrections"
            tone="warn"
          />
          <ul className="space-y-2">
            {corrections.map((c, i) => (
              <li
                key={i}
                className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs"
                data-testid={`web-correction-${person.id}-${i}`}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {FIELD_LABELS[c.field] ?? c.field}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                      CONFIDENCE_COLORS[c.confidence],
                    )}
                  >
                    {c.confidence}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="text-muted-foreground line-through break-words">
                    {c.current_value || "(empty)"}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-foreground break-words">
                    {c.suggested_value}
                  </span>
                </div>
                {c.issue && (
                  <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed break-words">
                    {c.issue}
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                  {c.source_url ? (
                    <a
                      href={c.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline truncate max-w-[60%]"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.source_title || c.source_url}</span>
                    </a>
                  ) : (
                    <span />
                  )}
                  {unlocked ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10 px-3 text-[11px]"
                      onClick={() => setPreview(correctionToFinding(c))}
                      data-testid={`apply-correction-${person.id}-${i}`}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Review & fix
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Unlock editor to fix</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Possible connections — duplicates & missing relationships. */}
      {connections.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <SectionLabel
              icon={<GitMerge className="h-3 w-3" />}
              text="Possible connections"
            />
            {unlocked && (
              <button
                type="button"
                onClick={saveAllConnections}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 min-h-8 text-[10px] uppercase tracking-wider text-primary hover-elevate active-elevate-2"
                data-testid={`save-all-connections-${person.id}`}
              >
                <Plus className="h-3 w-3" /> Save all as notes
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {connections.map((c, i) => {
              const linked = c.related_id ? getPerson(c.related_id) : undefined;
              return (
                <li
                  key={i}
                  className="rounded-md border border-card-border bg-background px-2.5 py-2 text-xs"
                  data-testid={`web-connection-${person.id}-${i}`}
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
                      <Users className="h-2.5 w-2.5" />
                      {c.relation}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                        CONFIDENCE_COLORS[c.confidence],
                      )}
                    >
                      {c.confidence}
                    </span>
                    <span className="font-medium text-foreground/95 flex-1 basis-full min-w-0 break-words">
                      {linked ? (
                        <Link
                          href={`/person/${encodeURIComponent(linked.id)}`}
                          className="text-primary hover:underline"
                        >
                          {fullDisplayName(linked)}
                        </Link>
                      ) : (
                        c.related_name
                      )}
                    </span>
                  </div>
                  {c.reasoning && (
                    <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed break-words">
                      {c.reasoning}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                    {linked ? (
                      <Link
                        href={`/person/${encodeURIComponent(linked.id)}`}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        View profile
                      </Link>
                    ) : (
                      <span />
                    )}
                    {unlocked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-10 px-3 text-[11px]"
                        onClick={() => saveConnectionNote(c)}
                        data-testid={`save-connection-${person.id}-${i}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Save as note
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Unlock editor to save</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Records to check — promising pages the AI found but couldn't confirm.
          Always actionable: real links the family can open and verify. */}
      {leads.length > 0 && (
        <>
          <SectionLabel
            icon={<Search className="h-3 w-3" />}
            text="Records to check"
          />
          <ul className="space-y-2">
            {leads.map((l, i) => (
              <li
                key={i}
                className="rounded-md border border-card-border bg-background px-2.5 py-2 text-xs"
                data-testid={`web-lead-${person.id}-${i}`}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  {l.site && (
                    <span className="inline-flex items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-300">
                      {l.site}
                    </span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                      CONFIDENCE_COLORS[l.confidence],
                    )}
                  >
                    {l.confidence} match
                  </span>
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline break-words"
                  data-testid={`lead-link-${person.id}-${i}`}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="break-words">{l.title || l.url}</span>
                </a>
                {l.matched && (
                  <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed break-words">
                    Matches: {l.matched}
                  </div>
                )}
                {l.missing && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed break-words">
                    To confirm: {l.missing}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {isEmpty && !finding.narrative && (
        <p className="text-[11px] text-muted-foreground">No findings.</p>
      )}

      {preview && (
        <ApplyPreviewDialog
          person={person}
          finding={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/**
 * Fold a list of findings into a SINGLE PersonPatch, composed on top of any
 * edits already staged for this person. Composing iteratively (rather than
 * calling setPatch per item) is essential because several findings can touch
 * the same compound field — e.g. birth_date + birth_place both live on the
 * `birth` event, and notes append — so each step must see the running result.
 */
export function buildFindingsPatch(
  person: Person,
  base: PersonPatch,
  finds: WebFinding[],
): PersonPatch {
  let cur = { ...person, ...base } as Person;
  let patch: PersonPatch = { ...base };
  for (const f of finds) {
    const r = findingToPatch(cur, f);
    if (!r) continue;
    patch = { ...patch, ...r.patch };
    cur = { ...cur, ...r.patch } as Person;
  }
  return patch;
}

/** Convert a flagged correction into the WebFinding shape the apply dialog
 *  understands (the field-overwrite logic is identical to a fill). */
export function correctionToFinding(c: WebCorrection): WebFinding {
  return {
    field: c.field,
    suggested_value: c.suggested_value,
    confidence: c.confidence,
    reasoning: c.issue,
    source_title: c.source_title ?? "",
    source_url: c.source_url ?? "",
  };
}

function SectionLabel({
  icon,
  text,
  tone = "default",
}: {
  icon: React.ReactNode;
  text: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 mt-3 mb-2 text-[10px] uppercase tracking-[0.16em] first:mt-0",
        tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      {icon}
      {text}
    </div>
  );
}

function ApplyPreviewDialog({
  person,
  finding,
  onClose,
}: {
  person: Person;
  finding: WebFinding;
  onClose: () => void;
}) {
  const { setPatch, pending } = useEdit();
  const computed = useMemo(() => findingToPatch(person, finding), [person, finding]);
  if (!computed) {
    return null;
  }
  function onApply() {
    if (!computed) return;
    const existing = pending[person.id] || {};
    const next: PersonPatch = { ...existing, ...computed.patch };
    if (computed.patch.notes) {
      const existingNotes = existing.notes ?? person.notes ?? [];
      const newLine = computed.patch.notes[computed.patch.notes.length - 1];
      next.notes = [...existingNotes, newLine];
    }
    setPatch(person.id, next);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Apply this finding to {fullDisplayName(person)}?
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-card-border bg-muted/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {FIELD_LABELS[finding.field] ?? finding.field}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Before</div>
                <div className="text-foreground/80 break-words">{computed.before}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-primary mb-0.5">After</div>
                <div className="font-medium text-foreground break-words">{computed.after}</div>
              </div>
            </div>
          </div>
          {finding.source_url && (
            <a
              href={finding.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {finding.source_title || finding.source_url}
            </a>
          )}
          {finding.reasoning && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {finding.reasoning}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            This adds to your unsaved changes. You'll commit them on the{" "}
            <Link href="/changes" className="text-primary hover:underline">Changes page</Link>.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="apply-cancel">
            Cancel
          </Button>
          <Button onClick={onApply} data-testid="apply-confirm">
            <Check className="h-4 w-4 mr-1" />
            Add to changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
