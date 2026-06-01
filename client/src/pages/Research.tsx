import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Compass,
  ExternalLink,
  ListChecks,
  Library,
  MapPin,
  ScrollText,
  Search,
  TrendingUp,
  Users as UsersIcon,
  Copy,
  Check,
  BrickWall,
  CalendarRange,
} from "lucide-react";
import {
  people,
  fullDisplayName,
  lifespan,
  searchPeople,
  type Person,
} from "@/lib/family";
import {
  brickWalls,
  censusCoverage,
  computeResearchStats,
  fanClubFor,
  recordsToObtain,
  surnameProjectLinks,
  type CensusYear,
} from "@/lib/research";
import { linksFor, copySearchString } from "@/lib/researchLinks";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CountryFlag } from "@/components/CountryFlag";
import { SurnameArms, getArmsForSurname } from "@/components/SurnameArms";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TabId = "overview" | "brick" | "census" | "fan" | "records" | "surnames";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: Compass },
  { id: "brick", label: "Brick walls", icon: BrickWall },
  { id: "census", label: "Census coverage", icon: CalendarRange },
  { id: "fan", label: "FAN club", icon: UsersIcon },
  { id: "records", label: "Records checklist", icon: ListChecks },
  { id: "surnames", label: "Surname projects", icon: ScrollText },
];

