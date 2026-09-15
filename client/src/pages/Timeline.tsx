import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Baby,
  Cross,
  Heart,
  Shield,
  GraduationCap,
  Home as HomeIcon,
  Filter,
} from "lucide-react";
import {
  people,
  families,
  parseYear,
  fullDisplayName,
  peopleById,
  type Person,
} from "@/lib/family";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EventKind = "birth" | "death" | "marriage" | "military" | "education" | "residence";

interface TimelineEvent {
  year: number;
  kind: EventKind;
  /** Primary person for avatar/link. Marriage uses spouseB if both present. */
  person: Person;
  /** Secondary person for marriage events. */
  partner?: Person;
  place?: string | null;
  detail?: string | null;
}

const KIND_META: Record<
  EventKind,
  { label: string; icon: typeof Baby; tone: string }
> = {
  birth: { label: "Born", icon: Baby, tone: "text-emerald-700 dark:text-emerald-300" },
  death: { label: "Died", icon: Cross, tone: "text-stone-500 dark:text-stone-400" },
  marriage: { label: "Married", icon: Heart, tone: "text-rose-700 dark:text-rose-300" },
  military: { label: "Served", icon: Shield, tone: "text-blue-700 dark:text-blue-300" },
  education: { label: "Studied", icon: GraduationCap, tone: "text-purple-700 dark:text-purple-300" },
  residence: { label: "Settled", icon: HomeIcon, tone: "text-amber-700 dark:text-amber-300" },
};

