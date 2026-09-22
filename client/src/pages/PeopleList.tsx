import { Link, useSearch } from "wouter";
import { useEffect, useMemo, useState } from "react";
import {
  bySurname,
  baseSurname,
  byCountry,
  personCountry,
  fullDisplayName,
  lifespan,
  parseYear,
  people as allPeople,
  type Person,
} from "@/lib/family";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CountryFlag } from "@/components/CountryFlag";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/PageHero";
import { ChevronDown, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "surname" | "country";
type SortKey = "surname" | "given" | "birth-asc" | "birth-desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "surname", label: "Surname A–Z" },
  { key: "given", label: "First name A–Z" },
  { key: "birth-asc", label: "Birth year — oldest" },
  { key: "birth-desc", label: "Birth year — newest" },
];

interface PeopleSection {
  key: string;
  label: string;
  items: Person[];
}

function firstLetter(s: string): string {
  const c = (s || "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

/** Sort the pool and split it into labelled sections (alphabetical letters for
 *  name sorts, birth decades for chronological sorts) so the long list reads
 *  like a directory instead of an undifferentiated grid. */
function buildSections(pool: Person[], sort: SortKey): PeopleSection[] {
  if (sort === "birth-asc" || sort === "birth-desc") {
    const sorted = [...pool].sort((a, b) => {
      const ya = parseYear(a.birth?.date);
      const yb = parseYear(b.birth?.date);
      if (ya == null && yb == null) return fullDisplayName(a).localeCompare(fullDisplayName(b));
      if (ya == null) return 1;
      if (yb == null) return -1;
      return sort === "birth-asc" ? ya - yb : yb - ya;
    });
    const groups = new Map<string, Person[]>();
    for (const p of sorted) {
      const y = parseYear(p.birth?.date);
      const label = y == null ? "No birth year" : `${Math.floor(y / 10) * 10}s`;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(p);
    }
    return [...groups.entries()].map(([label, items]) => ({ key: label, label, items }));
  }

  const keyOf = (p: Person) =>
    sort === "given" ? p.given || p.name : baseSurname(p.surname) || p.surname || "";
  const sorted = [...pool].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (!ka && kb) return 1;
    if (ka && !kb) return -1;
    const c = ka.localeCompare(kb);
    return c !== 0 ? c : fullDisplayName(a).localeCompare(fullDisplayName(b));
  });
  const groups = new Map<string, Person[]>();
  for (const p of sorted) {
    const k = keyOf(p);
    const letter = k ? firstLetter(k) : "—";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(p);
  }
  // A–Z first, then "#" (non-letter), then "—" (no surname).
  const rank = (l: string) => (l === "—" ? 2 : l === "#" ? 1 : 0);
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([letter, items]) => ({
      key: letter === "—" ? "none" : letter,
      label: letter === "—" ? "No surname" : letter,
      items,
    }));
}

