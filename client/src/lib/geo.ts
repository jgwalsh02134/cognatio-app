// Geographic helpers for the map: turn the archive's place strings into
// coordinates (from the baked place_coords.json — no runtime geocoding) and
// aggregate places + cross-country immigration journeys for plotting.

import coordsRaw from "@/place_coords.json";
import { people, getPerson, parseYear, lifespan, fullDisplayName, type Person } from "@/lib/family";

export type LatLng = [number, number];

/** A lightweight person reference for map popups (links into profiles). */
export interface PersonRef {
  id: string;
  name: string;
  years: string;
}

function toRef(p: Person): PersonRef {
  return { id: p.id, name: fullDisplayName(p), years: lifespan(p) };
}

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

// Two-letter US state abbreviations → rough state centroid. Bare codes like
// "PA" geocode to Panama / "OR" to nowhere useful, so we resolve them here
// instead of trusting the place_coords table for these ambiguous tokens.
const US_STATE_ABBR: Record<string, LatLng> = {
  al: [32.8, -86.8], ak: [64.0, -152.0], az: [34.3, -111.7], ar: [34.8, -92.4],
  ca: [37.2, -119.3], co: [39.0, -105.5], ct: [41.6, -72.7], de: [39.0, -75.5],
  fl: [28.6, -82.4], ga: [32.6, -83.4], hi: [20.3, -156.4], id: [44.4, -114.6],
  il: [40.0, -89.2], in: [39.9, -86.3], ia: [42.0, -93.5], ks: [38.5, -98.4],
  ky: [37.5, -85.3], la: [31.0, -92.0], me: [45.4, -69.2], md: [39.0, -76.8],
  ma: [42.3, -71.8], mi: [44.3, -85.4], mn: [46.3, -94.3], ms: [32.7, -89.7],
  mo: [38.4, -92.5], mt: [47.0, -109.6], ne: [41.5, -99.8], nv: [39.3, -116.6],
  nh: [43.7, -71.6], nj: [40.2, -74.7], nm: [34.4, -106.1], ny: [42.9, -75.5],
  nc: [35.5, -79.4], nd: [47.4, -100.5], oh: [40.3, -82.8], ok: [35.6, -97.5],
  or: [43.9, -120.6], pa: [40.9, -77.6], ri: [41.7, -71.6], sc: [33.9, -80.9],
  sd: [44.4, -100.2], tn: [35.9, -86.4], tx: [31.5, -99.3], ut: [39.3, -111.7],
  vt: [44.0, -72.7], va: [37.5, -78.9], wa: [47.4, -120.5], wv: [38.6, -80.6],
  wi: [44.6, -89.9], wy: [43.0, -107.5], dc: [38.9, -77.0],
};

/** Coordinates for a place string, or null. Exact match first, then a coarse
 *  country/state centroid fallback. */
export function coordsForPlace(place?: string | null): LatLng | null {
  if (!place) return null;
  const key = place.trim();
  // A bare two-letter state code ("PA", "NY") — resolve to the state centroid
  // before the geocoded table, which mis-maps e.g. "PA" → Panama.
  const abbr = US_STATE_ABBR[key.toLowerCase()];
  if (abbr && key.length <= 2) return abbr;
  if (COORDS[key]) return COORDS[key];
  const parts = key.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  for (const t of [...parts].reverse()) {
    if (COUNTRY_CENTROIDS[t]) return COUNTRY_CENTROIDS[t];
  }
  return null;
}

// Recognized foreign countries (token → display name).
const FOREIGN_COUNTRIES: Record<string, string> = {
  ireland: "Ireland", germany: "Germany", england: "England", scotland: "Scotland",
  wales: "Wales", canada: "Canada", france: "France", italy: "Italy",
  denmark: "Denmark", netherlands: "Netherlands", holland: "Netherlands",
  sweden: "Sweden", norway: "Norway", austria: "Austria", switzerland: "Switzerland",
  belgium: "Belgium", poland: "Poland", spain: "Spain", "northern ireland": "Northern Ireland",
};

// Sub-national regions that imply a country even when the country is omitted.
const REGION_TO_COUNTRY: Record<string, string> = {
  "nova scotia": "Canada", "new brunswick": "Canada", ontario: "Canada",
  quebec: "Canada", "british columbia": "Canada", manitoba: "Canada",
  saskatchewan: "Canada", alberta: "Canada", newfoundland: "Canada",
  bayern: "Germany", bavaria: "Germany", wurtemburg: "Germany",
  wurttemberg: "Germany", "württemberg": "Germany", prussia: "Germany",
  preussen: "Germany", hessen: "Germany", hesse: "Germany", saxony: "Germany",
  sachsen: "Germany", rhineland: "Germany", baden: "Germany",
};

