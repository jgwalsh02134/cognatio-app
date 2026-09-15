import { Link } from "wouter";
import { useMemo } from "react";
import {
  people,
  families,
  parseYear,
  fullDisplayName,
  personCountry,
  type Person,
} from "@/lib/family";
import { Card, CardContent } from "@/components/ui/card";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CountryFlag } from "@/components/CountryFlag";
import {
  Users,
  Heart,
  BarChart3,
  MapPin,
  Calendar,
  Globe,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function normalizePlace(raw: string): string {
  // Collapse "Troy, Rensselaer, New York, USA" and "...United States" variants
  // to a stable "City, State" tag for grouping. Drops ward/parish prefixes.
  const cleaned = raw
    .replace(/\bUnited States\b/gi, "USA")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return raw.trim();
  // Drop trailing "USA"/"Ireland" etc when there's enough specificity
  const tail = parts[parts.length - 1].toUpperCase();
  let last = parts.length;
  if (parts.length >= 3 && (tail === "USA" || tail === "U.S.A." || tail === "UNITED STATES")) {
    last = parts.length - 1;
  }
  const compact = parts.slice(0, last);
  // Use first segment (city/ward) + last segment (state/country)
  if (compact.length === 1) return compact[0];
  // Strip "Ward N" prefixes from the city slot
  const city = compact[0].replace(/\s+Ward\s+\d+$/i, "");
  const tailLabel = compact[compact.length - 1];
  if (compact.length === 2) return `${city}, ${tailLabel}`;
  // Middle segment is usually county — keep state/country as tail
  return `${city}, ${tailLabel}`;
}

function eventYears(p: Person): { birth: number | null; death: number | null } {
  return { birth: parseYear(p.birth?.date), death: parseYear(p.death?.date) };
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function Insights() {
  const data = useMemo(() => {
    let withBirth = 0;
    let withDeath = 0;
    let withPlace = 0;
    let withSources = 0;
    let withMilitary = 0;
    let livingCount = 0;
    const decades: Record<number, number> = {};
    const surnameCounts: Record<string, number> = {};
    const placeCounts: Record<string, number> = {};
    const countryCounts: Record<string, number> = {};
    const occupationCounts: Record<string, number> = {};
    const lifespans: number[] = [];
    let minYear = Infinity;
    let maxYear = -Infinity;
    const longestLived: Array<{ p: Person; years: number }> = [];

    for (const p of people) {
      const { birth, death } = eventYears(p);
      if (birth) {
        withBirth++;
        const decade = Math.floor(birth / 10) * 10;
        decades[decade] = (decades[decade] || 0) + 1;
        if (birth < minYear) minYear = birth;
        if (birth > maxYear) maxYear = birth;
      }
      if (death) withDeath++;
      else livingCount++;
      if (p.birth?.place || p.death?.place || (p.residences && p.residences.length)) withPlace++;
      if (p.source_count && p.source_count > 0) withSources++;
      if (p.military) withMilitary++;

      const sn = (p.surname || "").trim();
      if (sn) surnameCounts[sn] = (surnameCounts[sn] || 0) + 1;

      const eventPlaces = [
        p.birth?.place,
        p.death?.place,
        p.burial?.place,
        ...(p.residences || []).map((r) => r.place),
      ].filter((x): x is string => !!x);
      const seen = new Set<string>();
      for (const place of eventPlaces) {
        const tag = normalizePlace(place);
        if (seen.has(tag)) continue;
        seen.add(tag);
        placeCounts[tag] = (placeCounts[tag] || 0) + 1;
      }

      const country = personCountry(p);
      if (country) countryCounts[country] = (countryCounts[country] || 0) + 1;

      for (const occ of p.occupations || []) {
        if (occ.trim()) occupationCounts[occ.trim()] = (occupationCounts[occ.trim()] || 0) + 1;
      }

      if (birth && death && death > birth && death - birth < 115) {
        const years = death - birth;
        lifespans.push(years);
        longestLived.push({ p, years });
      }
    }

    longestLived.sort((a, b) => b.years - a.years);

    const avgLife = lifespans.length
      ? lifespans.reduce((a, b) => a + b, 0) / lifespans.length
      : null;
    const minLife = lifespans.length ? Math.min(...lifespans) : null;
    const maxLife = lifespans.length ? Math.max(...lifespans) : null;

    const decadeEntries = Object.entries(decades)
      .map(([k, v]) => ({ decade: Number(k), count: v }))
      .sort((a, b) => a.decade - b.decade);

    const surnameEntries = Object.entries(surnameCounts)
      .map(([surname, count]) => ({ surname, count }))
      .sort((a, b) => b.count - a.count);

    const placeEntries = Object.entries(placeCounts)
      .map(([place, count]) => ({ place, count }))
      .sort((a, b) => b.count - a.count);

    const countryEntries = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    const occupationEntries = Object.entries(occupationCounts)
      .map(([occupation, count]) => ({ occupation, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: people.length,
      familyCount: families.length,
      withBirth,
      withDeath,
      withPlace,
      withSources,
      withMilitary,
      livingCount,
      minYear: isFinite(minYear) ? minYear : null,
      maxYear: isFinite(maxYear) ? maxYear : null,
      decadeEntries,
      surnameEntries,
      placeEntries,
      countryEntries,
      occupationEntries,
      lifespanCount: lifespans.length,
      avgLife,
      minLife,
      maxLife,
      longestLived: longestLived.slice(0, 6),
    };
  }, []);

  const maxDecadeCount = Math.max(1, ...data.decadeEntries.map((d) => d.count));
  const maxSurnameCount = Math.max(1, ...data.surnameEntries.map((s) => s.count));
  const maxPlaceCount = Math.max(1, ...data.placeEntries.map((p) => p.count));
  const maxCountryCount = Math.max(1, ...data.countryEntries.map((c) => c.count));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-5 py-6 sm:py-10 space-y-8 fade-up">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
            The archive at a glance
          </div>
          <h1 className="font-display text-xl font-semibold tracking-tight leading-tight">
            Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
            Statistics, geography, and a few patterns drawn from the {data.total} people
            recorded across {data.familyCount} families.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          {data.minYear && data.maxYear && (
            <span className="tabular-nums">
              {data.minYear}–{data.maxYear}
            </span>
          )}
        </div>
      </header>

      {/* Headline stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="People"
          value={data.total.toLocaleString()}
          icon={<Users className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Families"
          value={data.familyCount.toLocaleString()}
          icon={<Heart className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="With birth date"
          value={`${data.withBirth} / ${data.total}`}
          sub={`${Math.round((data.withBirth / data.total) * 100)}%`}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="With place"
          value={`${data.withPlace} / ${data.total}`}
          sub={`${Math.round((data.withPlace / data.total) * 100)}%`}
          icon={<MapPin className="h-3.5 w-3.5" />}
        />
      </section>

      {/* Lifespan + Geography summary */}
      <section className="grid md:grid-cols-2 gap-6">
        <Card className="border-card-border">
          <CardContent className="p-5">
            <SectionHead
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="Lifespan"
              hint={`${data.lifespanCount} records with both birth & death`}
            />
            {data.avgLife !== null ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                  <Stat label="Average" value={`${Math.round(data.avgLife)}y`} />
                  <Stat label="Shortest" value={`${data.minLife}y`} />
                  <Stat label="Longest" value={`${data.maxLife}y`} />
                </div>
                {data.longestLived.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                      Most years lived
                    </div>
                    <ul className="space-y-1.5">
                      {data.longestLived.map(({ p, years }) => (
                        <li key={p.id}>
                          <Link
                            href={`/person/${encodeURIComponent(p.id)}`}
                            className="flex items-center gap-2.5 rounded-md p-1.5 -mx-1.5 hover-elevate active-elevate-2"
                            data-testid={`insight-longest-${p.id}`}
                          >
                            <PersonAvatar person={p} size="sm" />
                            <span className="flex-1 min-w-0 text-sm truncate">
                              {fullDisplayName(p)}
                            </span>
                            <span className="font-mono text-xs tabular-nums text-muted-foreground">
                              {years}y
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No complete lifespan records yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardContent className="p-5">
            <SectionHead
              icon={<Globe className="h-4 w-4 text-primary" />}
              title="Countries of origin"
              hint="By any event place"
            />
            {data.countryEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No countries inferred.</p>
            ) : (
              <ul className="space-y-2">
                {data.countryEntries.slice(0, 6).map(({ country, count }) => (
                  <li key={country}>
                    <Link
                      href={`/people?country=${encodeURIComponent(country)}`}
                      className="block rounded-md p-1.5 -mx-1.5 hover-elevate active-elevate-2"
                      data-testid={`insight-country-${country}`}
                    >
                      <div className="flex items-center gap-2.5 mb-1">
                        <CountryFlag country={country} className="h-4 w-5 shrink-0" />
                        <span className="flex-1 min-w-0 text-sm truncate">{country}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {count}
                        </span>
                      </div>
                      <Bar value={count} max={maxCountryCount} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Births by decade */}
      <section>
        <Card className="border-card-border">
          <CardContent className="p-5">
            <SectionHead
              icon={<Calendar className="h-4 w-4 text-primary" />}
              title="Births by decade"
              hint={`${data.withBirth} known births across ${data.decadeEntries.length} decades`}
            />
            {data.decadeEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No birth dates recorded.</p>
            ) : (
              <DecadeChart entries={data.decadeEntries} max={maxDecadeCount} />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Surnames + Places */}
      <section className="grid md:grid-cols-2 gap-6">
        <Card className="border-card-border">
          <CardContent className="p-5">
            <SectionHead
              icon={<Users className="h-4 w-4 text-primary" />}
              title="Top surnames"
              hint={`${data.surnameEntries.length} unique`}
            />
            <ul className="space-y-1.5">
              {data.surnameEntries.slice(0, 12).map(({ surname, count }) => (
                <li key={surname}>
                  <Link
                    href={`/people?surname=${encodeURIComponent(surname)}`}
                    className="block rounded-md p-1.5 -mx-1.5 hover-elevate active-elevate-2"
                    data-testid={`insight-surname-${surname}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex-1 min-w-0 text-sm font-medium truncate">
                        {surname}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </div>
                    <Bar value={count} max={maxSurnameCount} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardContent className="p-5">
            <SectionHead
              icon={<MapPin className="h-4 w-4 text-primary" />}
              title="Most-referenced places"
              hint={`${data.placeEntries.length} unique`}
            />
            <ul className="space-y-1.5">
              {data.placeEntries.slice(0, 12).map(({ place, count }) => (
                <li key={place}>
                  <div className="block rounded-md p-1.5 -mx-1.5" data-testid={`insight-place-${place}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex-1 min-w-0 text-sm truncate">{place}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </div>
                    <Bar value={count} max={maxPlaceCount} />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Coverage + Occupations */}
      <section className="grid md:grid-cols-2 gap-6">
        <Card className="border-card-border">
          <CardContent className="p-5">
            <SectionHead
              icon={<BarChart3 className="h-4 w-4 text-primary" />}
              title="Data coverage"
              hint="What we know"
            />
            <div className="space-y-3">
              <CoverageBar label="Birth date" count={data.withBirth} total={data.total} />
              <CoverageBar label="Death date" count={data.withDeath} total={data.total} />
              <CoverageBar label="Any place" count={data.withPlace} total={data.total} />
              <CoverageBar label="Cited sources" count={data.withSources} total={data.total} />
              <CoverageBar label="Military service" count={data.withMilitary} total={data.total} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardContent className="p-5">
            <SectionHead
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="Occupations"
              hint={`${data.occupationEntries.length} recorded`}
            />
            {data.occupationEntries.length === 0 ? (
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="italic">No occupations recorded yet.</p>
                <p className="text-xs">
                  Unlock edit mode on any person and use the new{" "}
                  <span className="font-medium">Occupations</span> editor to start populating them.
                </p>
                <Link
                  href="/gaps"
                  className="inline-flex items-center min-h-10 gap-1 text-xs font-medium text-primary hover:underline"
                >
                  See gap list <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {data.occupationEntries.slice(0, 10).map(({ occupation, count }) => (
                  <li key={occupation} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-sm truncate">{occupation}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function StatTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-card-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          {icon}
          {label}
        </div>
        <div className="font-display text-xl font-semibold tabular-nums leading-none">
          {value}
        </div>
        {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function SectionHead({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-4">
      <h2 className="font-display text-base font-semibold flex items-center gap-2 shrink-0">
        {icon}
        {title}
      </h2>
      {hint && (
        <span className="min-w-0 text-right text-[10px] uppercase tracking-[0.16em] text-muted-foreground truncate">
          {hint}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-card-border bg-muted/30 p-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
        {label}
      </div>
      <div className="font-display text-lg font-semibold tabular-nums leading-none">
        {value}
      </div>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full bg-primary/70 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CoverageBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 min-w-0 text-xs mb-1">
        <span className="text-foreground/80 min-w-0 truncate">{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground shrink-0">
          {count} <span className="opacity-60">/ {total}</span>{" "}
          <span className="ml-1 opacity-80">{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded-full transition-all"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function DecadeChart({
  entries,
  max,
}: {
  entries: Array<{ decade: number; count: number }>;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-end gap-1 h-32 sm:h-40">
        {entries.map(({ decade, count }) => {
          const pct = Math.max(4, (count / max) * 100);
          return (
            <div
              key={decade}
              className="group relative flex-1 flex flex-col items-center justify-end min-w-0"
            >
              <div
                className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
                style={{ height: `${pct}%` }}
                title={`${decade}s — ${count} births`}
                aria-label={`${decade}s — ${count} births`}
                data-testid={`decade-bar-${decade}`}
              />
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border border-border rounded px-1.5 py-0.5 text-[10px] font-mono whitespace-nowrap pointer-events-none">
                {decade}s · {count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground mt-2 px-0.5">
        {entries.length > 0 && (
          <>
            <span>{entries[0].decade}s</span>
            {entries.length > 2 && (
              <span>{entries[Math.floor(entries.length / 2)].decade}s</span>
            )}
            <span>{entries[entries.length - 1].decade}s</span>
          </>
        )}
      </div>
    </div>
  );
}
