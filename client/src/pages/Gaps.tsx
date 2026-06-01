import { Link } from "wouter";
import React, { useMemo, useState } from "react";
import {
  allGaps,

  fullDisplayName,
  guessSexFromGiven,
  getPerson,
  lifespan,
  parseYear,
  personCountry,
  GAP_LABELS,
  type GapType,
  type Person,
  type PersonGaps,
} from "@/lib/family";
import { copySearchString, linksFor, type ResearchLink } from "@/lib/researchLinks";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CountryFlag } from "@/components/CountryFlag";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Search,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
  Download,
  Printer,
  ArrowDownAZ,
  Hash,
  CalendarRange,
  Heart,
  Users as UsersIcon,
  User,
  Bot,
  Link2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import researchSuggestionsRaw from "@/research_suggestions.json";
import {
  WebFindingsCard,
  type PersonWebFinding,
} from "@/components/WebFindingsCard";
import { useAI } from "@/components/AIContext";

type DuplicateConn = {
  a_id: string;
  a_name?: string;
  b_id: string;
  b_name?: string;
  confidence?: "high" | "medium" | "low";
  reasons?: string[];
  /** legacy */ reason?: string;
};
type ClusterMember = { id: string; name?: string; year?: number; branch?: string; rank?: string; unit?: string };
type Cluster = { theme?: string; members?: ClusterMember[]; note?: string };

type ResearchSuggestions = {
  generated_at?: string | null;
  model?: string | null;
  web_findings?: Record<string, PersonWebFinding>;
  cross_record?: {
    duplicates?: DuplicateConn[];
    military_clusters?: Cluster[];
    place_era_clusters?: Cluster[];
  };
  // legacy keys (still readable if present)
  per_person?: Record<string, { research_priorities?: { gap?: string; suggestion?: string }[]; narrative?: string }>;
  connections?: { potential_duplicates?: DuplicateConn[]; potential_relationships?: { a_id: string; b_id: string; relationship?: string; reason?: string }[]; thematic_clusters?: Cluster[] };
};
const researchSuggestions = researchSuggestionsRaw as ResearchSuggestions;

const ALL_GAP_TYPES: GapType[] = [
  "birth_date",
  "birth_place",
  "death_date",
  "death_place",
  "parents",
  "marriage",
  "census",
  "sources",
  "surname",
  "sex",
];

const GAP_COLORS: Record<GapType, string> = {
  birth_date: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  birth_place: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  death_date: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  death_place: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  parents: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  surname: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  sex: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  marriage: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
  sources: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  census: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
};

type SortMode = "most_gaps" | "oldest" | "alpha";

const SORT_LABELS: Record<SortMode, string> = {
  most_gaps: "Most gaps first",
  oldest: "Oldest first",
  alpha: "A → Z",
};

const SORT_ICONS: Record<SortMode, React.ComponentType<{ className?: string }>> = {
  most_gaps: Hash,
  oldest: CalendarRange,
  alpha: ArrowDownAZ,
};

function GapPill({ gap }: { gap: GapType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider whitespace-nowrap",
        GAP_COLORS[gap],
      )}
      data-testid={`gap-pill-${gap}`}
    >
      {GAP_LABELS[gap]}
    </span>
  );
}

function ResearchChip({ link }: { link: ResearchLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.hint}
      className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background px-2.5 py-1 text-xs font-medium hover-elevate active-elevate-2"
      data-testid={`research-${link.id}`}
    >
      {link.countryName ? (
        <CountryFlag country={link.countryName} size="xs" />
      ) : (
        <ExternalLink className="h-3 w-3" />
      )}
      <span>{link.label}</span>
    </a>
  );
}

