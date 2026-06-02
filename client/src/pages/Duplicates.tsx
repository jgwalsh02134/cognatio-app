import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  GitMerge,
  Lock,
  X,
} from "lucide-react";
import { fullDisplayName, lifespan, type Person } from "@/lib/family";
import {
  buildAbsorbPatch,
  buildDuplicateTagPatch,
  confidenceLabel,
  findDuplicatePairs,
  mergeRows,
  type DuplicatePair,
  type MergeFieldKey,
  type MergeRow,
} from "@/lib/duplicates";
import { PageHero } from "@/components/PageHero";
import { PersonAvatar } from "@/components/PersonAvatar";
import { NameFixChips } from "@/components/NameFixChips";
import { Card, CardContent } from "@/components/ui/card";
import { useEdit } from "@/components/EditContext";
import { cn } from "@/lib/utils";

const CONFIDENCE_TONE: Record<"high" | "medium" | "low", string> = {
  high: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  low: "bg-foreground/[0.06] text-muted-foreground border-border",
};

/** Rough completeness score to pick a sensible default canonical record. */
function completeness(p: Person): number {
  let s = 0;
  for (const v of [p.given, p.surname, p.birth?.date, p.birth?.place, p.death?.date, p.death?.place]) {
    if (v && String(v).trim()) s += 1;
  }
  s += (p.source_count ?? 0);
  s += (p.notes?.length ?? 0);
  s += (p.occupations?.length ?? 0);
  s += (p.residences?.length ?? 0) + (p.educations?.length ?? 0);
  s += (p.parent_ids?.length ?? 0) + (p.child_ids?.length ?? 0) + (p.spouse_ids?.length ?? 0);
  return s;
}

function pairKey(p: DuplicatePair): string {
  return `${p.a.id}__${p.b.id}`;
}

