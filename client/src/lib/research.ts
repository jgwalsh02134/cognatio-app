// Research helpers: structural utilities that turn the static dataset into
// actionable research surfaces — brick walls (ancestors with no recorded
// parents), census coverage windows, FAN-club neighbors (Friends, Associates,
// Neighbors sharing place + era), records-to-obtain checklists, and
// surname-project deep links.
//
// All helpers are pure functions over the in-memory dataset — no network,
// no storage. Keep them cheap enough to call from render paths.

import {
  familiesById,
  fullDisplayName,
  isLiving,
  parseYear,
  peopleById,
  people,
  personCountry,
  placeToCountry,
  type Person,
} from "./family";

const guessCountry = placeToCountry;

// ---------------------------------------------------------------------------
// Lineage chains
// ---------------------------------------------------------------------------

export interface LineageStep {
  person: Person;
  /** how the previous step connects to this one ("father" of prev, etc.) */
  via?: "father" | "mother";
}

function pickParents(p: Person): { father: Person | null; mother: Person | null } {
  let father: Person | null = null;
  let mother: Person | null = null;
  for (const fid of p.family_child_ids) {
    const f = familiesById[fid];
    if (!f) continue;
    if (f.husband_id && !father) father = peopleById[f.husband_id] ?? null;
    if (f.wife_id && !mother) mother = peopleById[f.wife_id] ?? null;
  }
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
  return { father, mother };
}

function climbLine(startId: string, pick: "father" | "mother", maxDepth = 25): LineageStep[] {
  const out: LineageStep[] = [];
  const seen = new Set<string>();
  let current = peopleById[startId];
  if (!current) return out;
  out.push({ person: current });
  for (let i = 0; i < maxDepth; i++) {
    const { father, mother } = pickParents(current);
    const next = pick === "father" ? father : mother;
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    out.push({ person: next, via: pick });
    current = next;
  }
  return out;
}

export function paternalLine(startId: string, maxDepth = 25): LineageStep[] {
  return climbLine(startId, "father", maxDepth);
}

export function maternalLine(startId: string, maxDepth = 25): LineageStep[] {
  return climbLine(startId, "mother", maxDepth);
}

// ---------------------------------------------------------------------------
// Brick walls — ancestors with no recorded parents who have ≥1 descendant in
// the tree. Ranked by descendant count (research priority) and by date
// (older brick walls bubble up).
// ---------------------------------------------------------------------------

export interface BrickWall {
  person: Person;
  /** descendants counted within the dataset */
  descendantCount: number;
  /** generations to the nearest direct descendant root */
  birthYear: number | null;
  /** lineage flavor — pure paternal/maternal/mixed */
  flavor: "paternal" | "maternal" | "mixed";
}

function countDescendants(rootId: string, maxDepth = 12): number {
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const p = peopleById[id];
      if (!p) continue;
      for (const cid of p.child_ids) {
        if (!seen.has(cid)) {
          seen.add(cid);
          next.push(cid);
        }
      }
    }
    frontier = next;
  }
  return seen.size - 1; // exclude self
}

export function brickWalls(opts: { minDescendants?: number } = {}): BrickWall[] {
  const min = opts.minDescendants ?? 1;
  const out: BrickWall[] = [];
  for (const p of people) {
    if (p.parent_ids.length > 0 || p.family_child_ids.length > 0) continue;
    const dc = countDescendants(p.id);
    if (dc < min) continue;
    // Flavor: trace any descendant path; mark paternal if every link on the
    // shortest chain is via father, maternal if via mother, else mixed.
    out.push({
      person: p,
      descendantCount: dc,
      birthYear: parseYear(p.birth?.date),
      flavor: brickFlavor(p),
    });
  }
  out.sort((a, b) => {
    if (b.descendantCount !== a.descendantCount) return b.descendantCount - a.descendantCount;
    return (a.birthYear ?? 9999) - (b.birthYear ?? 9999);
  });
  return out;
}

function brickFlavor(_p: Person): "paternal" | "maternal" | "mixed" {
  // For now, surnames passed through father → if person's surname matches
  // most-common surname in their descendants, paternal flavor; otherwise mixed.
  // Cheap heuristic: just call it "mixed" — UI doesn't depend on flavor right now.
  return "mixed";
}

