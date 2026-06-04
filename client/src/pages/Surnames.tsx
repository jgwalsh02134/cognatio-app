import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Search, ChevronRight, Users } from "lucide-react";
import {
  people,
  parseYear,
  fullDisplayName,
  lifespan,
  bySurname,
  type Person,
} from "@/lib/family";
import { PersonAvatar } from "@/components/PersonAvatar";
import { SurnameArms, getArmsForSurname } from "@/components/SurnameArms";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SurnameEntry {
  surname: string;
  people: Person[];
  minYear: number | null;
  maxYear: number | null;
  topPlace: string | null;
  hasArms: boolean;
}

function buildSurnames(): SurnameEntry[] {
  const grouped = bySurname();
  const out: SurnameEntry[] = [];
  for (const [surname, list] of Object.entries(grouped)) {
    if (!surname || surname === "Unknown") continue;
    let minY: number | null = null;
    let maxY: number | null = null;
    const placeCounts: Record<string, number> = {};
    for (const p of list) {
      const by = parseYear(p.birth?.date);
      const dy = parseYear(p.death?.date);
      const y = by ?? dy;
      if (y) {
        if (minY === null || y < minY) minY = y;
        if (maxY === null || y > maxY) maxY = y;
      }
      const place = p.birth?.place || p.death?.place;
      if (place) {
        const key = place.split(",").map((s) => s.trim()).slice(-2).join(", ");
        placeCounts[key] = (placeCounts[key] || 0) + 1;
      }
    }
    let topPlace: string | null = null;
    let topCount = 0;
    for (const [k, v] of Object.entries(placeCounts)) {
      if (v > topCount) {
        topPlace = k;
        topCount = v;
      }
    }
    out.push({
      surname,
      people: list,
      minYear: minY,
      maxYear: maxY,
      topPlace,
      hasArms: !!getArmsForSurname(surname),
    });
  }
  return out.sort((a, b) => {
    if (a.hasArms !== b.hasArms) return a.hasArms ? -1 : 1;
    if (b.people.length !== a.people.length) return b.people.length - a.people.length;
    return a.surname.localeCompare(b.surname);
  });
}

export default function Surnames() {
  const all = useMemo(() => buildSurnames(), []);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyArms, setOnlyArms] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((e) => {
      if (onlyArms && !e.hasArms) return false;
      if (!q) return true;
      return e.surname.toLowerCase().includes(q);
    });
  }, [all, query, onlyArms]);

  const totalPeople = useMemo(
    () => filtered.reduce((acc, e) => acc + e.people.length, 0),
    [filtered],
  );
  const totalArms = useMemo(() => all.filter((e) => e.hasArms).length, [all]);

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
          Surname directory
        </p>
        <h1 className="font-display text-lg sm:text-xl font-semibold leading-[1.15] tracking-tight">
          Every family name in the archive
        </h1>
        <p className="text-sm text-muted-foreground mt-2.5 max-w-2xl">
          {people.length} individuals across {all.length} surnames, with {totalArms} surnames
          carrying registered coats of arms. Click a surname to see everyone who bears it.
        </p>
      </header>

      <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter surnames…"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            data-testid="input-surnames-filter"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyArms((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-3 py-2 min-h-10 text-xs transition-colors",
            onlyArms
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover-elevate",
          )}
          data-testid="filter-only-arms"
        >
          With coat of arms only
        </button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span data-testid="stat-surnames-count">
            <span className="font-medium text-foreground">{filtered.length}</span> surname
            {filtered.length === 1 ? "" : "s"}
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="stat-people-count">
            <span className="font-medium text-foreground">{totalPeople}</span> people
          </span>
        </div>
      </div>

      <section className="mt-5 sm:mt-6 grid gap-2.5">
        {filtered.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No surnames match "{query}".
            </CardContent>
          </Card>
        ) : (
          filtered.map((entry) => {
            const isOpen = expanded === entry.surname;
            return (
              <Card key={entry.surname} className="border-card-border">
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.surname)}
                    className="w-full flex items-center gap-3 sm:gap-4 px-4 py-3 text-left hover-elevate active-elevate-2"
                    data-testid={`surname-row-${entry.surname.toLowerCase()}`}
                  >
                    <div className="w-12 sm:w-14 flex items-center justify-center shrink-0">
                      {entry.hasArms ? (
                        <SurnameArms surname={entry.surname} size="md" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center text-xs font-medium text-muted-foreground">
                          {entry.surname[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-base sm:text-lg font-semibold truncate">
                        {entry.surname}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="tabular-nums">
                          {entry.people.length} {entry.people.length === 1 ? "person" : "people"}
                        </span>
                        {entry.minYear && entry.maxYear && entry.minYear !== entry.maxYear && (
                          <span className="tabular-nums">
                            {entry.minYear} – {entry.maxYear}
                          </span>
                        )}
                        {entry.topPlace && (
                          <span className="truncate max-w-[16rem]">{entry.topPlace}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-card-border bg-background/40 px-4 py-3">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3 w-3" />
                          {entry.surname} family ({entry.people.length})
                        </span>
                      </div>
                      <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2">
                        {[...entry.people]
                          .sort((a, b) => {
                            const ay = parseYear(a.birth?.date) ?? Infinity;
                            const by = parseYear(b.birth?.date) ?? Infinity;
                            return ay - by;
                          })
                          .map((p) => (
                            <Link
                              key={p.id}
                              href={`/person/${encodeURIComponent(p.id)}`}
                              className="flex items-center gap-2.5 rounded-md px-2 py-2.5 hover-elevate active-elevate-2 min-w-0"
                              data-testid={`surname-person-${p.id}`}
                            >
                              <PersonAvatar person={p} size="xs" />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium truncate leading-tight">
                                  {fullDisplayName(p)}
                                </div>
                                <div className="text-[10px] text-muted-foreground tabular-nums leading-tight">
                                  {lifespan(p)}
                                </div>
                              </div>
                            </Link>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