export default function Research() {
  const [tab, setTab] = useState<TabId>("overview");
  const stats = useMemo(() => computeResearchStats(), []);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-5 py-5 sm:py-8 fade-up">
      <div className="mb-5 sm:mb-7">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
          data-testid="link-back-home"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back home
        </Link>
      </div>

      <header className="pb-6 sm:pb-8 border-b">
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Research workbench
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-[1.15] tracking-tight">
          Complete and expand the record
        </h1>
        <p className="text-sm text-muted-foreground mt-2.5 max-w-2xl">
          Pre-built deep links to FamilySearch, Ancestry, FindAGrave and country-specific
          archives, plus brick-wall ancestors, census coverage and FAN-club neighbors —
          everything you need to keep widening the tree.
        </p>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-6">
        <Stat label="People" value={stats.totalPeople} />
        <Stat label="Brick walls" value={stats.brickWallCount} accent="warn" />
        <Stat
          label="With sources"
          value={`${Math.round((stats.sourcedPeople / Math.max(1, stats.totalPeople)) * 100)}%`}
          subtext={`${stats.sourcedPeople} of ${stats.totalPeople}`}
        />
        <Stat
          label="Census coverable"
          value={stats.censusCoverableCount}
          subtext="people with at least one census window"
        />
      </div>

      {/* Tab bar */}
      <nav
        className="mt-7 sm:mt-8 -mx-1.5 flex gap-1 overflow-x-auto scrollbar-none pb-1 px-1.5 snap-x"
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "snap-start inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                "hover-elevate active-elevate-2",
                active
                  ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                  : "border-border/70 bg-background/40 text-muted-foreground"
              )}
              role="tab"
              aria-selected={active}
              data-testid={`research-tab-${id}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 sm:mt-7">
        {tab === "overview" && <OverviewPanel stats={stats} onJump={setTab} />}
        {tab === "brick" && <BrickWallPanel />}
        {tab === "census" && <CensusPanel />}
        {tab === "fan" && <FanClubPanel />}
        {tab === "records" && <RecordsPanel />}
        {tab === "surnames" && <SurnameProjectsPanel />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewPanel({
  stats,
  onJump,
}: {
  stats: ReturnType<typeof computeResearchStats>;
  onJump: (t: TabId) => void;
}) {
  const tiles: { id: TabId; title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    {
      id: "brick",
      title: "Brick walls",
      subtitle: "Ancestors with no recorded parents — the next breakthrough",
      icon: BrickWall,
      count: stats.brickWallCount,
    },
    {
      id: "census",
      title: "Census coverage",
      subtitle: "Which censuses each person ought to appear in",
      icon: CalendarRange,
      count: stats.censusCoverableCount,
    },
    {
      id: "fan",
      title: "FAN club",
      subtitle: "Friends, associates, neighbors — find collateral kin",
      icon: UsersIcon,
    },
    {
      id: "records",
      title: "Records checklist",
      subtitle: "Era-aware list of records to obtain for any person",
      icon: ListChecks,
    },
    {
      id: "surnames",
      title: "Surname projects",
      subtitle: "DNA studies, one-name studies, etymology",
      icon: ScrollText,
    },
  ];

  const pct = (n: number) => Math.round((n / Math.max(1, stats.totalPeople)) * 100);

  return (
    <div className="space-y-7">
      {/* Coverage bars */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h2 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Research coverage
          </h2>
          <div className="space-y-2.5">
            <CoverageBar label="Parents linked" value={stats.withParents} total={stats.totalPeople} hint={`${pct(stats.withParents)}%`} />
            <CoverageBar label="Birth date" value={stats.withBirthDate} total={stats.totalPeople} hint={`${pct(stats.withBirthDate)}%`} />
            <CoverageBar label="Birth place" value={stats.withBirthPlace} total={stats.totalPeople} hint={`${pct(stats.withBirthPlace)}%`} />
            <CoverageBar label="Death date" value={stats.withDeathDate} total={stats.totalPeople} hint={`${pct(stats.withDeathDate)}%`} />
            <CoverageBar label="At least one source" value={stats.sourcedPeople} total={stats.totalPeople} hint={`${pct(stats.sourcedPeople)}%`} />
          </div>
        </CardContent>
      </Card>

      {/* Workbench tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map(({ id, title, subtitle, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => onJump(id)}
            className="text-left rounded-lg border bg-card p-4 hover-elevate active-elevate-2"
            data-testid={`research-tile-${id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-display text-sm font-semibold">{title}</h3>
              </div>
              {typeof count === "number" && (
                <span className="rounded-full border bg-background/60 px-2 py-0.5 text-[11px] font-mono tabular-nums text-muted-foreground">
                  {count}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{subtitle}</p>
          </button>
        ))}
      </div>

      {/* External libraries */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h2 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
            <Library className="h-4 w-4 text-muted-foreground" />
            Research libraries
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {GLOBAL_LIBRARIES.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2 text-xs hover-elevate active-elevate-2"
                data-testid={`lib-${l.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{l.label}</span>
                  <span className="text-muted-foreground truncate">{l.hint}</span>
                </span>
                <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const GLOBAL_LIBRARIES: { label: string; hint: string; url: string }[] = [
  { label: "FamilySearch", hint: "Free vital records & tree", url: "https://www.familysearch.org/search" },
  { label: "Ancestry", hint: "Subscription record collections", url: "https://www.ancestry.com/search" },
  { label: "FindAGrave", hint: "Headstones & cemetery records", url: "https://www.findagrave.com/" },
  { label: "Newspapers.com", hint: "Obituaries & clippings", url: "https://www.newspapers.com/" },
  { label: "MyHeritage SuperSearch", hint: "Aggregated records", url: "https://www.myheritage.com/research" },
  { label: "Chronicling America", hint: "US newspapers 1777–1963 (free)", url: "https://chroniclingamerica.loc.gov/" },
  { label: "Internet Archive Genealogy", hint: "Out-of-copyright county histories", url: "https://archive.org/details/genealogy" },
  { label: "WikiTree", hint: "Crowd-sourced shared tree", url: "https://www.wikitree.com/" },
  { label: "IrishGenealogy.ie", hint: "Free Irish civil records", url: "https://www.irishgenealogy.ie/" },
  { label: "ScotlandsPeople", hint: "Scottish statutory records", url: "https://www.scotlandspeople.gov.uk/" },
  { label: "Library & Archives Canada", hint: "Canadian government records", url: "https://www.bac-lac.gc.ca/" },
  { label: "Archion (DE)", hint: "German church books", url: "https://www.archion.de/" },
];

// ---------------------------------------------------------------------------
// Brick walls
// ---------------------------------------------------------------------------

function BrickWallPanel() {
  const walls = useMemo(() => brickWalls({ minDescendants: 1 }), []);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <header className="mb-4">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <BrickWall className="h-4 w-4 text-muted-foreground" />
            Ancestral brick walls
          </h2>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
            {walls.length} ancestor{walls.length === 1 ? "" : "s"} in the tree with no recorded
            parents. Ranked by descendant count — break one of these and you complete an entire
            lineage. Click a name to see suggested research strategies.
          </p>
        </header>

        <ol className="space-y-2">
          {walls.map((bw, idx) => {
            const isOpen = expanded === bw.person.id;
            return (
              <li key={bw.person.id} className="rounded-md border bg-background/40">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : bw.person.id)}
                  className="w-full flex items-center gap-3 p-2.5 sm:p-3 hover-elevate active-elevate-2 rounded-md text-left"
                  data-testid={`brick-${bw.person.id}`}
                >
                  <span className="font-mono tabular-nums text-[11px] text-muted-foreground w-5 text-right">
                    {idx + 1}
                  </span>
                  <PersonAvatar person={bw.person} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{fullDisplayName(bw.person)}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {lifespan(bw.person)}
                      {bw.person.birth?.place && <> · {bw.person.birth.place}</>}
                    </div>
                  </div>
                  <span className="rounded-full border bg-background/60 px-2 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                    {bw.descendantCount} desc.
                  </span>
                </button>
                {isOpen && <BrickWallStrategies person={bw.person} />}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function BrickWallStrategies({ person }: { person: Person }) {
  const links = useMemo(() => linksFor(person), [person]);
  const surname = person.surname;
  const surnameLinks = useMemo(() => (surname ? surnameProjectLinks(surname) : []), [surname]);
  const records = useMemo(() => recordsToObtain(person), [person]);

  return (
    <div className="border-t bg-background/20 p-3 sm:p-4 space-y-4">
      <section>
        <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Strategy
        </h3>
        <ul className="text-xs space-y-1.5 list-disc list-inside text-muted-foreground">
          <li>
            Search FamilySearch records and tree by spouse — marriage records often name the bride's father.
          </li>
          <li>
            Look at FAN-club neighbors — witnesses, godparents, and adjacent census households frequently turn out to be siblings or parents.
          </li>
          {surname && (
            <li>
              Join the <span className="font-medium text-foreground">{surname}</span> Y-DNA project — paternal brick walls often crack via shared haplotypes.
            </li>
          )}
          <li>
            Order the death certificate or church burial record — the informant frequently names the parents.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Search this person
        </h3>
        <LinkChipRow links={links} />
      </section>

      {records.length > 0 && (
        <section>
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Records to obtain
          </h3>
          <ul className="text-xs space-y-1 text-muted-foreground">
            {records.slice(0, 6).map((r) => (
              <li key={r.id} className="flex gap-1.5">
                <span className="text-foreground">·</span>
                <span><span className="font-medium text-foreground">{r.label}</span> — {r.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {surnameLinks.length > 0 && (
        <section>
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            {surname} surname research
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {surnameLinks.slice(0, 4).map((sl) => (
              <a
                key={sl.url}
                href={sl.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background/40 px-2 py-1 text-[11px] hover-elevate active-elevate-2"
              >
                {sl.label}
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </section>
      )}

      <div>
        <Link
          href={`/person/${person.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80 hover:text-foreground"
        >
          Open person record
          <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Census coverage
// ---------------------------------------------------------------------------

function CensusPanel() {
  const [picked, setPicked] = useState<Person | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2 mb-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            Census coverage
          </h2>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Pick any person — we list every decennial census they should appear in (US, UK, Scotland,
            Ireland, Canada) with age and place hint. Each row deep-links to a pre-filled
            FamilySearch search.
          </p>
          <PersonPicker value={picked} onChange={setPicked} />
        </CardContent>
      </Card>

      {picked ? (
        <CensusTable person={picked} />
      ) : (
        <Card className="hidden lg:block">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Choose a person on the left to see their census coverage.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CensusTable({ person }: { person: Person }) {
  const rows = useMemo(() => censusCoverage(person), [person]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-5 text-sm text-muted-foreground">
          No census records expected — needs a birth date and a recognized country (US, UK, Scotland, Ireland, Canada).
        </CardContent>
      </Card>
    );
  }

  // Group by country (most people are single-country, but be safe)
  const byCountry = new Map<string, CensusYear[]>();
  for (const r of rows) {
    (byCountry.get(r.country) ?? byCountry.set(r.country, []).get(r.country)!).push(r);
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <header className="mb-3 flex items-center gap-3">
          <PersonAvatar person={person} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{fullDisplayName(person)}</div>
            <div className="text-[11px] text-muted-foreground">{lifespan(person)}</div>
          </div>
        </header>

        {Array.from(byCountry.entries()).map(([country, cells]) => (
          <section key={country} className="mb-4 last:mb-0">
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2 flex items-center gap-1.5">
              <CountryFlag country={country} className="h-3 w-4 rounded-sm" />
              {country}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {cells.map((c) => (
                <a
                  key={c.year}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border bg-background/40 p-2.5 hover-elevate active-elevate-2 group"
                  data-testid={`census-${c.year}`}
                >
                  <div className="font-mono tabular-nums text-sm font-semibold flex items-center justify-between">
                    {c.year}
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Age {c.age ?? "?"}
                  </div>
                  {c.placeHint && (
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate" title={c.placeHint}>
                      {c.placeHint}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// FAN Club
// ---------------------------------------------------------------------------

function FanClubPanel() {
  const [picked, setPicked] = useState<Person | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2 mb-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            FAN club
          </h2>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Friends, associates, neighbors. Pick a person and we surface others in the tree who
            shared their place and era but aren't direct family — useful for spotting unrecorded
            siblings, in-laws, witnesses, and migration cohorts.
          </p>
          <PersonPicker value={picked} onChange={setPicked} />
        </CardContent>
      </Card>

      {picked ? (
        <FanList person={picked} />
      ) : (
        <Card className="hidden lg:block">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Choose a person on the left to find their collateral kin and cohort.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FanList({ person }: { person: Person }) {
  const neighbors = useMemo(() => fanClubFor(person, 20), [person]);
  if (neighbors.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-5 text-sm text-muted-foreground">
          No overlapping neighbors found — needs at least one place on record.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <header className="mb-3 flex items-center gap-3">
          <PersonAvatar person={person} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">Neighbors of {fullDisplayName(person)}</div>
            <div className="text-[11px] text-muted-foreground">{neighbors.length} possible associates</div>
          </div>
        </header>
        <ul className="divide-y">
          {neighbors.map((n) => (
            <li key={n.person.id} className="py-2 first:pt-0 last:pb-0">
              <Link
                href={`/person/${n.person.id}`}
                className="flex items-center gap-3 rounded-md p-1.5 -mx-1.5 hover-elevate active-elevate-2"
                data-testid={`fan-${n.person.id}`}
              >
                <PersonAvatar person={n.person} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{fullDisplayName(n.person)}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {lifespan(n.person)} · {n.reasons.join(" · ")}
                  </div>
                </div>
                <span className="rounded-full border bg-background/60 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                  {n.score}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Records checklist
// ---------------------------------------------------------------------------

function RecordsPanel() {
  const [picked, setPicked] = useState<Person | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2 mb-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            Records to obtain
          </h2>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Era-aware checklist — vital certificates, censuses, draft cards, immigration manifests,
            parish registers, and more. Items already supported by a source are marked likely-have.
          </p>
          <PersonPicker value={picked} onChange={setPicked} />
        </CardContent>
      </Card>

      {picked ? (
        <RecordChecklist person={picked} />
      ) : (
        <Card className="hidden lg:block">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Choose a person on the left to generate their records-to-obtain checklist.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RecordChecklist({ person }: { person: Person }) {
  const tasks = useMemo(() => recordsToObtain(person), [person]);
  const links = useMemo(() => linksFor(person), [person]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const lines = [
      `Records checklist — ${fullDisplayName(person)} (${lifespan(person)})`,
      `Search string: ${copySearchString(person)}`,
      "",
      ...tasks.map((t) => `${t.likelyHave ? "[x]" : "[ ]"} ${t.label} — ${t.why}`),
    ].join("\n");
    void navigator.clipboard?.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <header className="mb-4 flex items-center gap-3">
          <PersonAvatar person={person} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{fullDisplayName(person)}</div>
            <div className="text-[11px] text-muted-foreground">{lifespan(person)}</div>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-2 sm:px-2.5 py-1 text-[11px] hover-elevate active-elevate-2"
            data-testid="copy-checklist"
            aria-label={copied ? "Copied" : "Copy checklist"}
            title={copied ? "Copied" : "Copy checklist"}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy checklist"}</span>
          </button>
        </header>

        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className={cn(
                "rounded-md border p-2.5 sm:p-3",
                t.likelyHave ? "bg-emerald-500/[0.04] border-emerald-500/20" : "bg-background/40"
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border",
                    t.likelyHave ? "bg-emerald-500/30 border-emerald-500/40" : "border-border"
                  )}
                  aria-hidden
                >
                  {t.likelyHave && <Check className="h-2.5 w-2.5 text-emerald-700 dark:text-emerald-300" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {t.label}
                    {t.countryName && (
                      <CountryFlag country={t.countryName} className="h-2.5 w-3.5 rounded-sm" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {t.why}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <section className="mt-5">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Where to search
          </h3>
          <LinkChipRow links={links} />
        </section>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Surname projects
// ---------------------------------------------------------------------------

function SurnameProjectsPanel() {
  const topSurnames = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of people) {
      if (!p.surname) continue;
      counts[p.surname] = (counts[p.surname] || 0) + 1;
    }
    return Object.entries(counts)
      .filter(([s]) => s)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([surname, count]) => ({ surname, count }));
  }, []);

  const [picked, setPicked] = useState<string>(topSurnames[0]?.surname ?? "");

  const links = useMemo(() => surnameProjectLinks(picked), [picked]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold flex items-center gap-2 mb-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          Surname projects
        </h2>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed max-w-2xl">
          Y-DNA studies, one-name studies, etymology, and crowd-sourced trees indexed by surname.
          DNA projects are the proven path through paternal brick walls.
        </p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {topSurnames.map((s) => {
            const active = s.surname === picked;
            return (
              <button
                key={s.surname}
                type="button"
                onClick={() => setPicked(s.surname)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] hover-elevate active-elevate-2",
                  active ? "bg-foreground/[0.06] border-foreground/30 text-foreground" : "bg-background/40 text-muted-foreground"
                )}
                data-testid={`surname-pick-${s.surname.toLowerCase()}`}
              >
                {s.surname}
                <span className="font-mono tabular-nums text-muted-foreground/80">{s.count}</span>
              </button>
            );
          })}
        </div>

        {picked && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border bg-background/40 p-3">
              {getArmsForSurname(picked) ? (
                <SurnameArms surname={picked} size="sm" />
              ) : (
                <div className="h-10 w-10 rounded border border-dashed border-border/60" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold">{picked}</div>
                <div className="text-[11px] text-muted-foreground">
                  {people.filter((p) => p.surname === picked).length} people in the archive
                </div>
              </div>
              <Link
                href={`/surnames`}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                See people <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </div>

            <ul className="space-y-2">
              {links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 rounded-md border bg-background/40 p-3 hover-elevate active-elevate-2"
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] uppercase font-medium",
                        l.group === "dna" && "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300",
                        l.group === "history" && "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
                        l.group === "records" && "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
                        l.group === "tree" && "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300"
                      )}
                    >
                      {l.group[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {l.label}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{l.hint}</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: "warn";
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">{label}</div>
      <div
        className={cn(
          "font-display text-lg sm:text-xl font-semibold tabular-nums tracking-tight",
          accent === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </div>
      {subtext && <div className="text-[11px] text-muted-foreground mt-0.5">{subtext}</div>}
    </div>
  );
}

function CoverageBar({
  label,
  value,
  total,
  hint,
}: {
  label: string;
  value: number;
  total: number;
  hint: string;
}) {
  const pct = Math.round((value / Math.max(1, total)) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {value} <span className="text-muted-foreground/60">/ {total}</span> · {hint}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-foreground/70 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PersonPicker({
  value,
  onChange,
}: {
  value: Person | null;
  onChange: (p: Person | null) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => (query.trim() ? searchPeople(query, 8) : []),
    [query]
  );

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border bg-background/40 p-2.5">
        <PersonAvatar person={value} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{fullDisplayName(value)}</div>
          <div className="text-[11px] text-muted-foreground">{lifespan(value)}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="text-[11px] rounded-md border bg-background/60 px-2 py-1 hover-elevate active-elevate-2"
          data-testid="picker-change"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a person…"
          className="pl-8 h-9 text-sm"
          data-testid="picker-input"
          autoFocus
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-auto rounded-md border bg-card divide-y">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setQuery("");
                }}
                className="w-full flex items-center gap-3 p-2.5 hover-elevate active-elevate-2 text-left"
                data-testid={`picker-result-${p.id}`}
              >
                <PersonAvatar person={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{fullDisplayName(p)}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {lifespan(p)}
                    {p.birth?.place && <> · {p.birth.place}</>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkChipRow({ links }: { links: ReturnType<typeof linksFor> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => (
        <a
          key={l.id}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          title={l.hint}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] hover-elevate active-elevate-2",
            l.group === "tree" && "bg-sky-500/10 border-sky-500/30",
            l.group === "records" && "bg-emerald-500/10 border-emerald-500/30",
            l.group === "graves" && "bg-stone-500/10 border-stone-500/30",
            l.group === "newspapers" && "bg-amber-500/10 border-amber-500/30",
            l.group === "country" && "bg-violet-500/10 border-violet-500/30"
          )}
        >
          {l.countryName && <CountryFlag country={l.countryName} className="h-2.5 w-3.5 rounded-sm" />}
          {l.label}
          <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}