function buildTimeline(): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const p of people) {
    const by = parseYear(p.birth?.date);
    if (by) {
      out.push({
        year: by,
        kind: "birth",
        person: p,
        place: p.birth?.place ?? null,
      });
    }
    const dy = parseYear(p.death?.date);
    if (dy) {
      out.push({
        year: dy,
        kind: "death",
        person: p,
        place: p.death?.place ?? null,
      });
    }
    if (p.military) {
      // Try to parse a year from military service notes if present
      const dates = p.military.dates || p.military.notes || "";
      const m = String(dates).match(/\b(1[6-9]\d{2}|20\d{2})\b/);
      if (m) {
        out.push({
          year: parseInt(m[1], 10),
          kind: "military",
          person: p,
          detail: p.military.branch || p.military.unit || null,
        });
      }
    }
    for (const ed of p.educations ?? []) {
      const ey = parseYear(ed.date);
      if (ey) {
        out.push({
          year: ey,
          kind: "education",
          person: p,
          place: ed.place ?? null,
          detail: ed.note ?? null,
        });
      }
    }
    for (const r of p.residences ?? []) {
      const ry = parseYear(r.date);
      if (ry) {
        out.push({
          year: ry,
          kind: "residence",
          person: p,
          place: r.place ?? null,
        });
      }
    }
  }
  for (const fam of families) {
    if (!fam.marriage) continue;
    const my = parseYear(fam.marriage.date);
    if (!my) continue;
    const husband = fam.husband_id ? peopleById[fam.husband_id] : undefined;
    const wife = fam.wife_id ? peopleById[fam.wife_id] : undefined;
    const primary = husband || wife;
    if (!primary) continue;
    out.push({
      year: my,
      kind: "marriage",
      person: primary,
      partner: primary === husband ? wife : husband,
      place: fam.marriage.place ?? null,
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

const FILTERS: { key: EventKind | "all"; label: string }[] = [
  { key: "all", label: "All events" },
  { key: "birth", label: "Births" },
  { key: "death", label: "Deaths" },
  { key: "marriage", label: "Marriages" },
  { key: "military", label: "Military" },
  { key: "education", label: "Education" },
  { key: "residence", label: "Residences" },
];

export default function Timeline() {
  const events = useMemo(() => buildTimeline(), []);
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!q) return true;
      const hay = [
        fullDisplayName(e.person),
        e.partner ? fullDisplayName(e.partner) : "",
        e.place ?? "",
        e.detail ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [events, filter, query]);

  // Group by century for chrono section headers.
  const grouped = useMemo(() => {
    const map = new Map<number, TimelineEvent[]>();
    for (const e of filtered) {
      const century = Math.floor(e.year / 100) * 100;
      if (!map.has(century)) map.set(century, []);
      map.get(century)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const yearRange = useMemo(() => {
    if (events.length === 0) return null;
    return { min: events[0].year, max: events[events.length - 1].year };
  }, [events]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[e.kind] = (c[e.kind] || 0) + 1;
    return c;
  }, [events]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-5 py-5 sm:py-8 fade-up">
      <div className="mb-5 sm:mb-7">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-2 -mx-1.5 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
          data-testid="link-back-home"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back home
        </Link>
      </div>

      <header className="pb-6 sm:pb-8 border-b">
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Family timeline
        </p>
        <h1 className="font-display text-lg sm:text-xl font-semibold leading-[1.15] tracking-tight">
          A chronological history
        </h1>
        <p className="text-sm text-muted-foreground mt-2.5 max-w-2xl">
          Every dated life event across the archive — births, marriages, deaths, military service,
          schooling, and homes — laid out in order.
          {yearRange && (
            <>
              {" "}
              Spans <span className="tabular-nums text-foreground font-medium">{yearRange.min}</span>{" "}
              to <span className="tabular-nums text-foreground font-medium">{yearRange.max}</span>{" "}
              with <span className="tabular-nums text-foreground font-medium">{events.length}</span>{" "}
              events.
            </>
          )}
        </p>
      </header>

      <div className="mt-6 sm:mt-7 space-y-3">
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by person, place, or detail…"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            data-testid="input-timeline-filter"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover-elevate",
                )}
                data-testid={`filter-${f.key}`}
              >
                <span>{f.label}</span>
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="mt-7 sm:mt-9">
        {grouped.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No events match the current filter.
            </CardContent>
          </Card>
        ) : (
          grouped.map(([century, items]) => (
            <div key={century} className="mb-10 last:mb-0">
              <div className="sticky top-14 sm:top-16 z-10 bg-background/95 backdrop-blur-sm py-2 mb-3 border-b border-border/60">
                <h2 className="font-display text-xl font-semibold tabular-nums">
                  {century}s
                  <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                    {items.length} event{items.length === 1 ? "" : "s"}
                  </span>
                </h2>
              </div>
              <ol className="relative space-y-2 border-l border-border/60 ml-3 pl-5 overflow-x-hidden">
                {items.map((e, i) => {
                  const meta = KIND_META[e.kind];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={`${e.kind}-${e.person.id}-${e.year}-${i}`}
                      className="relative"
                      data-testid={`event-${e.kind}-${e.person.id}-${e.year}`}
                    >
                      <span className="absolute -left-[27px] top-3 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
                        <Icon className={cn("h-3 w-3", meta.tone)} />
                      </span>
                      <Card className="border-card-border">
                        <CardContent className="p-3 sm:p-3.5 flex items-center gap-3">
                          <Link
                            href={`/person/${encodeURIComponent(e.person.id)}`}
                            className="shrink-0"
                            data-testid={`link-event-person-${e.person.id}`}
                          >
                            <PersonAvatar person={e.person} size="sm" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-display tabular-nums text-sm font-semibold">
                                {e.year}
                              </span>
                              <span className={cn("text-[11px] uppercase tracking-wider", meta.tone)}>
                                {meta.label}
                              </span>
                            </div>
                            <div className="text-sm leading-snug mt-0.5">
                              <Link
                                href={`/person/${encodeURIComponent(e.person.id)}`}
                                className="font-medium hover:text-primary"
                              >
                                {fullDisplayName(e.person)}
                              </Link>
                              {e.partner && (
                                <>
                                  <span className="text-muted-foreground"> and </span>
                                  <Link
                                    href={`/person/${encodeURIComponent(e.partner.id)}`}
                                    className="font-medium hover:text-primary"
                                  >
                                    {fullDisplayName(e.partner)}
                                  </Link>
                                </>
                              )}
                              {e.detail && (
                                <span className="text-muted-foreground"> · {e.detail}</span>
                              )}
                            </div>
                            {e.place && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {e.place}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
