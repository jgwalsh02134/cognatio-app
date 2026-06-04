import dataJson from "../data.json";

export interface EventInfo {
  date: string | null;
  place: string | null;
  note: string | null;
}

export interface MilitaryService {
  branch: "army" | "navy" | "air_force" | "marine_corps" | "coast_guard" | "space_force" | "other";
  country: string;
  conflict: string | null;
  rank: string | null;
  rank_code?: string | null;
  unit: string | null;
  service_number?: string | null;
  dates: string | null;
  kia?: boolean;
  awards?: string[];
  notes?: string | null;
  evidence?: string[];
}

/** Categories for an external link attached to a person profile. */
export type PersonLinkKind =
  | "obituary"
  | "press"
  | "wedding"
  | "accomplishment"
  | "biography"
  | "photo"
  | "record"
  | "social"
  | "other";

/** A curated external link on a person's profile (obituary, press, wedding
 *  announcement, accomplishment, biography, etc.). Distinct from `sources`,
 *  which are dry evidentiary citations. */
export interface PersonLink {
  kind: PersonLinkKind;
  title: string;
  url: string;
  date?: string | null;
  note?: string | null;
}

/** A DNA test kit reference (e.g. a GEDmatch number) so relatives can match. */
export interface GeneticKitRef {
  service: string;
  ref: string;
}

/** Heritable / DNA information preserved for future generations. This is
 *  sensitive data — only edited behind the family passphrase. */
export interface GeneticInfo {
  tested?: boolean;
  /** Testing companies, e.g. ["AncestryDNA", "23andMe"]. */
  companies?: string[];
  yDnaHaplogroup?: string | null;
  mtDnaHaplogroup?: string | null;
  /** Free-text ethnicity / admixture summary. */
  ethnicity?: string | null;
  bloodType?: string | null;
  /** Notable inherited physical traits (eye color, height, etc.). */
  traits?: string | null;
  /** Hereditary health notes — handle with care. */
  health?: string | null;
  /** Shareable match references (GEDmatch kit #, FTDNA kit, etc.). */
  kitRefs?: GeneticKitRef[];
  notes?: string | null;
}

export interface Person {
  id: string;
  name: string;
  given: string;
  surname: string;
  suffix: string;
  sex: string | null;
  birth: EventInfo | null;
  death: EventInfo | null;
  burial: EventInfo | null;
  residences: EventInfo[];
  occupations: string[];
  educations: EventInfo[];
  notes: string[];
  parent_ids: string[];
  spouse_ids: string[];
  child_ids: string[];
  family_child_ids: string[];
  family_spouse_ids: string[];
  source_count: number;
  military?: MilitaryService;
  affiliations?: Affiliation[];
  links?: PersonLink[];
  /** Square data-URI portrait (uploaded + cropped) used as the avatar. */
  photo?: string | null;
  genetics?: GeneticInfo | null;
}

export interface Affiliation {
  key: string; // "harvard" | "southern_pacific" | ...
  name: string; // "Harvard University"
  role?: string | null; // "Alumnus" or "Vice President, Finance"
  dates?: string | null;
  note?: string | null;
}

export interface Family {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  children_ids: string[];
  marriage: EventInfo | null;
  divorce: EventInfo | null;
}

export interface TreeData {
  individuals: Person[];
  families: Family[];
  stats: {
    total_individuals: number;
    total_families: number;
    top_surnames: { surname: string; count: number }[];
  };
}

declare global {
  interface Window {
    /** Saved edit overlay (personId -> partial patch), hydrated in main.tsx
     *  from GET /api/archive before this module evaluates. */
    __ARCHIVE_PATCHES__?: Record<string, Partial<Person>>;
  }
}

/**
 * Merge any server-saved edit overlay over the baked dataset. The overlay is
 * fetched in main.tsx (Postgres-backed, Railway only) before the app mounts;
 * on static hosts there is none and the baked data is used unchanged.
 */
function applyOverlay(base: TreeData): TreeData {
  const patches =
    typeof window !== "undefined" ? window.__ARCHIVE_PATCHES__ : undefined;
  if (!patches || Object.keys(patches).length === 0) return base;
  return {
    ...base,
    individuals: base.individuals.map((p) =>
      patches[p.id] ? ({ ...p, ...patches[p.id] } as Person) : p,
    ),
  };
}

const data = applyOverlay(dataJson as TreeData);

export const people: Person[] = data.individuals;
export const families: Family[] = data.families;
export const stats = data.stats;

export const peopleById: Record<string, Person> = {};
people.forEach((p) => (peopleById[p.id] = p));
export const familiesById: Record<string, Family> = {};
families.forEach((f) => (familiesById[f.id] = f));

export function getPerson(id: string | null | undefined): Person | undefined {
  if (!id) return undefined;
  return peopleById[id];
}