function CopyButton({ text, label, testId }: { text: string; label: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background px-2.5 py-1 text-xs font-medium hover-elevate active-elevate-2"
      data-testid={testId}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

function decadeOfBirth(p: Person): number | null {
  const y = parseYear(p.birth?.date);
  if (y === null) return null;
  return Math.floor(y / 10) * 10;
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes("\"") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function downloadCsv(rows: PersonGaps[]) {
  const headers = [
    "Name",
    "Lifespan",
    "Country",
    "Birth place",
    "Gaps",
    "Sex hint",
    "Search string",
  ];
  const lines = [headers.join(",")];
  for (const { person, gaps } of rows) {
    const sexHint = !person.sex ? guessSexFromGiven(person.given) || "" : "";
    const country = personCountry(person) || "";
    lines.push(
      [
        fullDisplayName(person),
        lifespan(person),
        country,
        person.birth?.place || "",
        gaps.map((g) => GAP_LABELS[g]).join(" / "),
        sexHint === "M" ? "likely male" : sexHint === "F" ? "likely female" : "",
        copySearchString(person),
      ]
        .map((v) => csvEscape(String(v ?? "")))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gaps-research-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Gaps() {
  const all = useMemo<PersonGaps[]>(() => allGaps(), []);
  const { researched } = useAI();
  const getFinding = (id: string): PersonWebFinding | undefined => {
    return researched[id] ?? researchSuggestions.web_findings?.[id];
  };

  // Counts
  const gapCounts = useMemo(() => {
    const counts: Record<GapType, number> = {
      birth_date: 0,
      birth_place: 0,
      death_date: 0,
      death_place: 0,
      parents: 0,
      surname: 0,
      sex: 0,
      marriage: 0,
      sources: 0,
      census: 0,
    };
    for (const item of all) {
      for (const g of item.gaps) counts[g]++;
    }
    return counts;
  }, [all]);

  const totalMissing = useMemo(
    () => Object.values(gapCounts).reduce((a, b) => a + b, 0),
    [gapCounts],
  );

  // Surface-able dimensions for filters
  const countryOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const { person } of all) {
      const c = personCountry(person) || "Unknown";
      map.set(c, (map.get(c) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const decadeOptions = useMemo(() => {
    const map = new Map<number, number>();
    for (const { person } of all) {
      const d = decadeOfBirth(person);
      if (d === null) continue;
      map.set(d, (map.get(d) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [all]);

  // Filter state
  const [filter, setFilter] = useState("");
  const [activeGap, setActiveGap] = useState<GapType | null>(null);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  const [activeDecade, setActiveDecade] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("most_gaps");

  const filtered = useMemo(() => {
    let list = all;
    if (activeGap) list = list.filter((g) => g.gaps.includes(activeGap));
    if (activeCountry) {
      list = list.filter((g) => (personCountry(g.person) || "Unknown") === activeCountry);
    }
    if (activeDecade !== null) {
      list = list.filter((g) => decadeOfBirth(g.person) === activeDecade);
    }
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      list = list.filter(
        (g) =>
          g.person.name.toLowerCase().includes(q) ||
          (g.person.birth?.place || "").toLowerCase().includes(q),
      );
    }
    // Sort
    const sorted = [...list];
    if (sortMode === "most_gaps") {
      sorted.sort(
        (a, b) =>
          b.gaps.length - a.gaps.length ||
          a.person.surname.localeCompare(b.person.surname) ||
          a.person.given.localeCompare(b.person.given),
      );
    } else if (sortMode === "oldest") {
      sorted.sort((a, b) => {
        const ay = parseYear(a.person.birth?.date) ?? 9999;
        const by = parseYear(b.person.birth?.date) ?? 9999;
        return ay - by;
      });
    } else {
      sorted.sort(
        (a, b) =>
          a.person.surname.localeCompare(b.person.surname) ||
          a.person.given.localeCompare(b.person.given),
      );
    }
    return sorted;
  }, [all, activeGap, activeCountry, activeDecade, filter, sortMode]);

  const anyFilterActive =
    activeGap !== null ||
    activeCountry !== null ||
    activeDecade !== null ||
    filter.trim().length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-5 py-6 sm:py-8">
      <header className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-[0.22em] text-primary mb-2">
          <Sparkles className="h-3.5 w-3.5" />
          Research helper
        </div>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold">
          Fill in the blanks
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
          {all.length} ancestors have something missing — {totalMissing} unknown fields
          in total. Pick a gap or a country, then jump straight to FamilySearch, Ancestry,
          or country-specific archives. Export to CSV for offline research.
        </p>
      </header>

      {/* Gap-type tally tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2 mb-4 sm:mb-6">
        <button
          onClick={() => setActiveGap(null)}
          className={cn(
            "flex flex-col items-start rounded-md border p-2.5 sm:p-3 text-left hover-elevate active-elevate-2 min-w-0",
            !activeGap ? "border-primary/60 bg-accent" : "border-card-border bg-card",
          )}
          data-testid="gap-filter-all"
        >
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate w-full">
            All
          </span>
          <span className="font-display text-xl sm:text-2xl font-semibold tabular-nums mt-1">
            {all.length}
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">people</span>
        </button>
        {ALL_GAP_TYPES.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGap((cur) => (cur === g ? null : g))}
            className={cn(
              "flex flex-col items-start rounded-md border p-2.5 sm:p-3 text-left hover-elevate active-elevate-2 min-w-0",
              activeGap === g ? "border-primary/60 bg-accent" : "border-card-border bg-card",
            )}
            data-testid={`gap-filter-${g}`}
          >
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate w-full">
              {GAP_LABELS[g]}
            </span>
            <span className="font-display text-xl sm:text-2xl font-semibold tabular-nums mt-1">
              {gapCounts[g]}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">missing</span>
          </button>
        ))}
      </div>

      {/* Toolbar: search, sort, export */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-full sm:min-w-[14rem] sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or place…"
            className="pl-9"
            data-testid="input-gap-filter"
          />
        </div>
        <div className="inline-flex rounded-md border border-card-border bg-card overflow-hidden">
          {(Object.keys(SORT_LABELS) as SortMode[]).map((s) => {
            const Icon = SORT_ICONS[s];
            return (
              <button
                key={s}
                onClick={() => setSortMode(s)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover-elevate active-elevate-2",
                  sortMode === s ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
                data-testid={`sort-${s}`}
              >
                <Icon className="h-3 w-3" />
                {SORT_LABELS[s]}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-card px-2.5 py-1.5 text-xs font-medium hover-elevate active-elevate-2 disabled:opacity-50 disabled:pointer-events-none"
            data-testid="button-export-csv"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-card-border bg-card px-2.5 py-1.5 text-xs font-medium hover-elevate active-elevate-2"
            data-testid="button-print"
          >
            <Printer className="h-3 w-3" />
            Print
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:gap-6 grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Sidebar: country + decade (collapsible on small screens) */}
        <details className="lg:hidden rounded-md border border-card-border bg-card min-w-0">
          <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none flex items-center justify-between">
            <span>Filter by country &amp; decade</span>
            <span className="text-muted-foreground">
              {[activeCountry, activeDecade !== null ? `${activeDecade}s` : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
          </summary>
          <div className="px-3 pb-3 pt-1 space-y-4">
            <FilterGroup
              title="Country"
              items={countryOptions.map(([c, n]) => ({
                key: c,
                label:
                  c === "Unknown" ? (
                    "Unknown"
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <CountryFlag country={c} size="sm" />
                      <span className="truncate">{c}</span>
                    </span>
                  ),
                count: n,
              }))}
              activeKey={activeCountry}
              onSelect={(k) =>
                setActiveCountry((cur) => (cur === k ? null : (k as string)))
              }
            />
            <FilterGroup
              title="Born in decade"
              items={decadeOptions.map(([d, n]) => ({
                key: String(d),
                label: `${d}s`,
                count: n,
              }))}
              activeKey={activeDecade !== null ? String(activeDecade) : null}
              onSelect={(k) =>
                setActiveDecade((cur) => {
                  const v = parseInt(k as string, 10);
                  return cur === v ? null : v;
                })
              }
            />
            {anyFilterActive && (
              <button
                onClick={() => {
                  setActiveGap(null);
                  setActiveCountry(null);
                  setActiveDecade(null);
                  setFilter("");
                }}
                className="w-full rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover-elevate active-elevate-2"
              >
                Clear all filters
              </button>
            )}
          </div>
        </details>

        {/* Sidebar (desktop) */}
        <aside className="space-y-6 print:hidden hidden lg:block">
          <FilterGroup
            title="Country"
            items={countryOptions.map(([c, n]) => ({
              key: c,
              label:
                c === "Unknown" ? (
                  "Unknown"
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <CountryFlag country={c} size="sm" />
                    <span className="truncate">{c}</span>
                  </span>
                ),
              count: n,
            }))}
            activeKey={activeCountry}
            onSelect={(k) =>
              setActiveCountry((cur) => (cur === k ? null : (k as string)))
            }
          />
          <FilterGroup
            title="Born in decade"
            items={decadeOptions.map(([d, n]) => ({
              key: String(d),
              label: `${d}s`,
              count: n,
            }))}
            activeKey={activeDecade !== null ? String(activeDecade) : null}
            onSelect={(k) =>
              setActiveDecade((cur) => {
                const v = parseInt(k as string, 10);
                return cur === v ? null : v;
              })
            }
          />
          {anyFilterActive && (
            <button
              onClick={() => {
                setActiveGap(null);
                setActiveCountry(null);
                setActiveDecade(null);
                setFilter("");
              }}
              className="w-full rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover-elevate active-elevate-2"
              data-testid="button-clear-filters"
            >
              Clear all filters
            </button>
          )}
        </aside>

        <div className="min-w-0">
          <AIConnectionsPanel suggestions={researchSuggestions} />

          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-muted-foreground" data-testid="gap-result-count">
              Showing {filtered.length} {filtered.length === 1 ? "person" : "people"}
              {activeGap ? ` · missing ${GAP_LABELS[activeGap].toLowerCase()}` : ""}
              {activeCountry ? ` · in ${activeCountry}` : ""}
              {activeDecade !== null ? ` · born ${activeDecade}s` : ""}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                Nothing matches.
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-2.5 sm:gap-3 grid-cols-1 xl:grid-cols-2">
              {filtered.map(({ person, gaps }) => (
                <li key={person.id} className="min-w-0">
                  <GapCard
                    person={person}
                    gaps={gaps}
                    webFinding={getFinding(person.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  items,
  activeKey,
  onSelect,
}: {
  title: string;
  items: { key: string; label: React.ReactNode; count: number }[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onSelect(it.key)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover-elevate active-elevate-2",
              activeKey === it.key
                ? "bg-accent text-accent-foreground font-medium"
                : "text-foreground/85",
            )}
            data-testid={`filter-${title.toLowerCase().replace(/\s+/g, "-")}-${it.key}`}
          >
            <span className="truncate">{it.label}</span>
            <span className="tabular-nums text-[11px] text-muted-foreground">{it.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GapCard({
  person,
  gaps,
  webFinding,
}: {
  person: Person;
  gaps: GapType[];
  webFinding?: PersonWebFinding;
}) {
  const sexHint = !person.sex ? guessSexFromGiven(person.given) : null;
  const links = useMemo(() => linksFor(person), [person]);

  // Show known anchors so the user has context without clicking through
  const parents = person.parent_ids.map(getPerson).filter(Boolean) as Person[];
  const spouses = person.spouse_ids.map(getPerson).filter(Boolean) as Person[];
  const children = person.child_ids.map(getPerson).filter(Boolean) as Person[];

  return (
    <div className="rounded-lg border border-card-border bg-card p-4 hover-elevate">
      <div className="flex items-start gap-3">
        <Link
          href={`/person/${encodeURIComponent(person.id)}`}
          className="shrink-0"
          data-testid={`gap-avatar-${person.id}`}
        >
          <PersonAvatar person={person} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/person/${encodeURIComponent(person.id)}`}
            className="font-medium hover:underline truncate block"
            data-testid={`gap-name-${person.id}`}
          >
            {fullDisplayName(person)}
          </Link>
          <div className="text-xs text-muted-foreground truncate">
            {lifespan(person)}
            {person.birth?.place ? ` · ${person.birth.place}` : ""}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {gaps.map((g) => (
              <GapPill key={g} gap={g} />
            ))}
          </div>
        </div>
      </div>

      {/* Anchors: parents / spouse / children inline */}
      {(parents.length > 0 || spouses.length > 0 || children.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-card-border text-[11px]">
          {parents.length > 0 && (
            <Anchor icon={<UsersIcon className="h-3 w-3" />} label="Parents" people={parents} />
          )}
          {spouses.length > 0 && (
            <Anchor icon={<Heart className="h-3 w-3" />} label="Spouse" people={spouses} />
          )}
          {children.length > 0 && (
            <Anchor icon={<User className="h-3 w-3" />} label="Children" people={children} />
          )}
        </div>
      )}

      {/* Sex-from-name hint */}
      {sexHint && (
        <div
          className="mt-3 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300"
          data-testid={`sex-hint-${person.id}`}
        >
          <span className="font-medium">Sex hint:</span>{" "}
          {sexHint === "M" ? "likely male" : "likely female"} based on the given name "
          {person.given.split(/\s+/)[0]}". Verify against a record before recording.
        </div>
      )}

      {/* Research deep links */}
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-card-border">
        {links.map((l) => (
          <ResearchChip key={l.id} link={l} />
        ))}
        <CopyButton
          text={copySearchString(person)}
          label="Copy search string"
          testId={`copy-search-${person.id}`}
        />
        <Link
          href={`/person/${encodeURIComponent(person.id)}`}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-primary hover:underline"
          data-testid={`gap-detail-${person.id}`}
        >
          View profile →
        </Link>
      </div>

      {webFinding && (webFinding.findings?.length || webFinding.narrative) && (
        <div className="mt-3">
          <WebFindingsCard person={person} finding={webFinding} />
        </div>
      )}
    </div>
  );
}

function PersonRef({ id }: { id: string }) {
  const p = getPerson(id);
  if (!p) {
    return <span className="font-mono text-[11px] text-muted-foreground">{id}</span>;
  }
  return (
    <Link
      href={`/person/${encodeURIComponent(p.id)}`}
      className="font-medium hover:underline"
      data-testid={`ai-ref-${p.id}`}
    >
      {fullDisplayName(p)}
    </Link>
  );
}

function AIConnectionsPanel({ suggestions }: { suggestions: ResearchSuggestions }) {
  const cr = suggestions.cross_record;
  // Prefer new schema, fall back to legacy `connections` only if cross_record is empty.
  const dupes: DuplicateConn[] =
    cr?.duplicates ?? suggestions.connections?.potential_duplicates ?? [];
  const milClusters: Cluster[] = cr?.military_clusters ?? [];
  const placeClusters: Cluster[] = cr?.place_era_clusters ?? [];
  const legacyClusters: Cluster[] = suggestions.connections?.thematic_clusters ?? [];
  const clusters: Cluster[] =
    milClusters.length + placeClusters.length > 0
      ? [...milClusters, ...placeClusters]
      : legacyClusters;

  const hasAny = dupes.length + clusters.length > 0;

  if (!hasAny) {
    return (
      <div
        className="mb-4 rounded-md border border-dashed border-card-border bg-card/50 px-3 sm:px-4 py-3 max-w-full overflow-hidden"
        data-testid="ai-panel-empty"
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
          <Bot className="h-3 w-3" />
          AI research assistant
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed break-words">
          No cross-record findings yet. Run this locally with an OpenAI key to
          populate web-sourced findings per person plus deterministic duplicate
          and cluster detection.
        </p>
        <code className="mt-2 block font-mono text-[11px] bg-muted px-2 py-1 rounded break-all">
          python3 analyze_archive.py
        </code>
      </div>
    );
  }

  const sortedDupes = [...dupes].sort((a, b) => {
    const rank = (c: "high" | "medium" | "low" | undefined) =>
      c === "high" ? 0 : c === "medium" ? 1 : 2;
    return rank(a.confidence) - rank(b.confidence);
  });

  return (
    <div
      className="mb-4 rounded-md border border-primary/25 bg-primary/5 px-3 sm:px-4 py-3 max-w-full overflow-hidden"
      data-testid="ai-connections-panel"
    >
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-primary">
          <Bot className="h-3 w-3" />
          Cross-record findings
        </div>
        <div className="text-[10px] text-muted-foreground">
          {suggestions.model ?? ""}
          {suggestions.generated_at ? ` · ${suggestions.generated_at.slice(0, 10)}` : ""}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Duplicates */}
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            <Link2 className="h-3 w-3" />
            Possible duplicates ({sortedDupes.length})
          </div>
          {sortedDupes.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">None flagged.</div>
          ) : (
            <ul className="space-y-1.5">
              {sortedDupes.slice(0, 6).map((d, i) => {
                const reasons =
                  d.reasons && d.reasons.length > 0
                    ? d.reasons
                    : d.reason
                      ? [d.reason]
                      : [];
                return (
                  <li key={i} className="text-[11px]" data-testid={`dupe-${i}`}>
                    <div className="flex items-start gap-1.5 flex-wrap">
                      <PersonRef id={d.a_id} />
                      <span className="text-muted-foreground">↔</span>
                      <PersonRef id={d.b_id} />
                      {d.confidence && (
                        <span
                          className={cn(
                            "ml-auto rounded-full px-1.5 py-0 text-[9px] uppercase tracking-wider",
                            d.confidence === "high"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : d.confidence === "medium"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {d.confidence}
                        </span>
                      )}
                    </div>
                    {reasons.length > 0 && (
                      <ul className="text-muted-foreground mt-0.5 ml-2 list-disc list-inside space-y-0.5">
                        {reasons.map((r, ri) => (
                          <li key={ri} className="break-words">
                            {r}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Military clusters */}
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            <UsersIcon className="h-3 w-3" />
            Military clusters ({milClusters.length})
          </div>
          {milClusters.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">None flagged.</div>
          ) : (
            <ul className="space-y-2">
              {milClusters.slice(0, 5).map((c, i) => (
                <ClusterEntry key={i} cluster={c} testId={`mil-cluster-${i}`} />
              ))}
            </ul>
          )}
        </div>

        {/* Place/era clusters */}
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            <Layers className="h-3 w-3" />
            Place &amp; era clusters ({placeClusters.length})
          </div>
          {placeClusters.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">None flagged.</div>
          ) : (
            <ul className="space-y-2">
              {placeClusters.slice(0, 5).map((c, i) => (
                <ClusterEntry key={i} cluster={c} testId={`place-cluster-${i}`} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ClusterEntry({ cluster, testId }: { cluster: Cluster; testId?: string }) {
  const members = cluster.members ?? [];
  return (
    <li className="text-[11px]" data-testid={testId}>
      <div className="font-medium">{cluster.theme}</div>
      {cluster.note && (
        <div className="text-muted-foreground mt-0.5">{cluster.note}</div>
      )}
      {members.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
          {members.slice(0, 8).map((m, i) => (
            <PersonRef key={`${m.id}-${i}`} id={m.id} />
          ))}
          {members.length > 8 && (
            <span className="text-muted-foreground">
              +{members.length - 8} more
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function Anchor({
  icon,
  label,
  people,
}: {
  icon: React.ReactNode;
  label: string;
  people: Person[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
        <span className="text-primary/80">{icon}</span>
        {label}
      </div>
      <div className="space-y-0.5">
        {people.slice(0, 3).map((p) => (
          <Link
            key={p.id}
            href={`/person/${encodeURIComponent(p.id)}`}
            className="block truncate hover:underline"
            data-testid={`anchor-${p.id}`}
          >
            {fullDisplayName(p)}
          </Link>
        ))}
        {people.length > 3 && (
          <div className="text-muted-foreground">+ {people.length - 3} more</div>
        )}
      </div>
    </div>
  );
}
