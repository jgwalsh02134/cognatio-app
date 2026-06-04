import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { MapPin, Search, ArrowLeft, Users } from "lucide-react";
import { people, fullDisplayName, lifespan, type Person } from "@/lib/family";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Card, CardContent } from "@/components/ui/card";

interface PlaceEntry {
  place: string;
  count: number;
  births: number;
  deaths: number;
  residences: number;
  people: Person[];
}

/** Build an exhaustive place index across birth/death/residence places. */
function buildPlaceIndex(): PlaceEntry[] {
  const map: Record<string, PlaceEntry> = {};
  for (const p of people) {
    const tags: { place: string; kind: "birth" | "death" | "residence" }[] = [];
    if (p.birth?.place) tags.push({ place: p.birth.place, kind: "birth" });
    if (p.death?.place) tags.push({ place: p.death.place, kind: "death" });
    for (const r of p.residences ?? []) {
      if (r.place) tags.push({ place: r.place, kind: "residence" });
    }
    const seen = new Set<string>();
    for (const { place, kind } of tags) {
      const key = place.trim();
      if (!key) continue;
      if (!map[key]) {
        map[key] = {
          place: key,
          count: 0,
          births: 0,
          deaths: 0,
          residences: 0,
          people: [],
        };
      }
      const entry = map[key];
      if (!seen.has(key + ":person:" + p.id)) {
        entry.people.push(p);
        seen.add(key + ":person:" + p.id);
      }
      entry.count += 1;
      if (kind === "birth") entry.births += 1;
      else if (kind === "death") entry.deaths += 1;
      else entry.residences += 1;
    }
  }
  return Object.values(map).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.place.localeCompare(b.place);
  });
}

export default function Places() {
  const [location] = useLocation();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Read ?q= from the hash route.
  useEffect(() => {
    const match = location.match(/[?&]q=([^&]+)/);
    if (match) {
      const decoded = decodeURIComponent(match[1].replace(/\+/g, " "));
      setQuery(decoded);
      setExpanded(decoded);
    }
  }, [location]);

  const all = useMemo(() => buildPlaceIndex(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.place.toLowerCase().includes(q));
  }, [all, query]);

  const totalPeople = useMemo(() => {
    const ids = new Set<string>();
    for (const e of filtered) for (const p of e.people) ids.add(p.id);
    return ids.size;
  }, [filtered]);

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
          Place explorer
        </p>
        <h1 className="font-display text-lg sm:text-xl font-semibold leading-[1.15] tracking-tight">
          Where the family lived
        </h1>
        <p className="text-sm text-muted-foreground mt-2.5 max-w-2xl">
          Every town, parish, and city referenced across births, deaths, and residences.
          Filter by name or click a row to see the people anchored there.
        </p>
      </header>

      <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter places — e.g. Troy, Ireland, Albany"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            data-testid="input-places-filter"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span data-testid="stat-places-count">
            <span className="font-medium text-foreground">{filtered.length}</span> place
            {filtered.length === 1 ? "" : "s"}
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="stat-people-count">
            <span className="font-medium text-foreground">{totalPeople}</span> people
          </span>
        </div>
      </div>

      <section className="mt-5 sm:mt-6 space-y-2">
        {filtered.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No places match "{query}".
            </CardContent>
          </Card>
        ) : (
          filtered.map((entry) => {
            const isOpen = expanded === entry.place;
            return (
              <Card key={entry.place} className="border-card-border">
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : entry.place)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover-elevate active-elevate-2"
                    data-testid={`place-row-${entry.place.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{entry.place}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {entry.births > 0 && (
                          <span>
                            <span className="tabular-nums">{entry.births}</span> born
                          </span>
                        )}
                        {entry.deaths > 0 && (
                          <span>
                            <span className="tabular-nums">{entry.deaths}</span> died
                          </span>
                        )}
                        {entry.residences > 0 && (
                          <span>
                            <span className="tabular-nums">{entry.residences}</span> lived
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Users className="h-3 w-3" />
                      {entry.people.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-card-border bg-background/40 px-4 py-3">
                      <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2">
                        {entry.people.map((p) => (
                          <Link
                            key={p.id}
                            href={`/person/${encodeURIComponent(p.id)}`}
                            className="flex items-center gap-2.5 rounded-md px-2 py-2.5 hover-elevate active-elevate-2 min-w-0"
                            data-testid={`place-person-${p.id}`}
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