export function parseYear(date?: string | null): number | null {
  if (!date) return null;
  const m = date.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

export function lifespan(p: Person): string {
  const b = parseYear(p.birth?.date);
  const d = parseYear(p.death?.date);
  if (b && d) return `${b} – ${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return "—";
}

export function isLiving(p: Person): boolean {
  if (p.death?.date) return false;
  const by = parseYear(p.birth?.date);
  if (!by) return false;
  // If born more than ~110 years ago and no death date, treat as not living
  const currentYear = new Date().getFullYear();
  return currentYear - by < 110;
}

export function age(p: Person): number | null {
  const b = parseYear(p.birth?.date);
  const d = parseYear(p.death?.date);
  if (!b) return null;
  if (d) return d - b;
  if (isLiving(p)) return new Date().getFullYear() - b;
  return null;
}

export function fullDisplayName(p: Person): string {
  const given = (p.given || "").trim();
  const surname = (p.surname || "").trim();
  const suffix = (p.suffix || "").trim();

  // When given is missing but surname is known, render an honorific
  // ("Mr./Mrs./Mx. Surname") so anonymous spouses and parents read as
  // intentional placeholders rather than data errors.
  if (!given && surname) {
    const honorific =
      p.sex === "M" ? "Mr." : p.sex === "F" ? "Mrs." : "Mx.";
    const parts = [honorific, surname];
    if (suffix) parts.push(suffix);
    return parts.join(" ").trim();
  }

  const parts: string[] = [];
  if (given) parts.push(given);
  if (surname) parts.push(surname);
  if (suffix) parts.push(suffix);
  return parts.join(" ").trim() || p.name || "Unknown";
}

export function initials(p: Person): string {
  const g = p.given.trim().split(/\s+/)[0]?.[0] || "";
  const s = p.surname.trim().split(/\s+/)[0]?.[0] || "";
  return (g + s).toUpperCase() || "?";
}

/**
 * Treat a person as an "anchorless placeholder" when they exist purely as a
 * structural slot (e.g. "Unknown" mother of a known child) and carry no
 * identifying detail of their own. Without at least one anchor — a real
 * given/surname, a date, a place, an occupation, a residence, or a military
 * record — there is literally nothing an external researcher (human or AI)
 * could use to identify them. We use this to gate AI research so we never
 * fire off a useless "find facts about a person named Unknown" request.
 */
export function isAnchorlessPlaceholder(p: Person): boolean {
  const given = (p.given || "").trim().toLowerCase();
  const surname = (p.surname || "").trim();
  const hasRealGiven = given !== "" && given !== "unknown" && given !== "?";
  const hasRealSurname = surname !== "" && surname.toLowerCase() !== "unknown";
  if (hasRealGiven || hasRealSurname) return false;
  if (p.birth?.date || p.birth?.place) return false;
  if (p.death?.date || p.death?.place) return false;
  if (p.burial?.date || p.burial?.place) return false;
  if ((p.residences?.length ?? 0) > 0) return false;
  if ((p.occupations?.filter(Boolean).length ?? 0) > 0) return false;
  if ((p.educations?.filter(Boolean).length ?? 0) > 0) return false;
  if (p.military) return false;
  return true;
}

/** Returns ancestors up to `depth` generations as a list of generation arrays. */
export function ancestorsByGeneration(rootId: string, depth = 4): Person[][] {
  const out: Person[][] = [];
  let frontier: string[] = [rootId];
  for (let g = 0; g <= depth; g++) {
    const persons = frontier
      .map((id) => peopleById[id])
      .filter((p): p is Person => Boolean(p));
    if (persons.length === 0) break;
    out.push(persons);
    const next: string[] = [];
    for (const id of frontier) {
      const p = peopleById[id];
      if (!p) continue;
      for (const pid of p.parent_ids) next.push(pid);
    }
    frontier = next;
  }
  return out;
}

/** Returns descendants up to `depth` generations as a list of generation arrays. */
export function descendantsByGeneration(rootId: string, depth = 4): Person[][] {
  const out: Person[][] = [];
  let frontier: string[] = [rootId];
  for (let g = 0; g <= depth; g++) {
    const persons = frontier
      .map((id) => peopleById[id])
      .filter((p): p is Person => Boolean(p));
    if (persons.length === 0) break;
    out.push(persons);
    const next: string[] = [];
    for (const id of frontier) {
      const p = peopleById[id];
      if (!p) continue;
      for (const cid of p.child_ids) next.push(cid);
    }
    frontier = Array.from(new Set(next));
  }
  return out;
}

export function getSiblings(p: Person): Person[] {
  const ids = new Set<string>();
  for (const fid of p.family_child_ids) {
    const f = familiesById[fid];
    if (!f) continue;
    for (const c of f.children_ids) {
      if (c !== p.id) ids.add(c);
    }
  }
  return Array.from(ids)
    .map((id) => peopleById[id])
    .filter((x): x is Person => Boolean(x))
    .sort((a, b) => (parseYear(a.birth?.date) ?? 0) - (parseYear(b.birth?.date) ?? 0));
}

/** Build pedigree map: position by generation. Returns nested ancestor tree. */
export interface PedigreeNode {
  person: Person | null;
  father: PedigreeNode | null;
  mother: PedigreeNode | null;
}

export function buildPedigree(rootId: string, depth = 4): PedigreeNode {
  function build(id: string | null | undefined, d: number): PedigreeNode {
    const p = id ? peopleById[id] : null;
    if (!p || d <= 0) return { person: p ?? null, father: null, mother: null };
    // Find first family-of-child to pick parents
    let father: Person | null = null;
    let mother: Person | null = null;
    for (const fid of p.family_child_ids) {
      const f = familiesById[fid];
      if (!f) continue;
      const h = f.husband_id ? peopleById[f.husband_id] : null;
      const w = f.wife_id ? peopleById[f.wife_id] : null;
      father = father ?? h ?? null;
      mother = mother ?? w ?? null;
    }
    // If gendered but missing one role, fall back to first parents by sex
    if (!father || !mother) {
      for (const pid of p.parent_ids) {
        const par = peopleById[pid];
        if (!par) continue;
        if (par.sex === "M" && !father) father = par;
        else if (par.sex === "F" && !mother) mother = par;
        else if (!father) father = par;
        else if (!mother) mother = par;
      }
    }
    return {
      person: p,
      father: build(father?.id, d - 1),
      mother: build(mother?.id, d - 1),
    };
  }
  return build(rootId, depth);
}

export function searchPeople(query: string, limit = 50): Person[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: { person: Person; score: number }[] = [];
  for (const p of people) {
    const name = p.name.toLowerCase();
    const given = p.given.toLowerCase();
    const surname = p.surname.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (surname === q) score = 90;
    else if (given === q) score = 85;
    else if (name.startsWith(q)) score = 80;
    else if (surname.startsWith(q)) score = 70;
    else if (given.startsWith(q)) score = 60;
    else if (name.includes(q)) score = 40;
    else if (surname.includes(q) || given.includes(q)) score = 30;
    if (score > 0) results.push({ person: p, score });
  }
  results.sort((a, b) => b.score - a.score || a.person.surname.localeCompare(b.person.surname));
  return results.slice(0, limit).map((r) => r.person);
}

export function bySurname(): Record<string, Person[]> {
  const groups: Record<string, Person[]> = {};
  for (const p of people) {
    const s = p.surname || "(Unknown)";
    (groups[s] ||= []).push(p);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Country normalization
// ---------------------------------------------------------------------------

const US_STATES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
  "maine", "maryland", "massachusetts", "mass", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
  "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "rhode island", "south carolina", "south dakota", "tennessee", "texas",
  "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin",
  "wyoming", "dc", "district of columbia",
]);

const US_STATE_ABBR = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
  "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
  "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok",
  "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy",
]);

// ISO 3166-1 alpha-2 country codes (and GB-ENG / GB-SCT ISO 3166-2 subdivisions).
const COUNTRY_CODES: Record<string, string> = {
  "United States": "US",
  "Ireland": "IE",
  "Canada": "CA",
  "Germany": "DE",
  "England": "GB-ENG",
  "Scotland": "GB-SCT",
  "Denmark": "DK",
};

/** Returns the ISO 3166-1 alpha-2 code (e.g. "US", "IE") for a country name, or "" if unknown. */
export function countryCode(country: string): string {
  return COUNTRY_CODES[country] || "";
}

/** @deprecated kept for backward compatibility — returns ISO code, not emoji flag. */
export function countryFlag(country: string): string {
  return countryCode(country);
}

/** Normalize a place string into a canonical country name. Returns null if unknown. */
export function placeToCountry(place: string | null | undefined): string | null {
  if (!place) return null;
  const lower = place.toLowerCase().trim();
  if (!lower) return null;

  if (lower.includes("ireland")) return "Ireland";
  if (lower.includes("germany") || lower.includes("bayern") || lower.includes("bavaria") || lower.includes("baden") || lower.includes("hess,") || lower.endsWith(", hess")) return "Germany";
  if (lower.includes("canada")) return "Canada";
  if (lower.includes("scotland")) return "Scotland";
  if (lower.includes("england") || lower === "london, london, england") return "England";
  if (lower.includes("denmark")) return "Denmark";
  if (
    lower.includes("united states") ||
    lower.includes("u.s.a.") ||
    /\busa\b/.test(lower) ||
    /,\s*us$/.test(lower) ||
    /,\s*u\.s\.$/.test(lower)
  )
    return "United States";

  // Token-based fallback: check tokens against US states and abbreviations.
  const tokens = lower.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    if (US_STATES.has(tok)) return "United States";
    if (US_STATE_ABBR.has(tok.replace(/\./g, ""))) return "United States";
    // "Albany NY", "UTICA NY", etc. — last word
    const last = tok.split(/\s+/).pop() || "";
    if (US_STATE_ABBR.has(last.replace(/\./g, ""))) return "United States";
  }

  return null;
}

/** Best-effort country for a person — birth, then residence, then death/burial. */
export function personCountry(p: Person): string | null {
  const candidates: (string | null | undefined)[] = [
    p.birth?.place,
    ...p.residences.map((r) => r.place),
    p.death?.place,
    p.burial?.place,
  ];
  for (const c of candidates) {
    const ctry = placeToCountry(c);
    if (ctry) return ctry;
  }
  return null;
}

export function byCountry(): Record<string, Person[]> {
  const groups: Record<string, Person[]> = {};
  for (const p of people) {
    const c = personCountry(p) || "Unknown";
    (groups[c] ||= []).push(p);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Fill-in-the-blanks (gap detection)
// ---------------------------------------------------------------------------

export type GapType =
  | "birth_date"
  | "birth_place"
  | "death_date"
  | "death_place"
  | "surname"
  | "parents"
  | "sex"
  | "marriage"
  | "sources"
  | "census";

export interface PersonGaps {
  person: Person;
  gaps: GapType[];
}

export const GAP_LABELS: Record<GapType, string> = {
  birth_date: "Birth date",
  birth_place: "Birth place",
  death_date: "Death date",
  death_place: "Death place",
  surname: "Surname",
  parents: "Parents",
  sex: "Sex",
  marriage: "Marriage",
  sources: "No sources",
  census: "Census",
};

/**
 * Light-touch given-name → sex guesser used as a research hint when `sex` is
 * unrecorded. Conservative: only common, high-confidence first names. Returns
 * null when the name is ambiguous, foreign, or unrecognized so we never auto-
 * guess wrong. The intent is a UI prompt, not silent data mutation.
 */
const MALE_NAMES = new Set([
  "john","james","william","robert","michael","david","richard","charles","thomas","joseph",
  "daniel","matthew","anthony","edward","george","henry","frederick","arthur","albert",
  "walter","harry","frank","ernest","samuel","peter","paul","andrew","patrick","timothy",
  "christopher","stephen","steven","kevin","brian","mark","gerald","raymond","donald",
  "jack","jacob","benjamin","alexander","nicholas","jonathan","sean","ryan","gregory",
  "martin","francis","louis","howard","theodore","oscar","clarence","leonard","alfred",
  "hugh","victor","jeremy","vincent","keith","larry","barry","earl","glenn","roy",
  "ronald","russell","wayne","bruce","eric","douglas","philip","phillip","dennis","adam",
  "otto","fritz","hans","karl","kaspar","caspar","heinrich","wilhelm","johann","michel","paulus",
]);
const FEMALE_NAMES = new Set([
  "mary","elizabeth","sarah","margaret","anna","anne","ann","helen","patricia","jennifer",
  "linda","barbara","susan","jessica","maria","karen","nancy","lisa","betty","dorothy",
  "sandra","ashley","emily","michelle","amanda","melissa","rebecca","laura","catherine",
  "katherine","kathleen","deborah","debra","debora","dorothy","ruth","alice","edith",
  "ella","emma","florence","grace","hazel","helen","ida","irene","julia","lillian",
  "lillie","lottie","mabel","mildred","olive","pearl","rose","thelma","violet","hannah",
  "bertha","ethel","mary","clara","mae","elsie","agnes","jane","alison","sharon",
  "caroline","charlotte","diana","diane","ellen","erin","frances","grace","hilda",
  "katie","kate","laura","louise","marie","martha","meredith","molly","nora","norah",
  "phoebe","rachel","rebecca","sara","shirley","stephanie","tracy","theresa","teresa",
]);

export function guessSexFromGiven(
  given: string | null | undefined,
): "M" | "F" | null {
  if (!given) return null;
  const first = given.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  if (MALE_NAMES.has(first)) return "M";
  if (FEMALE_NAMES.has(first)) return "F";
  return null;
}

function hasMarriageRecord(p: Person): boolean {
  for (const fid of p.family_spouse_ids) {
    const fam = familiesById[fid];
    if (fam?.marriage?.date || fam?.marriage?.place) return true;
  }
  return false;
}

export function getGaps(p: Person): GapType[] {
  const gaps: GapType[] = [];
  if (!p.birth?.date) gaps.push("birth_date");
  if (!p.birth?.place) gaps.push("birth_place");
  if (!p.surname) gaps.push("surname");
  if (!p.sex) gaps.push("sex");
  if (p.parent_ids.length === 0 && p.family_child_ids.length === 0) {
    gaps.push("parents");
  }
  // Only flag death info when likely deceased (not a young/living person)
  const by = parseYear(p.birth?.date);
  const probablyDeceased: boolean =
    !!p.death?.date ||
    !!p.burial?.date ||
    (by !== null && new Date().getFullYear() - by >= 100);
  if (probablyDeceased) {
    if (!p.death?.date) gaps.push("death_date");
    if (!p.death?.place) gaps.push("death_place");
  }
  // Marriage gap: married, deceased, but no marriage date or place anywhere
  if (p.family_spouse_ids.length > 0 && probablyDeceased && !hasMarriageRecord(p)) {
    gaps.push("marriage");
  }
  // No sources at all (Ancestry-style citation count)
  if ((p.source_count ?? 0) === 0) {
    gaps.push("sources");
  }
  // Census gap: US-born adult between 1840 and 1950 with no residences logged
  const country = personCountry(p);
  if (
    country === "United States" &&
    by !== null &&
    by >= 1830 &&
    by <= 1950 &&
    (p.residences?.length ?? 0) === 0
  ) {
    gaps.push("census");
  }
  return gaps;
}

export function allGaps(): PersonGaps[] {
  const out: PersonGaps[] = [];
  for (const p of people) {
    const g = getGaps(p);
    if (g.length > 0) out.push({ person: p, gaps: g });
  }
  // Sort by number of gaps descending, then surname/given
  out.sort(
    (a, b) =>
      b.gaps.length - a.gaps.length ||
      a.person.surname.localeCompare(b.person.surname) ||
      a.person.given.localeCompare(b.person.given),
  );
  return out;
}


// ---------------------------------------------------------------------------
// Relationship calculation (relative to a chosen root, e.g. J. Gregory Walsh)
// ---------------------------------------------------------------------------

/**
 * Extended bidirectional family graph built once at module load. Combines
 * `parent_ids` / `child_ids` / `spouse_ids` from individuals AND derived
 * edges from `families` records. Imported GEDCOM data sometimes asserts a
 * relationship from only one direction (a child lists a parent but the
 * parent's child_ids is empty, or a marriage is captured only in the family
 * record). The flat lists on each Person are not enough — we mirror every
 * edge so BFS can reach anyone the user considers "in the tree".
 */
const extParents: Record<string, Set<string>> = {};
const extChildren: Record<string, Set<string>> = {};
const extSpouses: Record<string, Set<string>> = {};

function edgeAdd(
  map: Record<string, Set<string>>,
  a: string,
  b: string,
) {
  if (!a || !b || a === b) return;
  (map[a] = map[a] ?? new Set()).add(b);
}

for (const p of people) {
  for (const pid of p.parent_ids) {
    edgeAdd(extParents, p.id, pid);
    edgeAdd(extChildren, pid, p.id);
  }
  for (const cid of p.child_ids) {
    edgeAdd(extChildren, p.id, cid);
    edgeAdd(extParents, cid, p.id);
  }
  for (const sid of p.spouse_ids) {
    edgeAdd(extSpouses, p.id, sid);
    edgeAdd(extSpouses, sid, p.id);
  }
}
for (const f of families) {
  const parentIds = [f.husband_id, f.wife_id].filter(
    (x): x is string => Boolean(x),
  );
  for (const cid of f.children_ids) {
    for (const par of parentIds) {
      edgeAdd(extParents, cid, par);
      edgeAdd(extChildren, par, cid);
    }
  }
  if (f.husband_id && f.wife_id) {
    edgeAdd(extSpouses, f.husband_id, f.wife_id);
    edgeAdd(extSpouses, f.wife_id, f.husband_id);
  }
}

/** Map of ancestor id -> generations up from the given person (0 = self). */
function ancestorsMap(id: string): Map<string, number> {
  const map = new Map<string, number>();
  const queue: [string, number][] = [[id, 0]];
  while (queue.length) {
    const [cur, dist] = queue.shift()!;
    if (map.has(cur)) {
      // keep the smallest distance
      if ((map.get(cur) ?? Infinity) <= dist) continue;
    }
    map.set(cur, dist);
    const parents = extParents[cur];
    if (!parents) continue;
    for (const pid of Array.from(parents)) {
      if (!map.has(pid) || (map.get(pid) ?? Infinity) > dist + 1) {
        queue.push([pid, dist + 1]);
      }
    }
  }
  return map;
}

type EdgeKind = "p" | "c" | "s";

/**
 * Shortest-path BFS through the extended bidirectional graph (parents,
 * children, spouses). Returns the sequence of edge kinds taken from `fromId`
 * to `toId`, or null when the two are not in the same connected component.
 */
function bfsPath(fromId: string, toId: string): EdgeKind[] | null {
  if (fromId === toId) return [];
  const prev = new Map<string, { from: string; edge: EdgeKind }>();
  const seen = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  while (queue.length) {
    const cur = queue.shift()!;
    const neighbors: [Set<string> | undefined, EdgeKind][] = [
      [extParents[cur], "p"],
      [extChildren[cur], "c"],
      [extSpouses[cur], "s"],
    ];
    for (const [set, edge] of neighbors) {
      if (!set) continue;
      for (const nbr of Array.from(set)) {
        if (seen.has(nbr)) continue;
        seen.add(nbr);
        prev.set(nbr, { from: cur, edge });
        if (nbr === toId) {
          // Reconstruct
          const out: EdgeKind[] = [];
          let n = toId;
          while (n !== fromId) {
            const step = prev.get(n)!;
            out.push(step.edge);
            n = step.from;
          }
          out.reverse();
          return out;
        }
        queue.push(nbr);
      }
    }
  }
  return null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function removalSuffix(removed: number): string {
  if (removed === 0) return "";
  if (removed === 1) return " once removed";
  if (removed === 2) return " twice removed";
  if (removed === 3) return " thrice removed";
  return ` ${ordinal(removed)} removed`;
}

function greatsPrefix(count: number, gendered: string): string {
  // "grandfather" with 0 greats, "great-grandfather" with 1, "2× great-grandfather" with 2+
  if (count <= 0) return gendered;
  if (count === 1) return `great-${gendered}`;
  return `${count}× great-${gendered}`;
}

export interface Relationship {
  /** Short label, e.g. "3× great-grandfather", "2nd cousin once removed". */
  label: string;
  /** Generations from target up to common ancestor. */
  upTarget: number;
  /** Generations from root up to common ancestor. */
  upRoot: number;
  /** True when the relationship is by marriage (spouse only). */
  bySpouse?: boolean;
}

/**
 * Describe how `targetId` is related to `rootId`. The returned label reads
 * naturally as `"<target> is the <label> of <root>"`.
 */
export function findRelationship(
  targetId: string,
  rootId: string,
): Relationship | null {
  return findRelationshipInner(targetId, rootId, false);
}

/**
 * Build the blood-relation label given:
 *   n = generations from TARGET up to common ancestor
 *   m = generations from ROOT up to common ancestor
 * Returns the gendered label, e.g. "father", "3rd cousin once removed".
 */
function bloodRelLabel(n: number, m: number, sex: string | null): string {
  // Direct ancestor (target above root)
  if (n === 0) {
    const gendered = sex === "M" ? "father" : sex === "F" ? "mother" : "parent";
    if (m === 0) return gendered;
    if (m === 1) return gendered;
    const grand =
      sex === "M" ? "grandfather" : sex === "F" ? "grandmother" : "grandparent";
    return greatsPrefix(m - 2, grand);
  }
  // Direct descendant
  if (m === 0) {
    const gendered = sex === "M" ? "son" : sex === "F" ? "daughter" : "child";
    if (n === 1) return gendered;
    const grand =
      sex === "M" ? "grandson" : sex === "F" ? "granddaughter" : "grandchild";
    return greatsPrefix(n - 2, grand);
  }
  // Sibling
  if (n === 1 && m === 1) {
    return sex === "M" ? "brother" : sex === "F" ? "sister" : "sibling";
  }
  const minNM = Math.min(n, m);
  const removed = Math.abs(n - m);
  // Uncle/aunt/nephew/niece (min == 1)
  if (minNM === 1) {
    if (n < m) {
      const base = sex === "M" ? "uncle" : sex === "F" ? "aunt" : "uncle/aunt";
      return greatsPrefix(removed - 1, base);
    }
    const base = sex === "M" ? "nephew" : sex === "F" ? "niece" : "nephew/niece";
    return greatsPrefix(removed - 1, base);
  }
  // Cousins
  const degree = minNM - 1;
  return `${ordinal(degree)} cousin${removalSuffix(removed)}`;
}

/**
 * Convert a BFS edge sequence (from root to target) into a plain-English
 * relationship label. Handles common patterns precisely; falls back to
 * descriptive language for unusual shapes (e.g. multiple spouse hops).
 *
 * Edge meanings, walking the path from root → target:
 *   p = move to a parent of the current node
 *   c = move to a child of the current node
 *   s = move to a spouse of the current node
 */
function interpretPath(edges: EdgeKind[], sex: string | null): string | null {
  if (edges.length === 0) return "the same person";

  const sIdx = edges.indexOf("s");
  const sCount = edges.filter((e) => e === "s").length;

  // No spouse edges — pure blood. The path is always "some p's then some c's"
  // for shortest-path BFS in a tree-shaped graph; mixed up/down means there's
  // a step-relationship loop, which we treat as if it were the up-then-down
  // shape (same total count of generations).
  if (sCount === 0) {
    const ups = edges.filter((e) => e === "p").length;
    const downs = edges.filter((e) => e === "c").length;
    return bloodRelLabel(downs, ups, sex);
  }

  // Spouse edge present. Single spouse hop = clean in-law label.
  if (sCount === 1) {
    const before = edges.slice(0, sIdx); // root → intermediate (blood relative)
    const after = edges.slice(sIdx + 1); // intermediate's spouse → target
    const beforeUps = before.filter((e) => e === "p").length;
    const beforeDowns = before.filter((e) => e === "c").length;
    const intermediateLabel = bloodRelLabel(beforeDowns, beforeUps, null);

    // Spouse at end — target IS the spouse of the blood relative.
    if (after.length === 0) {
      const sp =
        sex === "F" ? "wife" : sex === "M" ? "husband" : "spouse";
      return `${intermediateLabel}'s ${sp}`;
    }

    // After the spouse hop we walk only "up" (to parents) — target is an
    // ancestor of the blood relative's spouse → a parent-/grandparent-in-law.
    if (after.every((e) => e === "p")) {
      const ups = after.length;
      if (ups === 1) {
        const role =
          sex === "M"
            ? "father-in-law"
            : sex === "F"
              ? "mother-in-law"
              : "parent-in-law";
        return `${intermediateLabel}'s ${role}`;
      }
      const grand =
        sex === "M"
          ? "grandfather-in-law"
          : sex === "F"
            ? "grandmother-in-law"
            : "grandparent-in-law";
      return `${intermediateLabel}'s ${greatsPrefix(ups - 2, grand)}`;
    }

    // Only "down" after spouse — target is a step-descendant of the blood
    // relative (their spouse's child / grandchild / …).
    if (after.every((e) => e === "c")) {
      const downs = after.length;
      if (downs === 1) {
        const role =
          sex === "M" ? "step-son" : sex === "F" ? "step-daughter" : "step-child";
        return `${intermediateLabel}'s ${role}`;
      }
      const grand =
        sex === "M"
          ? "step-grandson"
          : sex === "F"
            ? "step-granddaughter"
            : "step-grandchild";
      return `${intermediateLabel}'s ${greatsPrefix(downs - 2, grand)}`;
    }

    // Mixed up-then-down after spouse: target shares a common ancestor with
    // the blood relative's spouse — that makes them in-laws of the blood
    // relative through that side of the family.
    const afterUps = after.filter((e) => e === "p").length;
    const afterDowns = after.filter((e) => e === "c").length;
    const afterLabel = bloodRelLabel(afterDowns, afterUps, sex);
    return `${intermediateLabel}'s ${afterLabel}-in-law`;
  }

  // Two spouse hops — target's spouse and the blood relative's spouse are
  // related by blood. Honest fallback: "connected through marriage".
  // We still try to give the closest blood relative for context.
  const firstS = edges.indexOf("s");
  const blood = edges.slice(0, firstS);
  const ups = blood.filter((e) => e === "p").length;
  const downs = blood.filter((e) => e === "c").length;
  if (blood.length > 0) {
    const intermediate = bloodRelLabel(downs, ups, null);
    return `connected by marriage (via ${intermediate})`;
  }
  return "connected by marriage";
}

