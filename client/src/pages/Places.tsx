import { useMemo, useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { MapPin, Search, ArrowLeft, Users, ChevronDown } from "lucide-react";
import { people, fullDisplayName, lifespan, type Person } from "@/lib/family";
import { placeCountry, placeRegion, UNSPECIFIED_REGION } from "@/lib/geo";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CountryFlag } from "@/components/CountryFlag";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PlaceEntry {
  place: string;
  count: number;
  births: number;
  deaths: number;
  residences: number;
  people: Person[];
}

interface RegionGroup {
  region: string;
  places: PlaceEntry[];
  people: number;
}

interface CountryGroup {
  country: string;
  regions: RegionGroup[];
  people: number;
  placeCount: number;
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
        map[key] = { place: key, count: 0, births: 0, deaths: 0, residences: 0, people: [] };
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
  return Object.values(map);
}

function uniquePeople(lists: PlaceEntry[]): number {
  const s = new Set<string>();
  for (const e of lists) for (const p of e.people) s.add(p.id);
  return s.size;
}

type Sort = "count" | "alpha";

/** Group the flat place index into Country → Region → Place. */
function buildHierarchy(entries: PlaceEntry[], sort: Sort): CountryGroup[] {
  const byCountry = new Map<string, Map<string, PlaceEntry[]>>();
  for (const e of entries) {
    const country = placeCountry(e.place) || "Unknown";
    const region = placeRegion(e.place);
    if (!byCountry.has(country)) byCountry.set(country, new Map());
    const regions = byCountry.get(country)!;
    if (!regions.has(region)) regions.set(region, []);
    regions.get(region)!.push(e);
  }

  const placeCmp = (a: PlaceEntry, b: PlaceEntry) =>
    sort === "alpha"
      ? a.place.localeCompare(b.place)
      : b.count - a.count || a.place.localeCompare(b.place);

  const groups: CountryGroup[] = [];
  for (const [country, regionMap] of byCountry) {
    const regions: RegionGroup[] = [];
    const all: PlaceEntry[] = [];
    for (const [region, list] of regionMap) {
      list.sort(placeCmp);
      regions.push({ region, places: list, people: uniquePeople(list) });
      all.push(...list);
    }
    regions.sort((a, b) => {
      const ao = a.region === UNSPECIFIED_REGION ? 1 : 0;
      const bo = b.region === UNSPECIFIED_REGION ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return sort === "alpha"
        ? a.region.localeCompare(b.region)
        : b.people - a.people || a.region.localeCompare(b.region);
    });
    groups.push({ country, regions, people: uniquePeople(all), placeCount: all.length });
  }

  groups.sort((a, b) => {
    const au = a.country === "Unknown" ? 1 : 0;
    const bu = b.country === "Unknown" ? 1 : 0;
    if (au !== bu) return au - bu;
    return sort === "alpha"
      ? a.country.localeCompare(b.country)
      : b.people - a.people || a.country.localeCompare(b.country);
  });
  return groups;
}

export default function Places() {
  const search = useSearch();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedCountries, setCollapsedCountries] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>("count");

  const all = useMemo(() => buildPlaceIndex(), []);

  // Read ?q= from the hash route (from the map / cross-links).
  useEffect(() => {
    const q = new URLSearchParams(search).get("q");
    if (q) {
      setQuery(q);
      setExpanded(q);
    }
  }, [search]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        p.place.toLowerCase().includes(q) ||
        placeCountry(p.place).toLowerCase().includes(q) ||
        placeRegion(p.place).toLowerCase().includes(q),
    );
  }, [all, query]);

  const groups = useMemo(
    () => buildHierarchy(filteredEntries, sort),
    [filteredEntries, sort],
  );

  const totalPeople = useMemo(() => uniquePeople(filteredEntries), [filteredEntries]);
  const filtering = query.trim().length > 0;

  function toggleCountry(country: string) {
    setCollapsedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  }

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
          Every town, parish, and city referenced across births, deaths, and residences,
          organized by country and region. Open a place to see who's anchored there.
        </p>
      </header>

      <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter — e.g. Troy, Ireland, New York"
            className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
            data-testid="input-places-filter"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-md border border-border bg-background px-2.5 py-2 min-h-10 text-sm outline-none focus:border-primary"
          data-testid="select-places-sort"
          aria-label="Sort places"
        >
          <option value="count">Most people</option>
          <option value="alpha">A–Z</option>
        </select>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span data-testid="stat-places-count">
            <span className="font-medium text-foreground">{filteredEntries.length}</span>{" "}
            place{filteredEntries.length === 1 ? "" : "s"}
          </span>
          <span aria-hidden="true">·</span>
          <span data-testid="stat-people-count">
            <span className="font-medium text-foreground">{totalPeople}</span> people
          </span>
        </div>
      </div>

      <section className="mt-5 sm:mt-6 space-y-3">
        {groups.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No places match "{query}".
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => {
            const open = filtering || !collapsedCountries.has(group.country);
            return (
              <Card key={group.country} className="border-card-border overflow-hidden">
                <CardContent className="p-0">
                  {/* Country header */}
                  <button
                    type="button"
                    onClick={() => toggleCountry(group.country)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover-elevate active-elevate-2"
                    data-testid={`country-row-${group.country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    <CountryFlag country={group.country} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-sm font-semibold truncate">
                        {group.country}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {group.placeCount} place{group.placeCount === 1 ? "" : "s"} ·{" "}
                        {group.regions.length} region{group.regions.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Users className="h-3 w-3" />
                      {group.people}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>

                  {open && (
                    <div className="border-t border-card-border">
                      {group.regions.map((region) => (
                        <div key={region.region}>
                          <div className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-1.5">
                            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              {region.region}
                            </span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {region.people}
                            </span>
                          </div>
                          <ul className="divide-y divide-border/50">
                            {region.places.map((entry) => (
                              <PlaceRow
                                key={entry.place}
                                entry={entry}
                                open={expanded === entry.place}
                                onToggle={() =>
                                  setExpanded(expanded === entry.place ? null : entry.place)
                                }
                              />
                            ))}
                          </ul>
                        </div>
                      ))}
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

function PlaceRow({
  entry,
  open,
  onToggle,
}: {
  entry: PlaceEntry;
  open: boolean;
  onToggle: () => void;
}) {
  // The most specific token of the place — the locality within its region.
  const locality = entry.place.split(",")[0].trim() || entry.place;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover-elevate active-elevate-2"
        data-testid={`place-row-${entry.place.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      >
        <MapPin className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{locality}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {entry.births > 0 && (
              <span><span className="tabular-nums">{entry.births}</span> born</span>
            )}
            {entry.deaths > 0 && (
              <span><span className="tabular-nums">{entry.deaths}</span> died</span>
            )}
            {entry.residences > 0 && (
              <span><span className="tabular-nums">{entry.residences}</span> lived</span>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Users className="h-3 w-3" />
          {entry.people.length}
        </span>
      </button>
      {open && (
        <div className="bg-background/40 px-4 py-3">
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
    </li>
  );
}
