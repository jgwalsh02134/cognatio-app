// Geographic helpers for the map: turn the archive's place strings into
// coordinates (from the baked place_coords.json — no runtime geocoding) and
// aggregate places + cross-country immigration journeys for plotting.

import coordsRaw from "@/place_coords.json";
import { people, parseYear, fullDisplayName, type Person } from "@/lib/family";

export type LatLng = [number, number];

const COORDS = coordsRaw as unknown as Record<string, LatLng>;

// Coarse centroids used only when a specific place isn't in the geocoded table.
const COUNTRY_CENTROIDS: Record<string, LatLng> = {
  ireland: [53.41, -8.24],
  germany: [51.16, 10.45],
  england: [52.35, -1.17],
  scotland: [56.49, -4.2],
  wales: [52.13, -3.78],
  canada: [56.13, -106.35],
  france: [46.23, 2.21],
  italy: [41.87, 12.57],
  "united states": [39.83, -98.58],
  usa: [39.83, -98.58],
  "new york": [42.9, -75.5],
  iowa: [42.0, -93.5],
  vermont: [44.0, -72.7],
  massachusetts: [42.3, -71.8],
};

const US_STATES = new Set([
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire",
  "new jersey","new mexico","new york","north carolina","north dakota","ohio",
  "oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota",
  "tennessee","texas","utah","vermont","virginia","washington","west virginia",
  "wisconsin","wyoming","district of columbia",
]);
const US_MARKERS = new Set(["usa", "u.s.a.", "u.s.", "us", "united states", "united states of america", "america", "mass.", "ny"]);

/** Coordinates for a place string, or null. Exact match first, then a coarse
 *  country/state centroid fallback. */
export function coordsForPlace(place?: string | null): LatLng | null {
  if (!place) return null;
  const key = place.trim();
  if (COORDS[key]) return COORDS[key];
  const parts = key.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  for (const t of [...parts].reverse()) {
    if (COUNTRY_CENTROIDS[t]) return COUNTRY_CENTROIDS[t];
  }
  return null;
}

/** Best-effort country for a place string. */
export function placeCountry(place: string): string {
  const parts = place.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  for (const t of parts) {
    if (US_STATES.has(t) || US_MARKERS.has(t)) return "United States";
  }
  const last = parts[parts.length - 1] ?? "";
  if (last === "ireland") return "Ireland";
  if (last === "germany") return "Germany";
  if (last === "england") return "England";
  if (last === "scotland") return "Scotland";
  if (last === "wales") return "Wales";
  if (last === "canada") return "Canada";
  if (last === "france") return "France";
  if (last === "italy") return "Italy";
  // Title-case the last token as a guess.
  return last ? last.replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}

function isUS(place: string): boolean {
  return placeCountry(place) === "United States";
}

export interface PlaceMarker {
  place: string;
  lat: number;
  lng: number;
  count: number; // people connected to this place
  country: string;
  isOrigin: boolean; // non-US (country of origin)
}

/** All mappable places with a count of connected people. */
export function buildPlaceMarkers(): PlaceMarker[] {
  const byPlace = new Map<string, Set<string>>(); // place -> person ids
  const addRef = (place: string | undefined | null, id: string) => {
    if (!place || !place.trim()) return;
    const key = place.trim();
    if (!byPlace.has(key)) byPlace.set(key, new Set());
    byPlace.get(key)!.add(id);
  };
  for (const p of people) {
    addRef(p.birth?.place, p.id);
    addRef(p.death?.place, p.id);
    addRef(p.burial?.place, p.id);
    for (const r of p.residences ?? []) addRef(r?.place, p.id);
  }
  const markers: PlaceMarker[] = [];
  for (const [place, ids] of byPlace) {
    const c = coordsForPlace(place);
    if (!c) continue;
    const country = placeCountry(place);
    markers.push({
      place,
      lat: c[0],
      lng: c[1],
      count: ids.size,
      country,
      isOrigin: country !== "United States",
    });
  }
  return markers.sort((a, b) => b.count - a.count);
}

export interface ImmigrationPath {
  from: LatLng;
  to: LatLng;
  fromPlace: string;
  toPlace: string;
  fromCountry: string;
  toCountry: string;
  count: number;
  sample: string[]; // a few person names
}

/** Settlement place for a person: their (US) death, else latest residence,
 *  else burial. */
function settlementPlace(p: Person): string | null {
  if (p.death?.place) return p.death.place;
  const res = (p.residences ?? []).filter((r) => r?.place);
  if (res.length) {
    const sorted = [...res].sort(
      (a, b) => (parseYear(a.date) ?? 0) - (parseYear(b.date) ?? 0),
    );
    return sorted[sorted.length - 1].place ?? null;
  }
  if (p.burial?.place) return p.burial.place;
  return null;
}

/**
 * Cross-country immigration journeys: birth (origin) → settlement, aggregated
 * by route, where the origin and destination are in different countries (the
 * core "came from there, settled here" story).
 */
export function buildImmigrationPaths(): ImmigrationPath[] {
  const edges = new Map<string, ImmigrationPath>();
  for (const p of people) {
    const origin = p.birth?.place;
    const dest = settlementPlace(p);
    if (!origin || !dest) continue;
    const oc = placeCountry(origin);
    const dc = placeCountry(dest);
    if (oc === dc) continue; // same country — not an immigration crossing
    const from = coordsForPlace(origin);
    const to = coordsForPlace(dest);
    if (!from || !to) continue;
    const key = `${origin}=>${dest}`;
    if (!edges.has(key)) {
      edges.set(key, {
        from,
        to,
        fromPlace: origin,
        toPlace: dest,
        fromCountry: oc,
        toCountry: dc,
        count: 0,
        sample: [],
      });
    }
    const e = edges.get(key)!;
    e.count += 1;
    if (e.sample.length < 5) e.sample.push(fullDisplayName(p));
  }
  return Array.from(edges.values()).sort((a, b) => b.count - a.count);
}