// ---------------------------------------------------------------------------
// Relationship CHAIN — the actual sequence of people that connect target → root
// ---------------------------------------------------------------------------

export interface ChainStep {
  /** The person at this step in the chain. */
  person: Person;
  /**
   * How this person relates to the NEXT person in the chain.
   * "parent"   = next person is this person's parent
   * "child"    = next person is this person's child
   * "spouse"   = next person is this person's spouse
   * undefined  = last step in the chain (the root)
   */
  toNext?: "parent" | "child" | "spouse";
}

/**
 * Return the shortest chain of people connecting `targetId` to `rootId`,
 * inclusive on both ends. Each step records how it links to the next.
 * Returns null when the two people are in unrelated graph components.
 */
export function relationshipChain(
  targetId: string,
  rootId: string,
): ChainStep[] | null {
  const target = peopleById[targetId];
  const root = peopleById[rootId];
  if (!target || !root) return null;
  if (targetId === rootId) {
    return [{ person: target }];
  }
  // BFS from target → root, recording predecessor + edge taken.
  const prev = new Map<string, { from: string; edge: EdgeKind }>();
  const seen = new Set<string>([targetId]);
  const queue: string[] = [targetId];
  let found = false;
  while (queue.length && !found) {
    const cur = queue.shift()!;
    const neighbors: [Set<string> | undefined, EdgeKind][] = [
      [extParents[cur], "p"],
      [extChildren[cur], "c"],
      [extSpouses[cur], "s"],
    ];
    for (const [set, edge] of neighbors) {
      if (!set) continue;
      for (const nbr of Array.from(set)) {
        if (seen.has(nbr)) continue;
        seen.add(nbr);
        prev.set(nbr, { from: cur, edge });
        if (nbr === rootId) {
          found = true;
          break;
        }
        queue.push(nbr);
      }
      if (found) break;
    }
  }
  if (!found) return null;
  // Reconstruct node path target → root.
  const ids: string[] = [rootId];
  const edges: EdgeKind[] = [];
  let n = rootId;
  while (n !== targetId) {
    const step = prev.get(n)!;
    edges.push(step.edge);
    ids.push(step.from);
    n = step.from;
  }
  ids.reverse();
  edges.reverse();
  // ids is target → root. edges[i] is the edge from ids[i] to ids[i+1].
  // Edge kind "p" means ids[i+1] is parent of ids[i]; for the chain we record
  // it on ids[i] as "parent" (i.e., "next person is my parent").
  const out: ChainStep[] = [];
  for (let i = 0; i < ids.length; i++) {
    const person = peopleById[ids[i]];
    if (!person) return null;
    if (i === ids.length - 1) {
      out.push({ person });
    } else {
      const e = edges[i];
      out.push({
        person,
        toNext: e === "p" ? "parent" : e === "c" ? "child" : "spouse",
      });
    }
  }
  return out;
}