export default function Duplicates() {
  const allPairs = useMemo(() => findDuplicatePairs({ limit: 200 }), []);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const pairs = useMemo(
    () => allPairs.filter((p) => !dismissed.has(pairKey(p))),
    [allPairs, dismissed],
  );

  const highCount = useMemo(
    () => pairs.filter((p) => confidenceLabel(p.score) === "high").length,
    [pairs],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-5 py-5 sm:py-8">
      <PageHero
        eyebrow="Data quality"
        title="Find & merge duplicate people"
        description="This archive was merged from two Ancestry exports, so the same person often appears twice. These are likely duplicate pairs, ranked by confidence. Open one to compare field-by-field and absorb the duplicate's data into a single canonical record."
        icon={GitMerge}
        stats={[
          { label: "Likely pairs", value: pairs.length },
          { label: "High confidence", value: highCount, tone: "warn" },
          { label: "Merged this session", value: merged.size, tone: "good" },
        ]}
      />

      {pairs.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No likely duplicates found above the confidence threshold. 🎉
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pairs.map((pair) => {
            const key = pairKey(pair);
            return (
              <DuplicateCard
                key={key}
                pair={pair}
                expanded={expanded === key}
                isMerged={merged.has(key)}
                onToggle={() => setExpanded((e) => (e === key ? null : key))}
                onDismiss={() => setDismissed((s) => new Set(s).add(key))}
                onMerged={() => {
                  setMerged((s) => new Set(s).add(key));
                  setExpanded(null);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DuplicateCard({
  pair,
  expanded,
  isMerged,
  onToggle,
  onDismiss,
  onMerged,
}: {
  pair: DuplicatePair;
  expanded: boolean;
  isMerged: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onMerged: () => void;
}) {
  const conf = confidenceLabel(pair.score);
  // Default canonical = the more complete record.
  const aMoreComplete = completeness(pair.a) >= completeness(pair.b);
  const [canonicalId, setCanonicalId] = useState(aMoreComplete ? pair.a.id : pair.b.id);
  const canonical = canonicalId === pair.a.id ? pair.a : pair.b;
  const dup = canonicalId === pair.a.id ? pair.b : pair.a;

  return (
    <Card className={cn("border-card-border", isMerged && "opacity-70")}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
              CONFIDENCE_TONE[conf],
            )}
          >
            {conf} confidence
          </span>
          {pair.reasons.slice(0, 4).map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {r}
            </span>
          ))}
          {isMerged && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
              <Check className="h-3 w-3" /> Merge staged
            </span>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 min-h-9 text-[11px] text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
            data-testid={`dismiss-${pair.a.id}-${pair.b.id}`}
          >
            <X className="h-3 w-3" /> Not a duplicate
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <PersonMini person={pair.a} />
          <PersonMini person={pair.b} />
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-card px-3 py-2 min-h-10 text-xs font-medium hover-elevate active-elevate-2"
            data-testid={`compare-${pair.a.id}-${pair.b.id}`}
          >
            <GitMerge className="h-3.5 w-3.5" />
            {expanded ? "Hide comparison" : "Compare & merge"}
          </button>
        </div>

        {expanded && (
          <MergePanel
            canonical={canonical}
            dup={dup}
            canonicalId={canonicalId}
            aId={pair.a.id}
            bId={pair.b.id}
            onChooseCanonical={setCanonicalId}
            onMerged={onMerged}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PersonMini({ person }: { person: Person }) {
  const place = person.birth?.place ?? person.death?.place;
  return (
    <div className="rounded-md border border-card-border bg-background px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <PersonAvatar person={person} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/person/${encodeURIComponent(person.id)}`}
            className="text-sm font-medium truncate block hover:text-primary"
          >
            {fullDisplayName(person)}
          </Link>
          <div className="text-[11px] text-muted-foreground tabular-nums truncate">
            {lifespan(person)} · <span className="font-mono">{person.id}</span>
          </div>
        </div>
      </div>
      {place && (
        <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{place}</div>
      )}
      <div className="text-[10px] text-muted-foreground mt-1 flex gap-2 flex-wrap">
        <span>{person.source_count ?? 0} sources</span>
        <span>{(person.parent_ids?.length ?? 0)} parents</span>
        <span>{(person.child_ids?.length ?? 0)} children</span>
      </div>
      <NameFixChips person={person} />
    </div>
  );
}

const STATUS_STYLE: Record<MergeRow["status"], string> = {
  fill: "text-emerald-700 dark:text-emerald-300",
  conflict: "text-amber-700 dark:text-amber-300",
  same: "text-muted-foreground",
  "only-canonical": "text-muted-foreground",
  "only-none": "text-muted-foreground",
};

function MergePanel({
  canonical,
  dup,
  canonicalId,
  aId,
  bId,
  onChooseCanonical,
  onMerged,
}: {
  canonical: Person;
  dup: Person;
  canonicalId: string;
  aId: string;
  bId: string;
  onChooseCanonical: (id: string) => void;
  onMerged: () => void;
}) {
  const { unlocked, setPatch, pending } = useEdit();
  const [takeFromDup, setTakeFromDup] = useState<Set<MergeFieldKey>>(new Set());
  const rows = useMemo(() => mergeRows(canonical, dup), [canonical, dup]);

  function toggleTake(key: MergeFieldKey) {
    setTakeFromDup((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function stageMerge() {
    if (!unlocked) return;
    const absorb = buildAbsorbPatch(canonical, dup, takeFromDup);
    setPatch(canonical.id, { ...(pending[canonical.id] || {}), ...absorb });
    const tag = buildDuplicateTagPatch(dup, canonical);
    if (Object.keys(tag).length) {
      setPatch(dup.id, { ...(pending[dup.id] || {}), ...tag });
    }
    onMerged();
  }

  const fillCount = rows.filter((r) => r.status === "fill").length;
  const conflictCount = rows.filter((r) => r.status === "conflict").length;

  return (
    <div className="mt-3 rounded-md border border-card-border bg-background/60 p-3">
      {/* Canonical chooser */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Keep as canonical
        </span>
        {[
          { id: aId, label: fullDisplayName(canonicalId === aId ? canonical : dup) },
          { id: bId, label: fullDisplayName(canonicalId === bId ? canonical : dup) },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChooseCanonical(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 min-h-9 text-[11px] hover-elevate active-elevate-2",
              canonicalId === opt.id
                ? "border-primary/40 bg-primary/10 text-foreground font-medium"
                : "border-card-border text-muted-foreground",
            )}
          >
            <span className="font-mono">{opt.id}</span>
          </button>
        ))}
      </div>

      {/* Field comparison */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/60">
              <th className="py-1 pr-2 font-medium">Field</th>
              <th className="py-1 pr-2 font-medium">Canonical (kept)</th>
              <th className="py-1 pr-2 font-medium">Duplicate</th>
              <th className="py-1 font-medium text-right">Use dup?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/40 align-top">
                <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">{r.label}</td>
                <td className="py-1.5 pr-2 break-words">{r.canonical || <span className="text-muted-foreground/60">—</span>}</td>
                <td className={cn("py-1.5 pr-2 break-words", STATUS_STYLE[r.status])}>
                  {r.duplicate || <span className="text-muted-foreground/60">—</span>}
                  {r.status === "fill" && <span className="ml-1 text-[9px] uppercase tracking-wider">+ will add</span>}
                </td>
                <td className="py-1.5 text-right">
                  {r.status === "conflict" ? (
                    <input
                      type="checkbox"
                      checked={takeFromDup.has(r.key)}
                      onChange={() => toggleTake(r.key)}
                      aria-label={`Use duplicate's ${r.label}`}
                      className="h-4 w-4 align-middle"
                      data-testid={`take-${r.key}`}
                    />
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
        Merging fills <span className="text-foreground font-medium">{fillCount}</span> empty field
        {fillCount === 1 ? "" : "s"} on the canonical record and unions occupations, residences,
        and notes.{conflictCount > 0 && ` ${conflictCount} conflicting field${conflictCount === 1 ? "" : "s"} stay unless you tick "Use dup".`}{" "}
        It also tags <span className="font-mono">{dup.id}</span> as a duplicate. Relationship links
        aren't repointed yet — finish the structural removal with a patch script after reviewing.
      </p>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {unlocked ? (
          <button
            type="button"
            onClick={stageMerge}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 min-h-10 text-xs font-medium text-primary-foreground hover-elevate active-elevate-2"
            data-testid={`stage-merge-${canonical.id}-${dup.id}`}
          >
            <GitMerge className="h-3.5 w-3.5" />
            Stage merge into {canonical.id}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            Unlock the editor (lock icon, top right) to stage a merge.
          </span>
        )}
        <Link
          href="/changes"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          Review on Changes <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