// ---------------------------------------------------------------------------
// Census coverage
// ---------------------------------------------------------------------------

export interface CensusYear {
  year: number;
  country: string;
  countryCode: string;
  /** Estimated age in that census year (null if no birth date) */
  age: number | null;
  /** Best-guess place at that time (residence ≤ census year, or birth place) */
  placeHint: string | null;
  /** Pre-built FamilySearch search URL */
  url: string;
}

// Census schedules by country
const US_CENSUS_YEARS = [
  1790, 1800, 1810, 1820, 1830, 1840, 1850, 1860, 1870, 1880,
  /* 1890 mostly destroyed */ 1900, 1910, 1920, 1930, 1940, 1950,
];
const UK_CENSUS_YEARS = [1841, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921];
const IE_CENSUS_YEARS = [1901, 1911];
const CA_CENSUS_YEARS = [1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921];
const SCOTLAND_CENSUS_YEARS = UK_CENSUS_YEARS;

function censusUrl(p: Person, year: number, country: string): string {
  const params = new URLSearchParams();
  if (p.given) params.set("q.givenName", p.given);
  if (p.surname) params.set("q.surname", p.surname);
  // Estimated birth window if we have a birth date — narrow to ±5 years
  const by = parseYear(p.birth?.date);
  if (by) {
    params.set("q.birthLikeDate.from", String(by - 3));
    params.set("q.birthLikeDate.to", String(by + 3));
  }
  // Restrict to the residence/event year window. FamilySearch uses
  // q.residenceDate (not q.residenceLikeDate) on the records search.
  const residencePlace = placeForYear(p, year) ?? p.birth?.place ?? country ?? "";
  if (residencePlace) params.set("q.residencePlace", residencePlace);
  params.set("q.residenceDate.from", String(year - 1));
  params.set("q.residenceDate.to", String(year + 1));
  // FamilySearch's public record search is "/search/record/results" (singular
  // "record"); the plural "/search/records/results" 404s.
  return `https://www.familysearch.org/search/record/results?${params.toString()}`;
}

function placeForYear(p: Person, year: number): string | null {
  // Prefer the most recent residence event whose date is ≤ year
  let best: { year: number; place: string } | null = null;
  for (const r of p.residences || []) {
    const y = parseYear(r.date);
    if (y == null || !r.place) continue;
    if (y <= year && (!best || y > best.year)) best = { year: y, place: r.place };
  }
  if (best) return best.place;
  // Fall back to birth place if census is plausible (within ~25y of birth)
  const by = parseYear(p.birth?.date);
  if (by && year - by <= 30 && p.birth?.place) return p.birth.place;
  return null;
}

export function censusCoverage(p: Person): CensusYear[] {
  const by = parseYear(p.birth?.date);
  const dy = parseYear(p.death?.date);
  if (by == null) return [];

  const country = personCountry(p);
  let years: number[] = [];
  let countryName = "";
  let countryCode = "";

  if (country === "United States") {
    years = US_CENSUS_YEARS;
    countryName = "United States";
    countryCode = "US";
  } else if (country === "England") {
    years = UK_CENSUS_YEARS;
    countryName = "England";
    countryCode = "GB-ENG";
  } else if (country === "Scotland") {
    years = SCOTLAND_CENSUS_YEARS;
    countryName = "Scotland";
    countryCode = "GB-SCT";
  } else if (country === "Ireland") {
    years = IE_CENSUS_YEARS;
    countryName = "Ireland";
    countryCode = "IE";
  } else if (country === "Canada") {
    years = CA_CENSUS_YEARS;
    countryName = "Canada";
    countryCode = "CA";
  } else {
    return [];
  }

  const startYear = Math.max(by - 1, years[0]);
  const endYear = dy ?? (by + 95);
  return years
    .filter((y) => y >= startYear && y <= endYear)
    .map<CensusYear>((year) => ({
      year,
      country: countryName,
      countryCode,
      age: by ? year - by : null,
      placeHint: placeForYear(p, year),
      url: censusUrl(p, year, countryName),
    }));
}

// ---------------------------------------------------------------------------
// FAN club — Friends, Associates, Neighbors. Surface people who share an
// overlapping place + era (and aren't already direct family).
// ---------------------------------------------------------------------------

