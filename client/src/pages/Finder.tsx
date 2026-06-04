import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Copy,
  RefreshCw,
  Search,
  Telescope,
} from "lucide-react";
import {
  fullDisplayName,
  lifespan,
  parseYear,
  personCountry,
  type Person,
} from "@/lib/family";
import {
  advancedFind,
  finderQueryToParams,
  paramsToFinderQuery,
  type FinderQuery,
} from "@/lib/discoveries";
import { PageHero } from "@/components/PageHero";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CountryFlag } from "@/components/CountryFlag";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SortKey = "name" | "birth" | "death" | "surname" | "place" | "sources" | "children";

const MOBILE_SORT_OPTIONS: [SortKey, string][] = [
  ["name", "Person"],
  ["surname", "Surname"],
  ["birth", "Born"],
  ["death", "Died"],
  ["place", "Place"],
  ["sources", "Sources"],
  ["children", "Children"],
];

const DEFAULT_QUERY: FinderQuery = {
  sex: "any",
  hasSource: "any",
  hasChildren: "any",
  hasParents: "any",
  living: "any",
  brickWall: false,
  military: false,
  immigrant: false,
};

export default function Finder() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const initial = useMemo<FinderQuery>(() => {
    return search
      ? { ...DEFAULT_QUERY, ...paramsToFinderQuery(search) }
      : { ...DEFAULT_QUERY };
    // Read once on mount; the URL is written from state thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [query, setQuery] = useState<FinderQuery>(initial);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });
  const [advancedOpen, setAdvancedOpen] = useState(true);

  // Push query into the URL hash for shareable searches. `location` is the
  // path only (search lives in `search`), so rebuild the full target here.
  useEffect(() => {
    const params = finderQueryToParams(query);
    const next = params ? `${location}?${params}` : location;
    const current = search ? `${location}?${search}` : location;
    if (next !== current) setLocation(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const results = useMemo(() => advancedFind(query), [query]);
  const sorted = useMemo(() => sortResults(results, sort), [results, sort]);

  function reset() {
    setQuery({ ...DEFAULT_QUERY });
  }

  function update<K extends keyof FinderQuery>(key: K, val: FinderQuery[K]) {
    setQuery((q) => ({ ...q, [key]: val }));
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-5 py-5 sm:py-8">
      <PageHero
        eyebrow="Advanced finder"
        title="Filter the archive by anything you know"
        description="Combine name, place, era, sources, lineage gaps, military service, and migration to surface the exact people you're researching. Every search is shareable — the filters live in the URL."
        icon={Telescope}
        stats={[
          { label: "Matches", value: results.length, tone: "primary" },
          { label: "With sources", value: results.filter((p) => p.source_count > 0).length },
          { label: "Brick walls", value: results.filter((p) => p.parent_ids.length === 0).length },
          {
            label: "Living",
            value: results.filter((p) => !p.death?.date && parseYear(p.birth?.date)).length,
          },
        ]}
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          {/* Quick row — keyword + reset */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query.text ?? ""}
                onChange={(e) => update("text", e.target.value)}
                placeholder="Search name, given, or surname…"
                className="w-full rounded-md border border-border/70 bg-background/60 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/15"
                data-testid="finder-text"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-3 py-2 text-xs hover-elevate active-elevate-2 min-h-10"
              >
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", !advancedOpen && "-rotate-90")}
                />
                {advancedOpen ? "Hide filters" : "Show filters"}
              </button>
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-3 py-2 text-xs hover-elevate active-elevate-2 min-h-10 min-w-10"
                title="Reset filters"
                aria-label="Reset filters"
              >
                <RefreshCw className="h-3 w-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <CopyShareUrl />
            </div>
          </div>

          {/* Advanced filters */}
          {advancedOpen && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FieldInput
                label="Surname"
                value={query.surname ?? ""}
                onChange={(v) => update("surname", v || undefined)}
              />
              <FieldInput
                label="Given name"
                value={query.given ?? ""}
                onChange={(v) => update("given", v || undefined)}
              />
              <FieldInput
                label="Place (any event)"
                value={query.place ?? ""}
                onChange={(v) => update("place", v || undefined)}
                placeholder="e.g. Limerick, Boston"
              />
              <FieldInput
                label="Country"
                value={query.country ?? ""}
                onChange={(v) => update("country", v || undefined)}
                placeholder="Ireland · United States · Germany"
              />
              <FieldInput
                label="Occupation"
                value={query.occupation ?? ""}
                onChange={(v) => update("occupation", v || undefined)}
                placeholder="farmer, teacher, …"
              />
              <FieldSelect
                label="Sex"
                value={query.sex ?? "any"}
                onChange={(v) => update("sex", v as FinderQuery["sex"])}
                options={[
                  ["any", "Any"],
                  ["M", "Male"],
                  ["F", "Female"],
                ]}
              />
              <FieldYearRange
                label="Birth year"
                from={query.birthFrom}
                to={query.birthTo}
                onFrom={(v) => update("birthFrom", v)}
                onTo={(v) => update("birthTo", v)}
              />
              <FieldYearRange
                label="Death year"
                from={query.deathFrom}
                to={query.deathTo}
                onFrom={(v) => update("deathFrom", v)}
                onTo={(v) => update("deathTo", v)}
              />
              <FieldSelect
                label="Has source"
                value={query.hasSource ?? "any"}
                onChange={(v) => update("hasSource", v as FinderQuery["hasSource"])}
                options={[
                  ["any", "Any"],
                  ["yes", "Yes"],
                  ["no", "No"],
                ]}
              />
              <FieldSelect
                label="Has parents on record"
                value={query.hasParents ?? "any"}
                onChange={(v) => update("hasParents", v as FinderQuery["hasParents"])}
                options={[
                  ["any", "Any"],
                  ["yes", "Yes"],
                  ["no", "No"],
                ]}
              />
              <FieldSelect
                label="Has children"
                value={query.hasChildren ?? "any"}
                onChange={(v) => update("hasChildren", v as FinderQuery["hasChildren"])}
                options={[
                  ["any", "Any"],
                  ["yes", "Yes"],
                  ["no", "No"],
                ]}
              />
              <FieldSelect
                label="Living"
                value={query.living ?? "any"}
                onChange={(v) => update("living", v as FinderQuery["living"])}
                options={[
                  ["any", "Any"],
                  ["yes", "Yes"],
                  ["no", "No"],
                ]}
              />
              <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2 mt-1">
                <Toggle
                  label="Brick wall (no parents & no parent-family)"
                  active={!!query.brickWall}
                  onChange={(v) => update("brickWall", v)}
                />
                <Toggle
                  label="Has military service"
                  active={!!query.military}
                  onChange={(v) => update("military", v)}
                />
                <Toggle
                  label="Cross-country migrant"
                  active={!!query.immigrant}
                  onChange={(v) => update("immigrant", v)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results table */}
      <div className="mt-5">
        {sorted.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No matches for these filters. Try loosening one — or use Reset to start over.
            </CardContent>
          </Card>
        ) : (
          <ResultsTable rows={sorted} sort={sort} onSort={toggleSort} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-sm normal-case tracking-normal text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/15"
      />
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-sm normal-case tracking-normal text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/15"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldYearRange({
  label,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  from: number | undefined;
  to: number | undefined;
  onFrom: (v: number | undefined) => void;
  onTo: (v: number | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      {label}
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={from ?? ""}
          onChange={(e) => onFrom(e.target.value ? parseInt(e.target.value, 10) : undefined)}
          placeholder="from"
          className="w-full rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-sm normal-case tracking-normal text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/15"
        />
        <span className="text-muted-foreground">–</span>
        <input
          type="number"
          value={to ?? ""}
          onChange={(e) => onTo(e.target.value ? parseInt(e.target.value, 10) : undefined)}
          placeholder="to"
          className="w-full rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-sm normal-case tracking-normal text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/15"
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-2.5 text-xs transition-colors hover-elevate active-elevate-2",
        active
          ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
          : "border-border/70 bg-background/40 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          active ? "bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      {label}
    </button>
  );
}

function CopyShareUrl() {
  const [done, setDone] = useState(false);
  function handle() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    });
  }
  return (
    <button
      onClick={handle}
      className="inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-3 py-2 text-xs hover-elevate active-elevate-2 min-h-10 min-w-10"
      title="Copy shareable URL"
      aria-label="Copy shareable URL"
    >
      <Copy className="h-3 w-3" />
      <span className="hidden sm:inline">{done ? "Copied" : "Share"}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function sortResults(rows: Person[], sort: { key: SortKey; dir: "asc" | "desc" }): Person[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const keyed = rows.map((p) => ({
    p,
    name: fullDisplayName(p).toLowerCase(),
    surname: p.surname.toLowerCase(),
    birth: parseYear(p.birth?.date) ?? 99999,
    death: parseYear(p.death?.date) ?? 99999,
    place: (p.birth?.place ?? p.death?.place ?? "").toLowerCase(),
    sources: p.source_count,
    children: p.child_ids.length,
  }));
  keyed.sort((a, b) => {
    const av = a[sort.key] as string | number;
    const bv = b[sort.key] as string | number;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return keyed.map((k) => k.p);
}

function ResultsTable({
  rows,
  sort,
  onSort,
}: {
  rows: Person[];
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0 sm:p-0 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-foreground/[0.025]">
                <Th label="Person" k="name" sort={sort} onSort={onSort} />
                <Th label="Surname" k="surname" sort={sort} onSort={onSort} />
                <Th label="Born" k="birth" sort={sort} onSort={onSort} align="right" />
                <Th label="Died" k="death" sort={sort} onSort={onSort} align="right" />
                <Th label="Place" k="place" sort={sort} onSort={onSort} />
                <Th label="Sources" k="sources" sort={sort} onSort={onSort} align="right" />
                <Th label="Children" k="children" sort={sort} onSort={onSort} align="right" />
                <th aria-hidden className="w-6" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const by = parseYear(p.birth?.date);
                const dy = parseYear(p.death?.date);
                const country = personCountry(p);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-foreground/[0.02]"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/person/${encodeURIComponent(p.id)}`}
                        className="inline-flex items-center gap-2 group"
                      >
                        <PersonAvatar person={p} size="xs" />
                        <span className="font-medium group-hover:underline underline-offset-2">
                          {fullDisplayName(p)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground uppercase tracking-wider text-[11px]">
                      {p.surname}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {by ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {dy ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {country && (
                          <CountryFlag country={country} className="h-3 w-4 rounded-sm" />
                        )}
                        <span className="truncate max-w-[200px] inline-block align-middle">
                          {p.birth?.place ?? p.death?.place ?? "—"}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.source_count > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[22px] rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1 text-[11px] font-medium">
                          {p.source_count}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {p.child_ids.length}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile sort control */}
        <div className="md:hidden border-b border-border/40 px-3 py-2.5">
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Sort by
            <select
              value={sort.key}
              onChange={(e) => onSort(e.target.value as SortKey)}
              className="flex-1 min-w-0 rounded-md border border-border/70 bg-background text-sm normal-case tracking-normal text-foreground px-2.5 py-2 min-h-10 focus:outline-none focus:ring-2 focus:ring-foreground/15"
              data-testid="finder-mobile-sort"
              aria-label="Sort results by"
            >
              {MOBILE_SORT_OPTIONS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border/40">
          {rows.map((p) => {
            const by = parseYear(p.birth?.date);
            const dy = parseYear(p.death?.date);
            const country = personCountry(p);
            return (
              <Link
                key={p.id}
                href={`/person/${encodeURIComponent(p.id)}`}
                className="flex items-center gap-3 px-3 py-2.5 hover-elevate active-elevate-2"
              >
                <PersonAvatar person={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{fullDisplayName(p)}</div>
                  <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                    {country && (
                      <CountryFlag country={country} className="h-3 w-4 rounded-sm" />
                    )}
                    <span className="tabular-nums">
                      {by ?? "—"}–{dy ?? "·"}
                    </span>
                    <span className="opacity-50">·</span>
                    <span className="truncate">{p.birth?.place ?? p.death?.place ?? "—"}</span>
                  </div>
                </div>
                {p.source_count > 0 && (
                  <span className="shrink-0 inline-flex items-center rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                    {p.source_count} src
                  </span>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  label,
  k,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium select-none",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}
