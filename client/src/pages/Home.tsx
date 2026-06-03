import { useMemo, useState, type ComponentType } from "react";
import { Link, useLocation } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Award,
  Calendar,
  Clock,
  Compass,
  Crown,
  Download,
  FileText,
  Flame,
  GitBranch,
  GitMerge,
  Heart,
  ListChecks,
  MapPin,
  MessageCircle,
  ScrollText,
  Search,
  ShieldAlert,
  Shuffle,
  Telescope,
  TreePine,
  Users,
} from "lucide-react";
import {
  ancestorsByGeneration,
  allGaps,
  bySurname,
  descendantsByGeneration,
  fullDisplayName,
  getRootPerson,
  isLiving,
  lifespan,
  parseYear,
  people,
  stats,
  type Person,
} from "@/lib/family";
import { PersonAvatar } from "@/components/PersonAvatar";
import { SurnameArms, ARMS_SURNAMES } from "@/components/SurnameArms";
import { MilitaryBadge } from "@/components/MilitaryService";
import { MedalIcon } from "@/components/MedalIcon";
import { Card, CardContent } from "@/components/ui/card";
import { useAI } from "@/components/AIContext";
import { downloadGedcom } from "@/lib/gedcomExport";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};
const MONTH_LABEL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Parse a GEDCOM-style date like "11 NOV 1918" → {y, m, d} (m/d optional). */
function parseGedcomDate(date?: string | null): { y?: number; m?: number; d?: number } | null {
  if (!date) return null;
  const clean = date.replace(/^(ABT|EST|BEF|AFT|CAL|ABOUT|CIRCA|C\.?)\s+/i, "").trim();
  // Try DD MON YYYY
  const m1 = clean.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{3,4})$/);
  if (m1) {
    const mon = MONTHS[m1[2].toUpperCase()];
    if (mon !== undefined) return { d: +m1[1], m: mon, y: +m1[3] };
  }
  // Try MON YYYY
  const m2 = clean.match(/^([A-Za-z]{3})\s+(\d{3,4})$/);
  if (m2) {
    const mon = MONTHS[m2[1].toUpperCase()];
    if (mon !== undefined) return { m: mon, y: +m2[2] };
  }
  // Try YYYY
  const m3 = clean.match(/^(\d{3,4})$/);
  if (m3) return { y: +m3[1] };
  return null;
}

/** Compute age at death (in whole years) if both dates are known. */
function ageAtDeath(p: Person): number | null {
  const b = parseYear(p.birth?.date);
  const d = parseYear(p.death?.date);
  if (!b || !d) return null;
  const age = d - b;
  return age >= 0 && age < 130 ? age : null;
}

/** Score how documented a person is, for highlighting most-researched ancestors. */
function documentationScore(p: Person): number {
  let s = 0;
  if (p.notes?.length) s += p.notes.length * 3;
  if (p.source_count) s += p.source_count * 2;
  if (p.military) s += 4;
  if (p.occupations?.length) s += p.occupations.length;
  if (p.affiliations?.length) s += p.affiliations.length;
  if (p.residences?.length) s += p.residences.length;
  if (p.educations?.length) s += p.educations.length;
  if (p.birth?.place) s += 1;
  if (p.death?.place) s += 1;
  return s;
}