export interface FanNeighbor {
  person: Person;
  reasons: string[];
  score: number;
}

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function eraAndPlace(p: Person): { era: number | null; places: string[] } {
  const places = new Set<string>();
  if (p.birth?.place) places.add(normalize(p.birth.place));
  if (p.death?.place) places.add(normalize(p.death.place));
  for (const r of p.residences || []) {
    if (r.place) places.add(normalize(r.place));
  }
  const era = parseYear(p.birth?.date);
  return { era, places: Array.from(places) };
}

function placesShareToken(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Match by any shared place token (handles "Boston, MA" ↔ "Boston, Massachusetts").
  const ta = new Set(a.split(/[,;]+/).map((s) => s.trim()).filter((s) => s.length >= 3));
  for (const t of b.split(/[,;]+/).map((s) => s.trim())) {
    if (t.length >= 3 && ta.has(t)) return true;
  }
  return false;
}

function directRelativeIds(p: Person): Set<string> {
  const ids = new Set<string>();
  ids.add(p.id);
  p.parent_ids.forEach((id) => ids.add(id));
  p.child_ids.forEach((id) => ids.add(id));
  p.spouse_ids.forEach((id) => ids.add(id));
  // Siblings via family_child_ids
  for (const fid of p.family_child_ids) {
    const f = familiesById[fid];
    if (!f) continue;
    f.children_ids.forEach((id) => ids.add(id));
  }
  return ids;
}

