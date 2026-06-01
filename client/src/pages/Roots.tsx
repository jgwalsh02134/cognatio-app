import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Compass,
  Crown,
  Layers,
  Sparkles,
  TreePine,
  TrendingDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fullDisplayName,
  getRootPerson,
  lifespan,
  peopleById,
  type Person,
} from "@/lib/family";
import {
  ahnentafel,
  depthDistribution,
  deepestRootsBySurname,
  earliestPerSurname,
  paternalLine,
  maternalLine,
  type AhnentafelEntry,
  type RootLine,
} from "@/lib/discoveries";
import { PageHero } from "@/components/PageHero";
import { PersonAvatar } from "@/components/PersonAvatar";
import { SurnameArms } from "@/components/SurnameArms";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TabId = "lines" | "surnames" | "earliest" | "depth";
interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Compass;
}

const TABS: TabDef[] = [
  { id: "lines", label: "Direct lines", icon: TreePine },
  { id: "surnames", label: "Deepest by surname", icon: Crown },
  { id: "earliest", label: "Earliest ancestors", icon: Sparkles },
  { id: "depth", label: "Depth distribution", icon: TrendingDown },
];

export default function Roots() {
  const [tab, setTab] = useState<TabId>("lines");
  const root = useMemo(() => getRootPerson(), []);
  const rootsBySurname = useMemo(() => deepestRootsBySurname(), []);
  const earliest = useMemo(() => earliestPerSurname(1), []);
  const deepestLine = rootsBySurname[0];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-5 py-5 sm:py-8">
      <PageHero
        eyebrow="Deepest roots"
        title="Trace the line as far back as the record goes"
        description="Climb the paternal and maternal ladders, surface the earliest known ancestor for every surname, and see exactly how many generations each line reaches. Every step deep-links into the person page so you can keep digging."
        icon={Compass}
        stats={[
          { label: "Surnames tracked", value: rootsBySurname.length },
          {
            label: "Deepest line",
            value: deepestLine ? `${deepestLine.depth} gen` : "—",
            tone: "primary",
          },
          {
            label: "Earliest year",
            value: earliest[0]?.year ?? "—",
            tone: "good",
          },
          {
            label: "Apex ancestor",
            value: deepestLine ? deepestLine.apex.surname || "—" : "—",
          },
        ]}
      />

      {/* Tab bar */}
      <nav
        className="mt-1 -mx-1.5 flex gap-1 overflow-x-auto scrollbar-none px-1.5 snap-x"
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              role="tab"
              aria-selected={active}
              className={cn(
                "snap-start inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover-elevate active-elevate-2",
                active
                  ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                  : "border-border/70 bg-background/40 text-muted-foreground",
              )}
              data-testid={`roots-tab-${id}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-5">
        {tab === "lines" && root && <DirectLinesPanel rootId={root.id} />}
        {tab === "surnames" && <SurnamesPanel rows={rootsBySurname} />}
        {tab === "earliest" && <EarliestPanel rows={earliest} />}
        {tab === "depth" && <DepthDistributionPanel />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Direct lines (paternal + maternal) with Ahnentafel numbering
// ---------------------------------------------------------------------------

function DirectLinesPanel({ rootId }: { rootId: string }) {
  const paternal = useMemo(() => paternalLine(rootId, 30), [rootId]);
  const maternal = useMemo(() => maternalLine(rootId, 30), [rootId]);
  const ahn = useMemo(() => ahnentafel(rootId, 10), [rootId]);
  const root = peopleById[rootId];
  if (!root) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <LineCard
        title="Paternal line"
        subtitle="Father → grandfather → great-grandfather …"
        line={paternal}
        accent="paternal"
      />
      <LineCard
        title="Maternal line"
        subtitle="Mother → grandmother → great-grandmother …"
        line={maternal}
        accent="maternal"
      />
      <Card className="lg:col-span-2">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h2 className="font-display text-base font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                Ahnentafel ({ahn.length} ancestors, 10 generations)
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                Classic Sosa-Stradonitz numbering — subject is 1, father is 2, mother is 3, then
                father(n)=2n / mother(n)=2n+1. Use it to talk precisely about ancestors with another
                researcher.
              </p>
            </div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {ahn.length}{" "}/ {Math.pow(2, 11) - 2} possible
            </div>
          </div>
          <AhnentafelGrid entries={ahn} />
        </CardContent>
      </Card>
    </div>
  );
}

function LineCard({
  title,
  subtitle,
  line,
  accent,
}: {
  title: string;
  subtitle: string;
  line: { person: Person }[];
  accent: "paternal" | "maternal";
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold flex items-center gap-2">
          <TreePine
            className={cn(
              "h-4 w-4",
              accent === "paternal" ? "text-blue-500" : "text-pink-500",
            )}
          />
          {title}
          <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {line.length} gen
          </span>
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        <ol className="mt-3 space-y-1.5">
          {line.map((step, idx) => {
            const p = step.person;
            return (
              <li key={p.id}>
                <Link
                  href={`/person/${encodeURIComponent(p.id)}`}
                  className="group flex items-center gap-2.5 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 hover-elevate active-elevate-2"
                >
                  <span
                    className={cn(
                      "shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums",
                      accent === "paternal"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-pink-500/10 text-pink-600 dark:text-pink-400",
                    )}
                  >
                    {idx}
                  </span>
                  <PersonAvatar person={p} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{fullDisplayName(p)}</div>
                    <div className="text-[11px] text-muted-foreground">{lifespan(p)}</div>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </Link>
              </li>
            );
          })}
        </ol>
        {line.length < 3 && (
          <div className="mt-3 rounded-md border border-dashed border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
            Line ends after {line.length} generation{line.length === 1 ? "" : "s"} — this is a
            brick wall. Open the deepest person to see record-search starting points.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AhnentafelGrid({ entries }: { entries: AhnentafelEntry[] }) {
  const byGen = useMemo(() => {
    const map = new Map<number, AhnentafelEntry[]>();
    for (const e of entries) {
      if (!map.has(e.generation)) map.set(e.generation, []);
      map.get(e.generation)!.push(e);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sosa - b.sosa);
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [entries]);
  return (
    <div className="space-y-3">
      {byGen.map(([gen, list]) => (
        <section key={gen}>
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            Generation {gen}
            <span className="ml-2 normal-case tracking-normal">
              · {list.length} ancestor{list.length === 1 ? "" : "s"} known
            </span>
          </h3>
          <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {list.map((e) => (
              <Link
                key={e.sosa}
                href={`/person/${encodeURIComponent(e.person.id)}`}
                className="group flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 hover-elevate active-elevate-2 min-w-0"
              >
                <span className="shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded bg-foreground/[0.06] px-1 text-[10px] font-semibold tabular-nums">
                  {e.sosa}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium truncate">
                    {fullDisplayName(e.person)}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums truncate">
                    {lifespan(e.person)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deepest by surname
// ---------------------------------------------------------------------------

function SurnamesPanel({ rows }: { rows: RootLine[] }) {
  const max = rows[0]?.depth ?? 1;
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-muted-foreground" />
          Deepest line per surname
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-2xl">
          For every surname in the tree, the longest unbroken parent chain we have on record, the
          oldest ancestor it reaches, and how big the branch underneath it is.
        </p>
        <ul className="mt-4 space-y-1.5">
          {rows.map((r, i) => {
            const ratio = Math.max(0.1, r.depth / max);
            return (
              <li
                key={r.surname}
                className="rounded-md border border-border/60 bg-background/40 hover:bg-background/70 transition-colors"
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums w-5 text-right">
                    {i + 1}
                  </span>
                  <SurnameArms surname={r.surname} className="h-7 w-7 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-display text-sm font-semibold uppercase tracking-wider">
                        {r.surname}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.depth} generation{r.depth === 1 ? "" : "s"} ·{" "}
                        <Link
                          href={`/person/${encodeURIComponent(r.apex.id)}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {fullDisplayName(r.apex)}
                        </Link>{" "}
                        {r.apexYear ? `(b. ${r.apexYear})` : ""}
                      </div>
                    </div>
                    <div className="mt-1 h-1 w-full max-w-md rounded-full bg-foreground/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground/40"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="hidden sm:block text-right tabular-nums">
                    <div className="text-[11px] text-muted-foreground">Branch</div>
                    <div className="text-sm font-medium">{r.branchSize}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Earliest ancestors
// ---------------------------------------------------------------------------

function EarliestPanel({
  rows,
}: {
  rows: { surname: string; person: Person; year: number; count: number }[];
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Earliest known ancestor per surname
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-2xl">
          The person with the oldest birth year on record for each surname. These are your
          frontier — anywhere the next breakthrough lives.
        </p>
        <div className="mt-4 grid gap-1.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, idx) => (
            <Link
              key={r.surname}
              href={`/person/${encodeURIComponent(r.person.id)}`}
              className="group flex items-center gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2.5 hover-elevate active-elevate-2"
            >
              <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums w-5 text-right">
                {idx + 1}
              </span>
              <PersonAvatar person={r.person} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{fullDisplayName(r.person)}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {r.surname} · b. {r.year} · {r.person.birth?.place ?? "place unknown"}
                </div>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Depth distribution
// ---------------------------------------------------------------------------

function DepthDistributionPanel() {
  const data = useMemo(() => depthDistribution(), []);
  const maxDepth = data[data.length - 1]?.depth ?? 0;
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
          How deep does each person reach?
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-2xl">
          For every person in the tree, the number of generations of recorded ancestors above them.
          The taller the right-hand bars, the more people in the tree connect to a deep lineage.
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="depth"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelFormatter={(d) => `Depth ${d} generation${d === 1 ? "" : "s"}`}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="hsl(var(--foreground) / 0.55)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground tabular-nums">
          Deepest reach observed: <span className="font-semibold text-foreground">{maxDepth}</span>{" "}
          generations · Total people charted:{" "}
          <span className="font-semibold text-foreground">
            {data.reduce((s, d) => s + d.count, 0)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