/** Births grouped into 20-year buckets (decades visualized as half-centuries). */
function birthsByDecade(): { decade: string; count: number; raw: number }[] {
  const buckets: Record<number, number> = {};
  for (const p of people) {
    const y = parseYear(p.birth?.date);
    if (!y) continue;
    const bucket = Math.floor(y / 20) * 20;
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }
  const sorted = Object.entries(buckets)
    .map(([k, v]) => ({ raw: +k, count: v }))
    .sort((a, b) => a.raw - b.raw);
  if (sorted.length === 0) return [];
  // Fill gaps so the bar chart timeline is continuous.
  const filled: { raw: number; count: number }[] = [];
  for (let y = sorted[0].raw; y <= sorted[sorted.length - 1].raw; y += 20) {
    const found = sorted.find((s) => s.raw === y);
    filled.push({ raw: y, count: found?.count ?? 0 });
  }
  return filled.map((b) => ({
    decade: `${b.raw}`,
    count: b.count,
    raw: b.raw,
  }));
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function StatPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <div
        className="font-display text-2xl sm:text-3xl font-semibold tabular-nums leading-none"
        data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1.5">
        {label}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function PersonRow({ person, accent }: { person: Person; accent?: string }) {
  const place = person.birth?.place?.split(",")[0]?.trim();
  return (
    <Link
      href={`/person/${encodeURIComponent(person.id)}`}
      className="flex items-center gap-3 rounded-md border border-card-border bg-card px-3 py-2.5 hover-elevate active-elevate-2 min-w-0"
      data-testid={`chip-${person.id}`}
    >
      <PersonAvatar person={person} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate text-foreground leading-tight">
          {fullDisplayName(person)}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums truncate leading-tight mt-0.5">
          {accent ?? `${lifespan(person)}${place ? ` · ${place}` : ""}`}
        </div>
      </div>
    </Link>
  );
}

function FeatureCard({
  href,
  icon: Icon,
  title,
  description,
  meta,
  accent,
  testId,
}: {
  href: string;
  icon: typeof GitBranch;
  title: string;
  description: string;
  meta?: string;
  accent?: "primary" | "default";
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex flex-col gap-2 rounded-lg border border-card-border bg-card p-4 hover-elevate active-elevate-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md",
            accent === "primary"
              ? "bg-primary/10 text-primary"
              : "bg-foreground/5 text-foreground/80",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {meta && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground tabular-nums whitespace-nowrap">
            {meta}
          </span>
        )}
      </div>
      <div>
        <div className="font-display font-semibold text-sm leading-snug">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {description}
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px] font-medium text-primary mt-auto pt-1">
        Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function HighlightCard({
  person,
  label,
  icon: Icon,
  metric,
}: {
  person: Person;
  label: string;
  icon: typeof GitBranch;
  metric: string;
}) {
  return (
    <Link
      href={`/person/${encodeURIComponent(person.id)}`}
      className="group flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4 hover-elevate active-elevate-2"
      data-testid={`highlight-${person.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Icon className="h-3 w-3 text-primary" />
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-primary font-medium whitespace-nowrap">
          {metric}
        </span>
      </div>
      <div className="flex items-center gap-3 min-w-0">
        <PersonAvatar person={person} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold text-sm leading-tight truncate group-hover:text-primary">
            {fullDisplayName(person)}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
            {lifespan(person)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  meta,
  description,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  meta?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1 mb-4 sm:mb-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl sm:text-2xl font-semibold flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          {title}
        </h2>
        {meta && (
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {meta}
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function BirthsTimelineChart({ data }: { data: { decade: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="h-44 sm:h-52 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="decade"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 11,
            }}
            labelFormatter={(v) => `${v}s`}
            formatter={(v: number) => [v, "births"]}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => {
              const intensity = 0.35 + 0.65 * (d.count / max);
              return (
                <Cell
                  key={i}
                  fill="hsl(var(--primary))"
                  fillOpacity={intensity}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SurnameBars({
  data,
}: {
  data: { surname: string; count: number; pct: number }[];
}) {
  return (
    <div className="space-y-2">
      {data.map((s) => (
        <Link
          key={s.surname}
          href={`/people?surname=${encodeURIComponent(s.surname)}`}
          className="block group"
          data-testid={`surname-bar-${s.surname.toLowerCase()}`}
        >
          <div className="flex items-baseline justify-between gap-3 text-[11px] mb-1">
            <span className="font-medium text-foreground group-hover:text-primary">
              {s.surname}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {s.count}{" "}
              <span className="opacity-60">· {s.pct.toFixed(0)}%</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full bg-primary group-hover:bg-primary transition-all"
              style={{ width: `${Math.max(2, s.pct)}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [, setLocation] = useLocation();
  const [searchValue, setSearchValue] = useState("");
  const { setChatOpen } = useAI();

  const root = getRootPerson();
  const ancestors = useMemo(() => ancestorsByGeneration(root.id, 4), [root.id]);
  const descendants = useMemo(() => descendantsByGeneration(root.id, 2), [root.id]);

  const oldest = useMemo(
    () =>
      [...people]
        .filter((p) => parseYear(p.birth?.date))
        .sort(
          (a, b) =>
            (parseYear(a.birth?.date) ?? 0) - (parseYear(b.birth?.date) ?? 0),
        )
        .slice(0, 6),
    [],
  );

  // Compute multi-purpose data — surnames, charts, anniversaries, gaps.
  const surnameData = useMemo(() => {
    const by = bySurname();
    const total = people.length;
    const entries = Object.entries(by)
      .map(([surname, ppl]) => ({
        surname,
        count: ppl.length,
        pct: (ppl.length / total) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return entries;
  }, []);

  const decadeData = useMemo(() => birthsByDecade(), []);

  const today = useMemo(() => new Date(), []);

  const gaps = useMemo(() => allGaps(), []);
  const peopleWithGaps = gaps.length;
  const totalGaps = gaps.reduce((acc, g) => acc + g.gaps.length, 0);

  // Country tally — normalize variant labels to canonical countries and assign a flag
  const US_STATE_CODES = new Set([
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
  ]);
  const US_STATE_NAMES = new Set([
    "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
    "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
    "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
    "minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire",
    "new jersey","new mexico","new york","north carolina","north dakota","ohio",
    "oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota",
    "tennessee","texas","utah","vermont","virginia","washington","west virginia",
    "wisconsin","wyoming","district of columbia",
  ]);
  const CANADIAN_PROVINCES = new Set([
    "ontario","quebec","nova scotia","new brunswick","manitoba","british columbia",
    "prince edward island","saskatchewan","alberta","newfoundland","newfoundland and labrador",
    "yukon","northwest territories","nunavut",
  ]);
  const UK_NATIONS = new Set(["england","scotland","wales","northern ireland"]);

  function normalizeCountry(place: string): { country: string; flag: string } | null {
    if (!place) return null;
    const parts = place.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const lower = parts[parts.length - 1].toLowerCase();
    const stripped = lower.replace(/[^a-z\s]/g, "").trim();
    for (const seg of parts) {
      const segUpper = seg.toUpperCase().replace(/[^A-Z]/g, "");
      if (US_STATE_CODES.has(segUpper)) return { country: "United States", flag: "\u{1F1FA}\u{1F1F8}" };
    }
    if (US_STATE_NAMES.has(stripped)) return { country: "United States", flag: "\u{1F1FA}\u{1F1F8}" };
    if (["united states","united states of america","usa","us","u s a","u s"].includes(stripped))
      return { country: "United States", flag: "\u{1F1FA}\u{1F1F8}" };
    if (stripped === "ireland") return { country: "Ireland", flag: "\u{1F1EE}\u{1F1EA}" };
    if (stripped === "germany") return { country: "Germany", flag: "\u{1F1E9}\u{1F1EA}" };
    if (CANADIAN_PROVINCES.has(stripped) || stripped === "canada")
      return { country: "Canada", flag: "\u{1F1E8}\u{1F1E6}" };
    if (UK_NATIONS.has(stripped) || ["uk","united kingdom","great britain","britain"].includes(stripped))
      return { country: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}" };
    if (stripped === "france") return { country: "France", flag: "\u{1F1EB}\u{1F1F7}" };
    if (stripped === "italy") return { country: "Italy", flag: "\u{1F1EE}\u{1F1F9}" };
    if (stripped === "netherlands" || stripped === "holland")
      return { country: "Netherlands", flag: "\u{1F1F3}\u{1F1F1}" };
    if (stripped === "sweden") return { country: "Sweden", flag: "\u{1F1F8}\u{1F1EA}" };
    if (stripped === "norway") return { country: "Norway", flag: "\u{1F1F3}\u{1F1F4}" };
    if (stripped === "poland") return { country: "Poland", flag: "\u{1F1F5}\u{1F1F1}" };
    if (stripped === "austria") return { country: "Austria", flag: "\u{1F1E6}\u{1F1F9}" };
    if (stripped === "switzerland") return { country: "Switzerland", flag: "\u{1F1E8}\u{1F1ED}" };
    return null;
  }

  const topCountries = useMemo(() => {
    const counts: Record<string, { count: number; flag: string }> = {};
    for (const p of people) {
      const places = [p.birth?.place, p.death?.place].filter(Boolean) as string[];
      for (const pl of places) {
        const norm = normalizeCountry(pl);
        if (!norm) continue;
        const cur = counts[norm.country] ?? { count: 0, flag: norm.flag };
        cur.count += 1;
        counts[norm.country] = cur;
      }
    }
    const max = Math.max(1, ...Object.values(counts).map((v) => v.count));
    return Object.entries(counts)
      .map(([country, v]) => ({
        country,
        count: v.count,
        flag: v.flag,
        pct: (v.count / max) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, []);

  // Chronological by birth year (earliest first) so the roll reads WWI → WWII
  // → Korea, matching the section's narrative. Undated names fall to the end.
  const veterans = useMemo(
    () =>
      people
        .filter((p) => p.military)
        .sort(
          (a, b) =>
            (parseYear(a.birth?.date) ?? 99999) - (parseYear(b.birth?.date) ?? 99999),
        ),
    [],
  );
  const veteransKIA = useMemo(
    () => veterans.filter((p) => p.military?.kia).length,
    [veterans],
  );

  const living = useMemo(() => people.filter(isLiving).length, []);

  // Notable people — four highlight slots.
  const longestLived = useMemo(() => {
    let best: { person: Person; age: number } | null = null;
    for (const p of people) {
      const age = ageAtDeath(p);
      if (age !== null && (!best || age > best.age)) best = { person: p, age };
    }
    return best;
  }, []);

  const earliestKnown = useMemo(() => {
    let best: { person: Person; year: number } | null = null;
    for (const p of people) {
      const y = parseYear(p.birth?.date);
      if (y && (!best || y < best.year)) best = { person: p, year: y };
    }
    return best;
  }, []);

  const mostDocumented = useMemo(() => {
    let best: { person: Person; score: number } | null = null;
    for (const p of people) {
      const s = documentationScore(p);
      if (s > 0 && (!best || s > best.score)) best = { person: p, score: s };
    }
    return best;
  }, []);

  const oldestLiving = useMemo(() => {
    let best: { person: Person; year: number } | null = null;
    for (const p of people) {
      if (!isLiving(p)) continue;
      const y = parseYear(p.birth?.date);
      if (y && (!best || y < best.year)) best = { person: p, year: y };
    }
    return best;
  }, []);

  // Place explorer — top places by mention count.
  const placeStats = useMemo(() => {
    const counts: Record<string, { count: number; sample: Person }> = {};
    for (const p of people) {
      const places: string[] = [];
      if (p.birth?.place) places.push(p.birth.place);
      if (p.death?.place) places.push(p.death.place);
      for (const r of p.residences ?? []) if (r.place) places.push(r.place);
      const seen = new Set<string>();
      for (const pl of places) {
        const norm = pl.trim();
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        const cur = counts[norm] ?? { count: 0, sample: p };
        cur.count += 1;
        counts[norm] = cur;
      }
    }
    return Object.entries(counts)
      .map(([place, v]) => ({ place, count: v.count, sample: v.sample }))
      .sort((a, b) => b.count - a.count);
  }, []);

  const topPlaces = useMemo(() => placeStats.slice(0, 8), [placeStats]);

  // Pick a deterministic "discover" person that rotates daily, plus a random reshuffle button.
  const [discoverSeed, setDiscoverSeed] = useState(0);
  const discoverable = useMemo(
    () => people.filter((p) => parseYear(p.birth?.date) && (p.given || p.surname)),
    [],
  );
  const discoverPerson = useMemo(() => {
    if (discoverable.length === 0) return null;
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000,
    );
    const idx = (dayOfYear + discoverSeed) % discoverable.length;
    return discoverable[idx];
  }, [discoverable, today, discoverSeed]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) setLocation(`/people?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-5 py-6 sm:py-10">
      {/* ───────── Hero ───────── */}
      <section className="pb-8 sm:pb-10 border-b">
        <div className="flex items-center gap-3 mb-3 sm:mb-4">
          <span className="font-display text-sm font-semibold tracking-tight text-foreground">
            Cognatio
          </span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-primary">
            Walsh · Maloy · Cranwell · Dugan Family Archive
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold leading-[1.05] tracking-tight max-w-3xl">
          The Walsh, Maloy, Cranwell, and Dugan family tree.
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-3 sm:mt-4 max-w-xl leading-relaxed">
          A merged record of {stats.total_individuals} ancestors and descendants — assembled
          from two Ancestry.com GEDCOM exports and reconciled into one shared lineage.
        </p>

        {/* Search + primary CTAs — unified row at h-10 */}
        <div className="mt-5 sm:mt-6 flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap">
          <form
            onSubmit={handleSearch}
            className="flex h-10 items-center gap-2 rounded-md border border-border bg-card pl-3 pr-1 focus-within:ring-2 focus-within:ring-primary/30 md:flex-1 md:min-w-[260px]"
          >
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by name, surname, or place…"
              className="flex-1 bg-transparent outline-none text-sm min-w-0"
              data-testid="home-search-input"
            />
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md bg-primary text-primary-foreground text-xs font-medium px-3 hover-elevate active-elevate-2"
              data-testid="home-search-submit"
            >
              Search
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/tree"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3.5 text-sm font-medium hover-elevate active-elevate-2"
              data-testid="cta-tree"
            >
              <GitBranch className="h-4 w-4" />
              Explore tree
            </Link>
            <button
              onClick={() => setChatOpen(true)}
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3.5 text-sm font-medium hover-elevate active-elevate-2"
              data-testid="cta-ai"
            >
              <MessageCircle className="h-4 w-4" />
              Ask AI
            </button>
            <button
              type="button"
              onClick={() =>
                downloadGedcom(
                  `cognatio_archive_${new Date().toISOString().slice(0, 10)}.ged`,
                )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3.5 text-sm font-medium hover-elevate active-elevate-2"
              data-testid="cta-download-ged"
              title="Download the archive as a GEDCOM 5.5.1 file (.ged)"
            >
              <Download className="h-4 w-4" />
              GEDCOM
            </button>
          </div>
        </div>

        {/* Stat pills strip */}
        <div className="mt-6 sm:mt-8 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5 sm:gap-6 border-t border-border/60 pt-5 sm:pt-6">
          <StatPill label="Individuals" value={stats.total_individuals} />
          <StatPill label="Families" value={stats.total_families} />
          <StatPill
            label="Generations"
            value={ancestors.length}
            hint={`from ${root.given}`}
          />
          <StatPill
            label="Earliest"
            value={parseYear(oldest[0]?.birth?.date) ?? "—"}
            hint={oldest[0] ? oldest[0].surname : undefined}
          />
        </div>
      </section>

      {/* ───────── Feature discovery ───────── */}
      <section className="mt-10 sm:mt-12">
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            href="/tree"
            icon={GitBranch}
            title="Interactive tree"
            description="Visual pedigree, pan and zoom, jump between branches."
            accent="primary"
            testId="feature-tree"
          />
          <FeatureCard
            href="/people"
            icon={Users}
            title="All people"
            description="Searchable, filterable directory of the entire archive."
            meta={`${stats.total_individuals}`}
            testId="feature-people"
          />
          <FeatureCard
            href="/timeline"
            icon={Clock}
            title="Family timeline"
            description="Every dated life event laid out chronologically."
            testId="feature-timeline"
          />
          <FeatureCard
            href="/relate"
            icon={GitMerge}
            title="Relationship calculator"
            description="Pick any two people and see how they connect."
            testId="feature-relate"
          />
          <FeatureCard
            href="/surnames"
            icon={ScrollText}
            title="Surname directory"
            description="Every family name with arms, counts, and year ranges."
            testId="feature-surnames"
          />
          <FeatureCard
            href="/places"
            icon={MapPin}
            title="Places"
            description="Towns, parishes, and cities across the archive."
            testId="feature-places"
          />
          <FeatureCard
            href="/research"
            icon={Compass}
            title="Research workbench"
            description="Brick walls, census coverage, FAN club, records checklist."
            accent="primary"
            testId="feature-research"
          />
          <FeatureCard
            href="/roots"
            icon={Crown}
            title="Deepest roots"
            description="Direct paternal & maternal lines, ahnentafel, depth by surname."
            accent="primary"
            testId="feature-roots"
          />
          <FeatureCard
            href="/finder"
            icon={Telescope}
            title="Advanced finder"
            description="Multi-criteria search with sortable results and shareable filters."
            testId="feature-finder"
          />
          <FeatureCard
            href="/anomalies"
            icon={ShieldAlert}
            title="Data quality"
            description="Spot date conflicts, missing parents, and other archive issues."
            testId="feature-anomalies"
          />
          <FeatureCard
            href="/duplicates"
            icon={GitMerge}
            title="Find duplicates"
            description="Spot the same person imported twice and merge their records."
            accent="primary"
            testId="feature-duplicates"
          />
          <FeatureCard
            href="/gaps"
            icon={ListChecks}
            title="Gaps to research"
            description="People missing key facts — find sources, apply edits."
            meta={`${peopleWithGaps} · ${totalGaps} gaps`}
            testId="feature-gaps"
          />
          <FeatureCard
            href="/export"
            icon={Download}
            title="Export & share"
            description="Download as GEDCOM, browse the raw archive."
            testId="feature-export"
          />
        </div>
      </section>

      {/* ───────── Notable people ───────── */}
      <section className="mt-10 sm:mt-12">
        <SectionHeader
          icon={Award}
          title="Notable people"
          description="Standout records across the archive — lives that anchor the tree."
        />
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {longestLived && (
            <HighlightCard
              person={longestLived.person}
              label="Longest lived"
              icon={Heart}
              metric={`${longestLived.age} years`}
            />
          )}
          {earliestKnown && (
            <HighlightCard
              person={earliestKnown.person}
              label="Earliest known"
              icon={TreePine}
              metric={`Born ${earliestKnown.year}`}
            />
          )}
          {mostDocumented && (
            <HighlightCard
              person={mostDocumented.person}
              label="Most documented"
              icon={FileText}
              metric={`${mostDocumented.score} signals`}
            />
          )}
          {oldestLiving && (
            <HighlightCard
              person={oldestLiving.person}
              label="Oldest living"
              icon={Calendar}
              metric={`Born ${oldestLiving.year}`}
            />
          )}
        </div>
      </section>

      {/* ───────── Discover + Visualizations ───────── */}
      <section className="mt-10 sm:mt-12 grid gap-4 lg:gap-5 lg:grid-cols-3">
        {/* Discover (1 col) */}
        {discoverPerson && (
          <Card className="border-card-border lg:col-span-1">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-primary" />
                  Discover
                </h3>
                <button
                  type="button"
                  onClick={() => setDiscoverSeed((s) => s + 1)}
                  className="inline-flex items-center gap-1 rounded-md border border-card-border bg-background px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
                  data-testid="button-discover-shuffle"
                  aria-label="Show a different person"
                >
                  <Shuffle className="h-3 w-3" />
                  Shuffle
                </button>
              </div>
              <Link
                href={`/person/${encodeURIComponent(discoverPerson.id)}`}
                className="flex flex-col gap-3 group"
                data-testid={`discover-${discoverPerson.id}`}
              >
                <div className="flex items-start gap-3">
                  <PersonAvatar person={discoverPerson} size="lg" />
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-base leading-tight group-hover:text-primary">
                      {fullDisplayName(discoverPerson)}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      {lifespan(discoverPerson)}
                    </div>
                    {discoverPerson.birth?.place && (
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{discoverPerson.birth.place}</span>
                      </div>
                    )}
                  </div>
                </div>
                {discoverPerson.military && <MilitaryBadge person={discoverPerson} />}
                {discoverPerson.occupations.length > 0 && (
                  <div className="text-xs text-foreground/80 leading-relaxed">
                    <span className="text-muted-foreground">Worked as: </span>
                    {discoverPerson.occupations.slice(0, 2).join(", ")}
                  </div>
                )}
                {discoverPerson.notes.length > 0 && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {discoverPerson.notes[0]}
                  </p>
                )}
                <div className="text-[11px] text-primary inline-flex items-center gap-1">
                  Full profile <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Births timeline chart (2 col) */}
        <Card className="border-card-border lg:col-span-2">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-primary" />
                Births across the centuries
              </h3>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                20-year intervals
              </span>
            </div>
            {decadeData.length > 0 ? (
              <>
                <BirthsTimelineChart data={decadeData} />
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Tallest bars typically mark large generational cohorts — often the wave of
                  Irish and German immigrants arriving in New York in the late 1800s.
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No date data.</div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ───────── Surname distribution + Geography ───────── */}
      <section className="mt-10 sm:mt-12 grid gap-4 lg:gap-5 lg:grid-cols-2">
        <Card className="border-card-border">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-sm font-semibold">Top surnames</h3>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {surnameData.length} of {Object.keys(bySurname()).length}
              </span>
            </div>
            <SurnameBars data={surnameData} />
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Origin countries
              </h3>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                birth & death
              </span>
            </div>
            <div className="space-y-2.5">
              {topCountries.map((c) => (
                <div
                  key={c.country}
                  className="flex items-center gap-3"
                  data-testid={`country-${c.country.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span
                    className="text-xl leading-none shrink-0"
                    aria-label={`Flag of ${c.country}`}
                    role="img"
                  >
                    {c.flag}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-medium truncate">{c.country}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {c.count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.max(4, c.pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ───────── Top places ───────── */}
      <section className="mt-10 sm:mt-12">
        <SectionHeader
          icon={MapPin}
          title="Places in the archive"
          meta={`${placeStats.length} locations`}
          description="Towns, cities, and parishes that recur across births, deaths, and residences."
        />
        <Card className="border-card-border">
          <CardContent className="p-4 sm:p-5">
            {topPlaces.length > 0 ? (
              <>
                <div className="grid gap-2 sm:gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {topPlaces.map((p) => (
                    <Link
                      key={p.place}
                      href={`/places?q=${encodeURIComponent(p.place)}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-card-border bg-card px-3 py-2.5 hover-elevate active-elevate-2 min-w-0"
                      data-testid={`place-${p.place.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate">{p.place}</span>
                      </div>
                      <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                        {p.count}
                      </span>
                    </Link>
                  ))}
                </div>
                <Link
                  href="/places"
                  className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  data-testid="link-places-all"
                >
                  Browse all places <ArrowRight className="h-3 w-3" />
                </Link>
              </>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No place data recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ───────── Heraldry ───────── */}
      <section className="mt-10 sm:mt-12">
        <SectionHeader
          title="Family heraldry"
          meta={`${ARMS_SURNAMES.length} branches`}
        />
        <Card className="border-card-border">
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-3 sm:gap-5">
              {ARMS_SURNAMES.map((a) => (
                <Link
                  key={a.surname}
                  href={`/people?surname=${encodeURIComponent(a.surname)}`}
                  className="group flex flex-col items-center gap-2 rounded-md p-2 sm:p-3 hover-elevate active-elevate-2"
                  data-testid={`heraldry-${a.surname.toLowerCase()}`}
                >
                  <SurnameArms surname={a.surname} size="xl" />
                  <div className="text-xs sm:text-sm font-medium tracking-wide">
                    {a.surname}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ───────── Tree starting from root ───────── */}
      <section className="mt-10 sm:mt-12">
        <SectionHeader
          icon={GitBranch}
          title={`Starting from ${fullDisplayName(root)}`}
          description={
            root.birth?.place
              ? `Born ${root.birth.place}${root.birth.date ? ` · ${root.birth.date}` : ""}`
              : undefined
          }
          meta={`${living} living`}
        />
        <div className="space-y-4 sm:space-y-5">
          {ancestors.map((gen, i) => (
            <Card key={i} className="border-card-border">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="font-display text-base sm:text-lg font-semibold">
                    {i === 0
                      ? "Self"
                      : i === 1
                      ? "Parents"
                      : i === 2
                      ? "Grandparents"
                      : i === 3
                      ? "Great-grandparents"
                      : `${i - 1}× great-grandparents`}
                  </h3>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {gen.length}
                  </span>
                </div>
                <div className="grid gap-2 sm:gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {gen.map((p) => (
                    <PersonRow key={p.id} person={p} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {descendants.length > 1 && (
          <Card className="border-card-border mt-4 sm:mt-5">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-display text-base sm:text-lg font-semibold">
                  Descendants
                </h3>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {descendants.slice(1).flat().length}
                </span>
              </div>
              <div className="grid gap-2 sm:gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {descendants.slice(1).flat().map((p) => (
                  <PersonRow key={p.id} person={p} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ───────── Earliest ancestors ───────── */}
      <section className="mt-10 sm:mt-12">
        <SectionHeader title="Earliest known ancestors" />
        <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
          {oldest.map((p) => (
            <Link
              key={p.id}
              href={`/person/${encodeURIComponent(p.id)}`}
              className="flex items-center gap-3 p-3 rounded-md border border-card-border bg-card hover-elevate active-elevate-2"
              data-testid={`ancient-${p.id}`}
            >
              <PersonAvatar person={p} size="md" />
              <div className="min-w-0">
                <div className="font-medium truncate">{fullDisplayName(p)}</div>
                <div className="text-xs text-muted-foreground">
                  {lifespan(p)} · {p.birth?.place ?? "Unknown place"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ───────── Veterans ───────── */}
      {veterans.length > 0 && (
        <section className="mt-10 sm:mt-12">
          <SectionHeader
            icon={MedalIcon}
            title="Those who served"
            meta={`${veterans.length} ${veterans.length === 1 ? "veteran" : "veterans"}${
              veteransKIA > 0 ? ` · ${veteransKIA} KIA` : ""
            }`}
            description="Members of the family who answered the call — from the trenches of the First World War, across the European and Pacific fronts of the Second, and into Korea."
          />
          <Card className="border-card-border">
            <CardContent className="p-4 sm:p-5">
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {veterans.map((p) => (
                  <Link
                    key={p.id}
                    href={`/person/${encodeURIComponent(p.id)}`}
                    className={cn(
                      "flex items-start gap-3 rounded-md border bg-card px-3 py-3 hover-elevate active-elevate-2 min-w-0",
                      p.military?.kia
                        ? "border-rose-500/30 ring-1 ring-rose-500/15"
                        : "border-card-border",
                    )}
                    data-testid={`veteran-${p.id}`}
                  >
                    <PersonAvatar person={p} size="sm" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-sm font-semibold truncate leading-tight">
                        {fullDisplayName(p)}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums truncate leading-tight">
                        {lifespan(p)}
                      </div>
                      <div className="pt-0.5">
                        <MilitaryBadge person={p} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