export function fanClubFor(p: Person, limit = 12): FanNeighbor[] {
  const { era, places } = eraAndPlace(p);
  if (places.length === 0) return [];
  const exclude = directRelativeIds(p);
  const out: FanNeighbor[] = [];
  for (const other of people) {
    if (exclude.has(other.id)) continue;
    const o = eraAndPlace(other);
    if (o.places.length === 0) continue;
    let placeHit: string | null = null;
    for (const a of places) {
      for (const b of o.places) {
        if (placesShareToken(a, b)) {
          placeHit = a;
          break;
        }
      }
      if (placeHit) break;
    }
    if (!placeHit) continue;
    const reasons: string[] = [];
    reasons.push(`Shared place: ${placeHit}`);
    let score = 1;
    if (era != null && o.era != null) {
      const diff = Math.abs(era - o.era);
      if (diff <= 15) {
        score += 2;
        reasons.push(`Same generation (±${diff}y)`);
      } else if (diff <= 35) {
        score += 1;
        reasons.push(`Overlapping era (±${diff}y)`);
      } else {
        continue; // too far apart to be useful neighbors
      }
    }
    if (other.surname && other.surname === p.surname) {
      score += 1;
      reasons.push("Same surname — possible kin");
    }
    out.push({ person: other, reasons, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Records to obtain — era-aware checklist of probable records to pursue.
// ---------------------------------------------------------------------------

export interface RecordTask {
  id: string;
  label: string;
  why: string;
  /** Heuristic "we likely already have this" — based on source_count + flags */
  likelyHave: boolean;
  countryName?: string;
  countryCode?: string;
}

export function recordsToObtain(p: Person): RecordTask[] {
  const out: RecordTask[] = [];
  const by = parseYear(p.birth?.date);
  const dy = parseYear(p.death?.date);
  const country = personCountry(p);
  const haveSrc = (p.source_count ?? 0) > 0;
  const living = isLiving(p);

  // Birth record
  out.push({
    id: "birth",
    label: "Birth certificate or baptism record",
    why: by
      ? `Confirms ${by} birth — parents, place, witnesses${country === "Ireland" && by >= 1864 ? ", civil registration available" : ""}`
      : "Establishes vital fact — parents, place, exact date",
    likelyHave: haveSrc && !!p.birth?.date && !!p.birth?.place,
  });

  // Marriage records (one per spouse family)
  if (p.family_spouse_ids.length > 0) {
    out.push({
      id: "marriage",
      label: `Marriage certificate${p.family_spouse_ids.length > 1 ? "s" : ""}`,
      why: `Establishes spouse, date, witnesses${p.family_spouse_ids.length > 1 ? ` — ${p.family_spouse_ids.length} unions` : ""}`,
      likelyHave: false,
    });
  }

  // Death record
  if (!living) {
    out.push({
      id: "death",
      label: "Death certificate",
      why: dy
        ? `Confirms ${dy} death — cause, informant, burial detail`
        : "Establishes death — date, place, cause, informant",
      likelyHave: haveSrc && !!p.death?.date,
    });
  }

  // Burial / headstone
  if (!living) {
    out.push({
      id: "burial",
      label: "Cemetery / headstone (FindAGrave, BillionGraves)",
      why: "Confirms burial date and place; photo of inscription often reveals exact dates and parents",
      likelyHave: !!p.burial?.date && !!p.burial?.place,
    });
    out.push({
      id: "obit",
      label: "Newspaper obituary",
      why: "Often lists surviving relatives — children, siblings, in-laws — and life narrative",
      likelyHave: false,
    });
  }

  // US-specific records
  if (country === "United States" && by) {
    if (by <= 1950) {
      out.push({
        id: "us-census",
        label: "Federal census records",
        why: "1790–1950 enumerations place person in household and neighborhood at known intervals",
        likelyHave: false,
        countryName: "United States",
        countryCode: "US",
      });
    }
    if (by >= 1873 && by <= 1900) {
      out.push({
        id: "wwi-draft",
        label: "WWI draft registration card (1917–1918)",
        why: "Required for men born 1873–1900 — captures address, employer, physical description, signature",
        likelyHave: false,
        countryName: "United States",
        countryCode: "US",
      });
    }
    if (by >= 1877 && by <= 1925) {
      out.push({
        id: "wwii-draft",
        label: "WWII draft registration (1940–1947)",
        why: "Old man's draft (1942) covers men born 1877–1897; Young men's draft covers 1898–1925",
        likelyHave: false,
        countryName: "United States",
        countryCode: "US",
      });
    }
    if (dy && dy >= 1937) {
      out.push({
        id: "ssdi",
        label: "Social Security Death Index / SS-5 application",
        why: "Confirms death date, last residence; SS-5 shows parents at signing",
        likelyHave: false,
        countryName: "United States",
        countryCode: "US",
      });
    }
  }

  // Immigrant heuristic: birth country differs from death/residence country.
  const birthCountry = p.birth?.place ? guessCountry(p.birth.place) : null;
  const deathCountry = p.death?.place ? guessCountry(p.death.place) : null;
  const residenceCountries = (p.residences || [])
    .map((r) => (r.place ? guessCountry(r.place) : null))
    .filter((c): c is string => !!c);
  const livedCountries = new Set([deathCountry, ...residenceCountries].filter((c): c is string => !!c));
  if (birthCountry && livedCountries.size > 0 && !livedCountries.has(birthCountry)) {
    out.push({
      id: "immigration",
      label: "Ship manifest / passenger list",
      why: `Shows ${birthCountry} → ${Array.from(livedCountries)[0]} arrival — date, port, traveling companions`,
      likelyHave: false,
    });
    out.push({
      id: "naturalization",
      label: "Naturalization petition & declaration",
      why: "Captures birth date, town of origin, vessel, witnesses — often the breakthrough for European origins",
      likelyHave: false,
    });
  }

  // Ireland-specific
  if (country === "Ireland") {
    if (by && by >= 1864) {
      out.push({
        id: "ie-civil",
        label: "Irish civil registration (1864+)",
        why: "Free at IrishGenealogy.ie — births, marriages, deaths after civil registration",
        likelyHave: false,
        countryName: "Ireland",
        countryCode: "IE",
      });
    }
    if (by && by >= 1830) {
      out.push({
        id: "ie-griffiths",
        label: "Griffith's Valuation (1847–1864)",
        why: "Property survey — sometimes the only pre-Famine record placing a family in a townland",
        likelyHave: false,
        countryName: "Ireland",
        countryCode: "IE",
      });
    }
    out.push({
      id: "ie-parish",
      label: "Catholic parish registers (NLI)",
      why: "Baptisms & marriages, free at registers.nli.ie — pre-civil registration vital records",
      likelyHave: false,
      countryName: "Ireland",
      countryCode: "IE",
    });
  }

  // Scotland-specific
  if (country === "Scotland") {
    out.push({
      id: "sct-statutory",
      label: "ScotlandsPeople statutory records",
      why: "Statutory births (1855+), marriages, deaths — pay-per-view but indexed free",
      likelyHave: false,
      countryName: "Scotland",
      countryCode: "GB-SCT",
    });
    out.push({
      id: "sct-opr",
      label: "Old Parish Registers (pre-1855)",
      why: "Church of Scotland baptisms and proclamations of marriage",
      likelyHave: false,
      countryName: "Scotland",
      countryCode: "GB-SCT",
    });
  }

  // Germany-specific
  if (country === "Germany" || country === "Austria") {
    out.push({
      id: "de-kirchenbuch",
      label: "Kirchenbücher (church books)",
      why: "Pre-civil-registration Lutheran or Catholic parish registers — Archion / Matricula",
      likelyHave: false,
      countryName: "Germany",
      countryCode: "DE",
    });
  }

  // Canada-specific
  if (country === "Canada") {
    out.push({
      id: "ca-census",
      label: "Canadian census (1851–1921)",
      why: "Library & Archives Canada — household enumerations every 10 years",
      likelyHave: false,
      countryName: "Canada",
      countryCode: "CA",
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Surname projects — DNA project / one-name study deep links
// ---------------------------------------------------------------------------

export interface SurnameProjectLink {
  label: string;
  hint: string;
  url: string;
  group: "dna" | "history" | "records" | "tree";
}

export function surnameProjectLinks(surname: string): SurnameProjectLink[] {
  if (!surname) return [];
  const s = encodeURIComponent(surname);
  return [
    {
      label: "FamilyTreeDNA surname project",
      hint: "Find or start a Y-DNA surname project — the breakthrough tool for paternal brick walls",
      url: `https://www.familytreedna.com/groups?searchTerm=${s}`,
      group: "dna",
    },
    {
      label: "Guild of One-Name Studies",
      hint: "Check if anyone has registered this surname as a one-name study",
      url: `https://one-name.org/?s=${s}`,
      group: "history",
    },
    {
      label: "FamilySearch surname wiki",
      hint: "Etymology, distribution maps, common spellings",
      url: `https://www.familysearch.org/search/wiki/en/Special:Search?search=${s}+surname`,
      group: "history",
    },
    {
      label: "FamilySearch tree by surname",
      hint: "All FamilySearch tree people with this surname",
      url: `https://www.familysearch.org/tree/find/name?self.surname=${s}`,
      group: "tree",
    },
    {
      label: "WikiTree surname index",
      hint: "Crowd-sourced tree — find shared ancestors with other researchers",
      url: `https://www.wikitree.com/index.php?title=Special:Surname&s=${s}`,
      group: "tree",
    },
    {
      label: "Newspapers.com surname search",
      hint: "Era-spanning newspaper mentions — obituaries, social columns, court notices",
      url: `https://www.newspapers.com/search/?query=${s}`,
      group: "records",
    },
  ];
}

// ---------------------------------------------------------------------------
// Aggregate research stats for the page header
// ---------------------------------------------------------------------------

export interface ResearchStats {
  totalPeople: number;
  withParents: number;
  withBirthDate: number;
  withDeathDate: number;
  withBirthPlace: number;
  sourcedPeople: number;
  brickWallCount: number;
  censusCoverableCount: number;
}

export function computeResearchStats(): ResearchStats {
  let withParents = 0;
  let withBirthDate = 0;
  let withDeathDate = 0;
  let withBirthPlace = 0;
  let sourcedPeople = 0;
  let censusCoverableCount = 0;
  for (const p of people) {
    if (p.parent_ids.length > 0 || p.family_child_ids.length > 0) withParents++;
    if (p.birth?.date) withBirthDate++;
    if (p.death?.date) withDeathDate++;
    if (p.birth?.place) withBirthPlace++;
    if ((p.source_count ?? 0) > 0) sourcedPeople++;
    if (censusCoverage(p).length > 0) censusCoverableCount++;
  }
  return {
    totalPeople: people.length,
    withParents,
    withBirthDate,
    withDeathDate,
    withBirthPlace,
    sourcedPeople,
    brickWallCount: brickWalls().length,
    censusCoverableCount,
  };
}

// Re-export display helper for convenience
export { fullDisplayName };