function findRelationshipInner(
  targetId: string,
  rootId: string,
  _viaSpouse: boolean,
): Relationship | null {
  if (targetId === rootId) {
    return { label: "the same person", upTarget: 0, upRoot: 0 };
  }

  const target = peopleById[targetId];
  const root = peopleById[rootId];
  if (!target || !root) return null;
  const sex = target.sex;

  // Spouse shortcut — cheapest case.
  if (
    target.spouse_ids.includes(rootId) ||
    root.spouse_ids.includes(targetId)
  ) {
    const label = sex === "F" ? "wife" : sex === "M" ? "husband" : "spouse";
    return { label, upTarget: 0, upRoot: 0, bySpouse: true };
  }

  // Blood relation via shared ancestor (uses the extended parent map so that
  // GEDCOM imports asserting parents only on the family record still work).
  const targetAncs = ancestorsMap(targetId);
  const rootAncs = ancestorsMap(rootId);
  let bestAncId: string | null = null;
  let bestSum = Infinity;
  let bestN = 0;
  let bestM = 0;
  for (const [ancId, n] of Array.from(targetAncs.entries())) {
    const m = rootAncs.get(ancId);
    if (m === undefined) continue;
    if (n + m < bestSum) {
      bestSum = n + m;
      bestAncId = ancId;
      bestN = n;
      bestM = m;
    }
  }
  if (bestAncId) {
    const label = bloodRelLabel(bestN, bestM, sex);
    return { label, upTarget: bestN, upRoot: bestM };
  }

  // No blood path. Walk the full bidirectional graph and label whatever path
  // the BFS produces. This is what catches every parent-in-law, step-child,
  // sibling-in-law, and grand-in-law that the blood pass cannot see.
  const path = bfsPath(rootId, targetId);
  if (path) {
    const label = interpretPath(path, sex);
    if (label) {
      const ups = path.filter((e) => e === "p").length;
      const downs = path.filter((e) => e === "c").length;
      const bySpouse = path.some((e) => e === "s");
      return { label, upTarget: downs, upRoot: ups, bySpouse };
    }
  }

  // Truly orphaned imported record — no edge to anyone in root's component.
  // Give a specific-but-honest label so the UI never says "not tracked".
  const branch = orphanBranchLabel(target);
  if (branch) {
    return { label: branch, upTarget: 0, upRoot: 0, bySpouse: true };
  }
  return null;
}

/**
 * Honest label for the handful of imported individuals who have no graph
 * connection to anyone in the root's component (typically isolated GEDCOM
 * records from a foreign branch). We name the surname / spouse so the user
 * can still locate them. Never returns null — always something readable.
 */
function orphanBranchLabel(p: Person): string {
  // Prefer surname; fall back to spouse's surname when the person itself has
  // only a given name.
  const surname = p.surname && p.surname.trim().length > 0 ? p.surname : null;
  if (surname) return `in the ${surname} branch (unlinked record)`;
  for (const sid of p.spouse_ids) {
    const sp = peopleById[sid];
    if (sp?.surname) return `in the ${sp.surname} branch (unlinked record)`;
  }
  return "unlinked record in the family file";
}

/** A "key" person is the one we want the home page to start with. */
export function getRootPerson(): Person {
  // Prefer James Gregory Walsh
  const james = people.find(
    (p) => p.given.toLowerCase() === "james gregory" && p.surname === "Walsh",
  );
  if (james) return james;
  return people[0];
}