/** Best-effort country for a place string; "Unknown" when it can't be classified. */
export function placeCountry(place: string): string {
  const low = place.toLowerCase();
  const parts = low.split(",").map((s) => s.trim()).filter(Boolean);
  const noDots = low.replace(/\./g, "");
  // 1. Exact comma-delimited tokens that name a US state / marker / code.
  for (const t of parts) {
    if (US_STATES.has(t) || US_MARKERS.has(t) || US_STATE_ABBR[t]) {
      return "United States";
    }
  }
  // 2. A full state name appearing anywhere ("Albany New York").
  for (const st of US_STATES) {
    if (new RegExp(`\\b${st}\\b`).test(low)) return "United States";
  }
  // 3. Recognized foreign country / sub-national region (BEFORE the loose
  //    2-letter scan, so e.g. "Co. Cork, Ireland" isn't read as Colorado).
  for (const t of parts) {
    if (REGION_TO_COUNTRY[t]) return REGION_TO_COUNTRY[t];
  }
  for (const t of [...parts].reverse()) {
    if (FOREIGN_COUNTRIES[t]) return FOREIGN_COUNTRIES[t];
  }
  // 4. Last resort: an undelimited US code as a whole word ("Utica Ny", "N.Y.").
  for (const ab of Object.keys(US_STATE_ABBR)) {
    if (new RegExp(`\\b${ab}\\b`).test(noDots)) return "United States";
  }
  return "Unknown";
}

function isUS(place: string): boolean {
  return placeCountry(place) === "United States";
}

const US_ABBR_TO_NAME: Record<string, string> = {
  al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California",
  co: "Colorado", ct: "Connecticut", de: "Delaware", fl: "Florida", ga: "Georgia",
  hi: "Hawaii", id: "Idaho", il: "Illinois", in: "Indiana", ia: "Iowa",
  ks: "Kansas", ky: "Kentucky", la: "Louisiana", me: "Maine", md: "Maryland",
  ma: "Massachusetts", mi: "Michigan", mn: "Minnesota", ms: "Mississippi",
  mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada", nh: "New Hampshire",
  nj: "New Jersey", nm: "New Mexico", ny: "New York", nc: "North Carolina",
  nd: "North Dakota", oh: "Ohio", ok: "Oklahoma", or: "Oregon", pa: "Pennsylvania",
  ri: "Rhode Island", sc: "South Carolina", sd: "South Dakota", tn: "Tennessee",
  tx: "Texas", ut: "Utah", vt: "Vermont", va: "Virginia", wa: "Washington",
  wv: "West Virginia", wi: "Wisconsin", wy: "Wyoming", dc: "District of Columbia",
};

function titleCaseWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const UNSPECIFIED_REGION = "Other / unspecified";

/**
 * Best-effort region for grouping a place under its country: the US state, or
 * the administrative area just below the country for foreign places. Falls back
 * to UNSPECIFIED_REGION when the string is too coarse (e.g. bare "Ireland").
 */
export function placeRegion(place: string): string {
  const country = placeCountry(place);
  const parts = place.split(",").map((s) => s.trim()).filter(Boolean);
  if (country === "United States") {
    for (const p of parts) {
      const l = p.toLowerCase();
      if (US_STATES.has(l)) return titleCaseWords(l);
      if (US_STATE_ABBR[l]) return US_ABBR_TO_NAME[l] ?? p.toUpperCase();
    }
    const low = place.toLowerCase();
    for (const st of US_STATES) {
      if (new RegExp(`\\b${st}\\b`).test(low)) return titleCaseWords(st);
    }
    return UNSPECIFIED_REGION;
  }
  if (parts.length >= 2) {
    const before = parts[parts.length - 2];
    if (before && !/^\d+$/.test(before) && before.toLowerCase() !== country.toLowerCase()) {
      return titleCaseWords(before);
    }
  }
  return UNSPECIFIED_REGION;
}

export interface PlaceMarker {
  place: string;
  lat: number;
  lng: number;
  count: number; // people connected to this place
  country: string;
  isOrigin: boolean; // non-US (country of origin)
  people: PersonRef[]; // the actual individuals, for profile links
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
    const refs = [...ids]
      .map((id) => getPerson(id))
      .filter((p): p is Person => !!p)
      .map(toRef)
      .sort((a, b) => a.name.localeCompare(b.name));
    markers.push({
      place,
      lat: c[0],
      lng: c[1],
      count: ids.size,
      country,
      isOrigin: country !== "United States",
      people: refs,
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
  sample: PersonRef[]; // a few of the people who made this journey
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
    if (e.sample.length < 8) e.sample.push(toRef(p));
  }
  return Array.from(edges.values()).sort((a, b) => b.count - a.count);
}