function personMatchesQuery(p: Person, q: string): boolean {
  const hay = [
    p.name,
    p.given,
    p.surname,
    p.birth?.place,
    p.death?.place,
    p.burial?.place,
    ...(p.occupations ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export default function PeopleList() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialSurname = params.get("surname");
  const initialCountry = params.get("country");
  const urlQuery = params.get("q") ?? "";

  const [filter, setFilter] = useState(urlQuery);
  const [category, setCategory] = useState<Category>(initialCountry ? "country" : "surname");
  const [activeSurname, setActiveSurname] = useState<string | null>(initialSurname);
  const [activeCountry, setActiveCountry] = useState<string | null>(initialCountry);

  // Keep the directory in sync when arriving from Home search (`#/people?q=`).
  useEffect(() => {
    if (urlQuery) setFilter(urlQuery);
    if (initialSurname) {
      setActiveSurname(initialSurname);
      setActiveCountry(null);
      setCategory("surname");
    }
    if (initialCountry) {
      setActiveCountry(initialCountry);
      setActiveSurname(null);
      setCategory("country");
    }
  }, [urlQuery, initialSurname, initialCountry]);
  const [livingFilter, setLivingFilter] = useState<"all" | "living" | "deceased">("all");
  const [sort, setSort] = useState<SortKey>("surname");
  // Mobile-only: the long surname/country browser is collapsed by default so the
  // results sit near the top of the screen. On md+ the full sidebar always shows.
  const [facetsOpen, setFacetsOpen] = useState(false);

  const surnameGroups = useMemo(() => bySurname(), []);
  const surnames = useMemo(
    () =>
      Object.entries(surnameGroups)
        .map(([s, ps]) => ({ surname: s, count: ps.length }))
        .sort((a, b) => b.count - a.count || a.surname.localeCompare(b.surname)),
    [surnameGroups],
  );

  const countryGroups = useMemo(() => byCountry(), []);
  const countries = useMemo(
    () =>
      Object.entries(countryGroups)
        .map(([c, ps]) => ({ country: c, count: ps.length }))
        .sort((a, b) => {
          // Always push "Unknown" to the bottom
          if (a.country === "Unknown" && b.country !== "Unknown") return 1;
          if (b.country === "Unknown" && a.country !== "Unknown") return -1;
          return b.count - a.count || a.country.localeCompare(b.country);
        }),
    [countryGroups],
  );

  const filtered: Person[] = useMemo(() => {
    let pool = allPeople;
    if (activeSurname) {
      const want = baseSurname(activeSurname) || activeSurname;
      pool = pool.filter((p) => (baseSurname(p.surname) || "(Unknown)") === want);
    }
    if (activeCountry)
      pool = pool.filter((p) => (personCountry(p) || "Unknown") === activeCountry);
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      pool = pool.filter((p) => personMatchesQuery(p, q));
    }
    if (livingFilter === "living") {
      pool = pool.filter((p) => !p.death?.date && parseYear(p.birth?.date) && new Date().getFullYear() - parseYear(p.birth?.date)! < 110);
    } else if (livingFilter === "deceased") {
      pool = pool.filter((p) => p.death?.date);
    }
    return pool;
  }, [filter, activeSurname, activeCountry, livingFilter]);

  const sections = useMemo(() => buildSections(filtered, sort), [filtered, sort]);

  const hasActiveFilters =
    Boolean(filter.trim()) ||
    Boolean(activeSurname) ||
    Boolean(activeCountry) ||
    livingFilter !== "all";

  function clearFilters() {
    setFilter("");
    setActiveSurname(null);
    setActiveCountry(null);
    setLivingFilter("all");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-5 py-6 sm:py-8">
      <PageHero
        eyebrow="Directory"
        title="All people"
        description="Search the archive by name, place, or occupation. Filter by surname, country, and living status."
        icon={Users}
        stats={[
          { label: "Showing", value: filtered.length, tone: "primary" },
          { label: "In archive", value: allPeople.length },
        ]}
      />

      {hasActiveFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="active-filters">
          {filter.trim() && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-2 py-1 text-xs text-foreground hover-elevate active-elevate-2"
              data-testid="chip-query"
            >
              “{filter.trim()}”
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          {activeSurname && (
            <button
              type="button"
              onClick={() => setActiveSurname(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-2 py-1 text-xs text-foreground hover-elevate active-elevate-2"
              data-testid="chip-surname"
            >
              {activeSurname}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          {activeCountry && (
            <button
              type="button"
              onClick={() => setActiveCountry(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-2 py-1 text-xs text-foreground hover-elevate active-elevate-2"
              data-testid="chip-country"
            >
              {activeCountry}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          {livingFilter !== "all" && (
            <button
              type="button"
              onClick={() => setLivingFilter("all")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-2 py-1 text-xs capitalize text-foreground hover-elevate active-elevate-2"
              data-testid="chip-living"
            >
              {livingFilter}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            data-testid="button-clear-filters"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 md:gap-6 md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="space-y-4 sm:space-y-6 min-w-0 w-full">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name, place, or occupation…"
                className="pl-9 rounded-full"
                data-testid="input-filter"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Living
            </div>
            <div className="flex gap-1 rounded-md border bg-card p-1">
              {(["all", "living", "deceased"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setLivingFilter(opt)}
                  className={cn(
                    "flex-1 min-h-10 text-xs py-2 px-2 rounded capitalize hover-elevate active-elevate-2",
                    livingFilter === opt
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                  data-testid={`filter-${opt}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex gap-1 rounded-md border bg-card p-1 mb-2">
              {([
                { key: "surname", label: "Surname" },
                { key: "country", label: "Country" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setCategory(opt.key)}
                  className={cn(
                    "flex-1 text-xs py-1 px-2 rounded hover-elevate active-elevate-2",
                    category === opt.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                  data-testid={`category-${opt.key}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Mobile-only disclosure: collapses the long facet list so results
                stay near the top. Hidden on md+, where the sidebar is always open. */}
            <button
              type="button"
              onClick={() => setFacetsOpen((v) => !v)}
              aria-expanded={facetsOpen}
              className="md:hidden mb-2 w-full flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm hover-elevate active-elevate-2"
              data-testid="button-facets-toggle"
            >
              <span className="truncate min-w-0">
                {category === "surname"
                  ? activeSurname
                    ? `Surname · ${activeSurname}`
                    : "Browse by surname"
                  : activeCountry
                    ? `Country · ${activeCountry}`
                    : "Browse by country"}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  facetsOpen && "rotate-180",
                )}
              />
            </button>

            <div className={cn("md:block", facetsOpen ? "block" : "hidden")}>
            {category === "surname" ? (
              <>
                <button
                  onClick={() => setActiveSurname(null)}
                  className={cn(
                    "w-full flex items-center justify-between text-sm py-1.5 px-2 rounded hover-elevate active-elevate-2",
                    !activeSurname ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                  data-testid="surname-all"
                >
                  <span>All</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{allPeople.length}</span>
                </button>
                <div className="max-h-[40vh] md:max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
                  {surnames.map((s) => (
                    <button
                      key={s.surname}
                      onClick={() => {
                        setActiveSurname(s.surname);
                        setActiveCountry(null);
                        setFacetsOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between text-sm py-1.5 px-2 rounded hover-elevate active-elevate-2 text-left",
                        activeSurname === s.surname
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                      data-testid={`surname-btn-${s.surname}`}
                    >
                      <span className="truncate">{s.surname}</span>
                      <span className="text-xs tabular-nums">{s.count}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setActiveCountry(null)}
                  className={cn(
                    "w-full flex items-center justify-between text-sm py-1.5 px-2 rounded hover-elevate active-elevate-2",
                    !activeCountry ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                  data-testid="country-all"
                >
                  <span>All</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{allPeople.length}</span>
                </button>
                <div className="max-h-[40vh] md:max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
                  {countries.map((c) => (
                    <button
                      key={c.country}
                      onClick={() => {
                        setActiveCountry(c.country);
                        setActiveSurname(null);
                        setFacetsOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded hover-elevate active-elevate-2 text-left",
                        activeCountry === c.country
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                      data-testid={`country-btn-${c.country}`}
                    >
                      <span className="truncate min-w-0 flex items-center gap-2">
                        <CountryFlag country={c.country} size="sm" />
                        <span className="truncate">{c.country}</span>
                      </span>
                      <span className="text-xs tabular-nums">{c.count}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            </div>
          </div>
        </aside>

        {/* List */}
        <div className="min-w-0">
          {/* Toolbar: result count + sort */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="text-xs text-muted-foreground tabular-nums">
              {filtered.length} {filtered.length === 1 ? "person" : "people"}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-[0.16em] text-[10px]">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                data-testid="select-sort"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Jump strip: hop to a letter / decade section */}
          {sections.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-4">
              {sections.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`grp-${s.key}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[11px] font-medium text-muted-foreground hover-elevate active-elevate-2"
                  data-testid={`jump-${s.key}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 sm:p-12 text-center">
              <p className="text-sm text-muted-foreground">No people match these filters.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover-elevate active-elevate-2"
                  data-testid="button-empty-clear"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            sections.map((sec) => (
              <section key={sec.key} className="mb-5 last:mb-0">
                <div
                  id={`grp-${sec.key}`}
                  className="scroll-mt-28 sticky top-[var(--shell-header)] z-10 -mx-1 mb-2 flex items-baseline gap-2 border-b border-border/60 bg-background/90 px-1 py-2 backdrop-blur"
                >
                  <span className="font-display text-sm font-semibold">{sec.label}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {sec.items.length}
                  </span>
                </div>
                <ul className="divide-y divide-border/70 rounded-lg border border-card-border bg-card shadow-sm overflow-hidden">
                  {sec.items.map((p) => {
                    const place = p.birth?.place?.split(",")[0]?.trim();
                    const occupation = (p.occupations ?? []).find(Boolean);
                    return (
                      <li key={p.id} className="min-w-0">
                        <Link
                          href={`/person/${encodeURIComponent(p.id)}`}
                          className="flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-2.5 hover-elevate active-elevate-2 min-w-0 min-h-[4.25rem] sm:min-h-[3rem]"
                          data-testid={`person-row-${p.id}`}
                        >
                          <PersonAvatar person={p} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="text-base sm:text-sm font-medium truncate">
                              {fullDisplayName(p)}
                            </div>
                            <div className="text-sm sm:text-xs text-muted-foreground truncate">
                              {lifespan(p)}
                              {place ? ` · ${place}` : ""}
                            </div>
                          </div>
                          {occupation && (
                            <div className="hidden md:block max-w-[12rem] text-xs text-muted-foreground truncate text-right">
                              {occupation}
                            </div>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
