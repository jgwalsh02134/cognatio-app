// Discovery helpers — power tools that mine the dataset for deepest roots,
// data anomalies, advanced finders, migration paths, and probable kin.
//
// All pure-functional, no storage, no network. Designed to be called from
// React render paths and memoized where useful.

import {
  familiesById,
  fullDisplayName,
  getSiblings,
  isAnchorlessPlaceholder,
  isLiving,
  parseYear,
  peopleById,
  people,
  personCountry,
  placeToCountry,
  type Person,
} from "./family";
import { paternalLine, maternalLine, type LineageStep } from "./research";

// ---------------------------------------------------------------------------
// Generation depth — how many recorded ancestors deep does each person reach?
// Useful for "deepest roots" rankings.
// ---------------------------------------------------------------------------

export interface DepthInfo {
  /** how many generations of recorded ancestors above this person */
  depth: number;
  /** ID of the earliest ancestor reached on the deepest chain */
  apex: string | null;
  /** birth year of the apex ancestor, if known */
  apexYear: number | null;
}

const _depthCache = new Map<string, DepthInfo>();

export function ancestorDepth(personId: string): DepthInfo {
  const cached = _depthCache.get(personId);
  if (cached) return cached;
  const start = peopleById[personId];
  if (!start) {
    const empty: DepthInfo = { depth: 0, apex: null, apexYear: null };
    _depthCache.set(personId, empty);
    return empty;
  }
  // Iterative BFS to avoid recursion blow-ups on cyclic / deep trees.
  const seen = new Set<string>([personId]);
  let frontier = new Set<string>([personId]);
  let depth = 0;
  let apex = personId;
  let apexYear = parseYear(start.birth?.date);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const id of frontier) {
      const p = peopleById[id];
      if (!p) continue;
      for (const pid of p.parent_ids) {
        if (seen.has(pid)) continue;
        if (!peopleById[pid]) continue;
        seen.add(pid);
        next.add(pid);
      }
    }
    if (next.size === 0) break;
    depth += 1;
    // pick a representative apex from this generation — the one with the
    // earliest known birth year, falling back to the first id.
    let bestId: string | null = null;
    let bestYear: number | null = null;
    for (const id of next) {
      const py = parseYear(peopleById[id]?.birth?.date);
      if (py !== null && (bestYear === null || py < bestYear)) {
        bestYear = py;
        bestId = id;
      } else if (bestId === null) {
        bestId = id;
      }
    }
    if (bestId) {
      apex = bestId;
      if (bestYear !== null) apexYear = bestYear;
    }
    frontier = next;
  }
  const info: DepthInfo = { depth, apex, apexYear };
  _depthCache.set(personId, info);
  return info;
}

// ---------------------------------------------------------------------------
// Deepest roots — for each surname, which recorded ancestor is the oldest /
// reaches the most generations back? Plus a global "deepest lines" ranking.
// ---------------------------------------------------------------------------

export interface RootLine {
  surname: string;
  apex: Person;
  apexYear: number | null;
  /** living anchor — a descendant in the modern era that grounds the line */
  anchor: Person | null;
  /** generation depth between anchor and apex */
  depth: number;
  /** number of recorded people in this surname's apex sub-tree */
  branchSize: number;
}

function descendantsOf(personId: string, hardCap = 10000): Set<string> {
  const out = new Set<string>();
  const stack = [personId];
  while (stack.length > 0 && out.size < hardCap) {
    const id = stack.pop();
    if (!id || out.has(id)) continue;
    out.add(id);
    const p = peopleById[id];
    if (!p) continue;
    for (const cid of p.child_ids) {
      if (!out.has(cid)) stack.push(cid);
    }
  }
  return out;
}

export function deepestRootsBySurname(): RootLine[] {
  // Anchor candidates: people who have at least one parent recorded (so they
  // sit somewhere mid-tree) and have a descendant ladder.
  const anchorBySurname = new Map<string, { anchor: Person; info: DepthInfo }>();
  for (const p of people) {
    if (isAnchorlessPlaceholder(p)) continue;
    if (!p.surname) continue;
    const info = ancestorDepth(p.id);
    const cur = anchorBySurname.get(p.surname);
    if (!cur || info.depth > cur.info.depth) {
      anchorBySurname.set(p.surname, { anchor: p, info });
    }
  }
  const out: RootLine[] = [];
  for (const [surname, { anchor, info }] of anchorBySurname.entries()) {
    const apex = info.apex ? peopleById[info.apex] : null;
    if (!apex) continue;
    out.push({
      surname,
      apex,
      apexYear: info.apexYear,
      anchor,
      depth: info.depth,
      branchSize: descendantsOf(apex.id).size,
    });
  }
  // Sort by depth desc, then by apex year asc (older = better deep root).
  out.sort((a, b) => {
    if (b.depth !== a.depth) return b.depth - a.depth;
    const ay = a.apexYear ?? 9999;
    const by = b.apexYear ?? 9999;
    return ay - by;
  });
  return out;
}

/** Earliest known ancestor per surname — oldest birth year holder. */
export interface EarliestPerSurname {
  surname: string;
  person: Person;
  year: number;
  count: number;
}

export function earliestPerSurname(minCount = 2): EarliestPerSurname[] {
  const bySurname = new Map<string, { count: number; earliest: Person; year: number }>();
  for (const p of people) {
    if (!p.surname || isAnchorlessPlaceholder(p)) continue;
    const y = parseYear(p.birth?.date);
    const cur = bySurname.get(p.surname);
    if (!cur) {
      bySurname.set(p.surname, {
        count: 1,
        earliest: p,
        year: y ?? Number.POSITIVE_INFINITY,
      });
    } else {
      cur.count += 1;
      if (y !== null && y < cur.year) {
        cur.earliest = p;
        cur.year = y;
      }
    }
  }
  const out: EarliestPerSurname[] = [];
  for (const [surname, { count, earliest, year }] of bySurname.entries()) {
    if (count < minCount) continue;
    if (!Number.isFinite(year)) continue;
    out.push({ surname, person: earliest, year, count });
  }
  out.sort((a, b) => a.year - b.year);
  return out;
}

/** Distribution of "depth-reach" values across the tree (for a chart). */
export function depthDistribution(): { depth: number; count: number }[] {
  const buckets = new Map<number, number>();
  for (const p of people) {
    if (isAnchorlessPlaceholder(p)) continue;
    const d = ancestorDepth(p.id).depth;
    buckets.set(d, (buckets.get(d) ?? 0) + 1);
  }
  const out = Array.from(buckets.entries())
    .map(([depth, count]) => ({ depth, count }))
    .sort((a, b) => a.depth - b.depth);
  return out;
}

// ---------------------------------------------------------------------------
// Sosa-Stradonitz (Ahnentafel) numbering — classic genealogy serial that
// makes ancestor relationships obvious at a glance.
//
// Subject: 1
// Father: 2, Mother: 3
// Paternal grandfather: 4, Paternal grandmother: 5
// Maternal grandfather: 6, Maternal grandmother: 7
// In general: father(n) = 2n, mother(n) = 2n+1
// ---------------------------------------------------------------------------

export interface AhnentafelEntry {
  sosa: number;
  generation: number;
  person: Person;
  /** "F" or "M" — derived from the path, not the person's sex */
  branch: "F" | "M" | "self";
}

export function ahnentafel(rootId: string, maxGeneration = 8): AhnentafelEntry[] {
  const root = peopleById[rootId];
  if (!root) return [];
  const out: AhnentafelEntry[] = [{ sosa: 1, generation: 0, person: root, branch: "self" }];
  const queue: { id: string; sosa: number; generation: number }[] = [
    { id: rootId, sosa: 1, generation: 0 },
  ];
  while (queue.length > 0) {
    const head = queue.shift()!;
    if (head.generation >= maxGeneration) continue;
    const p = peopleById[head.id];
    if (!p) continue;
    let father: Person | null = null;
    let mother: Person | null = null;
    for (const fid of p.family_child_ids) {
      const fam = familiesById[fid];
      if (!fam) continue;
      if (fam.husband_id && !father) father = peopleById[fam.husband_id] ?? null;
      if (fam.wife_id && !mother) mother = peopleById[fam.wife_id] ?? null;
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
    if (father) {
      const sosa = head.sosa * 2;
      out.push({
        sosa,
        generation: head.generation + 1,
        person: father,
        branch: "F",
      });
      queue.push({ id: father.id, sosa, generation: head.generation + 1 });
    }
    if (mother) {
      const sosa = head.sosa * 2 + 1;
      out.push({
        sosa,
        generation: head.generation + 1,
        person: mother,
        branch: "M",
      });
      queue.push({ id: mother.id, sosa, generation: head.generation + 1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Migration paths — chronological list of where a person was, drawn from
// birth, residences, marriage(s), death/burial.
// ---------------------------------------------------------------------------

export interface MigrationStop {
  year: number | null;
  place: string;
  country: string | null;
  kind: "birth" | "residence" | "marriage" | "death" | "burial";
  note?: string | null;
}

export function migrationPath(person: Person): MigrationStop[] {
  const stops: MigrationStop[] = [];
  if (person.birth?.place) {
    stops.push({
      year: parseYear(person.birth?.date),
      place: person.birth.place,
      country: placeToCountry(person.birth.place),
      kind: "birth",
    });
  }
  for (const r of person.residences ?? []) {
    if (!r.place) continue;
    stops.push({
      year: parseYear(r.date),
      place: r.place,
      country: placeToCountry(r.place),
      kind: "residence",
      note: r.note,
    });
  }
  for (const fid of person.family_spouse_ids ?? []) {
    const fam = familiesById[fid];
    if (!fam?.marriage?.place) continue;
    stops.push({
      year: parseYear(fam.marriage.date),
      place: fam.marriage.place,
      country: placeToCountry(fam.marriage.place),
      kind: "marriage",
    });
  }
  if (person.death?.place) {
    stops.push({
      year: parseYear(person.death?.date),
      place: person.death.place,
      country: placeToCountry(person.death.place),
      kind: "death",
    });
  }
  if (person.burial?.place && person.burial.place !== person.death?.place) {
    stops.push({
      year: parseYear(person.burial?.date),
      place: person.burial.place,
      country: placeToCountry(person.burial.place),
      kind: "burial",
    });
  }
  // De-dupe consecutive same-place stops while preserving order.
  const deduped: MigrationStop[] = [];
  for (const s of stops) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.place === s.place && prev.kind === s.kind) continue;
    deduped.push(s);
  }
  // Sort by year, but keep unknown-year stops in their original sequence.
  return deduped
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ay = a.s.year ?? Number.POSITIVE_INFINITY;
      const by = b.s.year ?? Number.POSITIVE_INFINITY;
      if (ay !== by) return ay - by;
      return a.i - b.i;
    })
    .map(({ s }) => s);
}

// ---------------------------------------------------------------------------
// Probable siblings — for a person with limited family info, surface other
// people who share a surname, birthplace and era — possible unrecorded
// siblings, especially valuable for brick-wall ancestors.
// ---------------------------------------------------------------------------

export interface SiblingCandidate {
  person: Person;
  reasons: string[];
  score: number;
}

function placeTokens(place: string | null | undefined): string[] {
  if (!place) return [];
  return place
    .toLowerCase()
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function probableSiblings(p: Person, limit = 8): SiblingCandidate[] {
  if (!p.surname) return [];
  const recordedSiblings = new Set(getSiblings(p).map((s) => s.id));
  recordedSiblings.add(p.id);
  const subjectPlaces = new Set<string>();
  for (const t of placeTokens(p.birth?.place)) subjectPlaces.add(t);
  for (const r of p.residences ?? []) {
    for (const t of placeTokens(r.place)) subjectPlaces.add(t);
  }
  const subjectYear = parseYear(p.birth?.date);
  const candidates: SiblingCandidate[] = [];
  for (const q of people) {
    if (q.id === p.id) continue;
    if (recordedSiblings.has(q.id)) continue;
    if (q.surname.toLowerCase() !== p.surname.toLowerCase()) continue;
    if (isAnchorlessPlaceholder(q)) continue;
    const reasons: string[] = [];
    let score = 0;
    // Same birthplace tokens
    const qPlaces = new Set<string>();
    for (const t of placeTokens(q.birth?.place)) qPlaces.add(t);
    for (const r of q.residences ?? []) {
      for (const t of placeTokens(r.place)) qPlaces.add(t);
    }
    const sharedPlaces: string[] = [];
    for (const t of subjectPlaces) {
      if (qPlaces.has(t)) sharedPlaces.push(t);
    }
    if (sharedPlaces.length > 0) {
      score += 2;
      reasons.push(`shared place: ${sharedPlaces[0]}`);
    }
    // Born within ±25 years
    const qYear = parseYear(q.birth?.date);
    if (subjectYear !== null && qYear !== null) {
      const diff = Math.abs(subjectYear - qYear);
      if (diff <= 25) {
        score += 1;
        reasons.push(`b. ${qYear} (\u0394${diff}y)`);
      } else if (diff <= 40) {
        score += 0.4;
      }
    }
    // Both have no recorded parents (often-co-orphaned siblings)
    if (
      p.parent_ids.length === 0 &&
      p.family_child_ids.length === 0 &&
      q.parent_ids.length === 0 &&
      q.family_child_ids.length === 0
    ) {
      score += 1;
      reasons.push("both unparented");
    }
    if (score >= 1.5) candidates.push({ person: q, reasons, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Data anomalies — surfaces things that look wrong or incomplete.
// ---------------------------------------------------------------------------

export type AnomalyKind =
  | "parent_died_before_birth"
  | "mother_under_12_at_birth"
  | "mother_over_55_at_birth"
  | "father_under_14_at_birth"
  | "father_over_75_at_birth"
  | "death_before_birth"
  | "implausible_age"
  | "missing_one_parent"
  | "no_birth_year"
  | "no_death_year_likely_deceased"
  | "missing_birth_place"
  | "duplicate_name_no_dates";

export interface Anomaly {
  kind: AnomalyKind;
  severity: "high" | "medium" | "low";
  person: Person;
  detail: string;
  related?: Person | null;
}

const ANOMALY_LABEL: Record<AnomalyKind, string> = {
  parent_died_before_birth: "Parent died before child's birth",
  mother_under_12_at_birth: "Mother under 12 at child's birth",
  mother_over_55_at_birth: "Mother over 55 at child's birth",
  father_under_14_at_birth: "Father under 14 at child's birth",
  father_over_75_at_birth: "Father over 75 at child's birth",
  death_before_birth: "Death date before birth date",
  implausible_age: "Implausible age at death",
  missing_one_parent: "Only one parent on record",
  no_birth_year: "Missing birth year",
  no_death_year_likely_deceased: "Missing death year (likely deceased)",
  missing_birth_place: "Missing birth place",
  duplicate_name_no_dates: "Same name as another person, no dates to distinguish",
};

export function anomalyLabel(k: AnomalyKind): string {
  return ANOMALY_LABEL[k];
}

export function findAnomalies(): Anomaly[] {
  const out: Anomaly[] = [];
  // Name duplicate index
  const nameIdx = new Map<string, Person[]>();
  for (const p of people) {
    const key = `${p.given} ${p.surname}`.toLowerCase().trim();
    if (!key || key === " ") continue;
    if (!nameIdx.has(key)) nameIdx.set(key, []);
    nameIdx.get(key)!.push(p);
  }
  for (const p of people) {
    if (isAnchorlessPlaceholder(p)) continue;
    const by = parseYear(p.birth?.date);
    const dy = parseYear(p.death?.date);
    // Date sanity
    if (by !== null && dy !== null && dy < by) {
      out.push({
        kind: "death_before_birth",
        severity: "high",
        person: p,
        detail: `Born ${by}, died ${dy}`,
      });
    }
    if (by !== null && dy !== null) {
      const ageAtDeath = dy - by;
      if (ageAtDeath > 110 || ageAtDeath < 0) {
        out.push({
          kind: "implausible_age",
          severity: "high",
          person: p,
          detail: `Age at death: ${ageAtDeath}`,
        });
      }
    }
    // Parent age checks
    for (const fid of p.family_child_ids) {
      const fam = familiesById[fid];
      if (!fam) continue;
      const father = fam.husband_id ? peopleById[fam.husband_id] : null;
      const mother = fam.wife_id ? peopleById[fam.wife_id] : null;
      if (father && by !== null) {
        const fb = parseYear(father.birth?.date);
        const fd = parseYear(father.death?.date);
        if (fb !== null) {
          const ageAtChild = by - fb;
          if (ageAtChild < 14 && ageAtChild >= 0) {
            out.push({
              kind: "father_under_14_at_birth",
              severity: "medium",
              person: p,
              detail: `Father ${fullDisplayName(father)} was ${ageAtChild} at birth`,
              related: father,
            });
          } else if (ageAtChild > 75) {
            out.push({
              kind: "father_over_75_at_birth",
              severity: "low",
              person: p,
              detail: `Father ${fullDisplayName(father)} was ${ageAtChild} at birth`,
              related: father,
            });
          }
        }
        if (fd !== null && by - fd > 1) {
          out.push({
            kind: "parent_died_before_birth",
            severity: "high",
            person: p,
            detail: `Father ${fullDisplayName(father)} died ${fd}, child born ${by}`,
            related: father,
          });
        }
      }
      if (mother && by !== null) {
        const mb = parseYear(mother.birth?.date);
        const md = parseYear(mother.death?.date);
        if (mb !== null) {
          const ageAtChild = by - mb;
          if (ageAtChild < 12 && ageAtChild >= 0) {
            out.push({
              kind: "mother_under_12_at_birth",
              severity: "high",
              person: p,
              detail: `Mother ${fullDisplayName(mother)} was ${ageAtChild} at birth`,
              related: mother,
            });
          } else if (ageAtChild > 55) {
            out.push({
              kind: "mother_over_55_at_birth",
              severity: "medium",
              person: p,
              detail: `Mother ${fullDisplayName(mother)} was ${ageAtChild} at birth`,
              related: mother,
            });
          }
        }
        if (md !== null && by - md > 0) {
          out.push({
            kind: "parent_died_before_birth",
            severity: "high",
            person: p,
            detail: `Mother ${fullDisplayName(mother)} died ${md}, child born ${by}`,
            related: mother,
          });
        }
      }
    }
    // Missing data
    if (p.parent_ids.length === 1 && !isAnchorlessPlaceholder(p)) {
      const onlyParent = peopleById[p.parent_ids[0]];
      out.push({
        kind: "missing_one_parent",
        severity: "low",
        person: p,
        detail: onlyParent
          ? `Only ${onlyParent.sex === "F" ? "mother" : "parent"} recorded: ${fullDisplayName(
              onlyParent,
            )}`
          : "Only one parent recorded",
        related: onlyParent ?? null,
      });
    }
    if (by === null && p.parent_ids.length > 0) {
      out.push({
        kind: "no_birth_year",
        severity: "medium",
        person: p,
        detail: "No usable year on birth event",
      });
    }
    if (
      dy === null &&
      by !== null &&
      !isLiving(p) &&
      new Date().getFullYear() - by >= 110
    ) {
      out.push({
        kind: "no_death_year_likely_deceased",
        severity: "low",
        person: p,
        detail: `b. ${by} — would be ${new Date().getFullYear() - by} today`,
      });
    }
    if (!p.birth?.place && p.parent_ids.length > 0) {
      out.push({
        kind: "missing_birth_place",
        severity: "low",
        person: p,
        detail: "Birth place not recorded",
      });
    }
  }
  // Duplicate-name detection
  for (const [key, group] of nameIdx.entries()) {
    if (group.length < 2) continue;
    const undated = group.filter(
      (g) => parseYear(g.birth?.date) === null && parseYear(g.death?.date) === null,
    );
    if (undated.length >= 2) {
      for (const u of undated) {
        out.push({
          kind: "duplicate_name_no_dates",
          severity: "medium",
          person: u,
          detail: `Shares name "${u.given} ${u.surname}" with ${group.length - 1} other(s) and has no dates`,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Advanced finder — composable predicates over the people array.
// ---------------------------------------------------------------------------

export interface FinderQuery {
  /** name substring match (case-insensitive) */
  text?: string;
  surname?: string;
  given?: string;
  place?: string; // matches any of birth/residence/death/burial places
  country?: string;
  sex?: "M" | "F" | "any";
  birthFrom?: number;
  birthTo?: number;
  deathFrom?: number;
  deathTo?: number;
  hasSource?: "yes" | "no" | "any";
  hasPhoto?: "yes" | "no" | "any";
  hasChildren?: "yes" | "no" | "any";
  hasParents?: "yes" | "no" | "any";
  brickWall?: boolean;
  living?: "yes" | "no" | "any";
  military?: boolean;
  immigrant?: boolean; // birth-country differs from death-country
  occupation?: string;
}

function personMatchesPlace(p: Person, needle: string): boolean {
  const n = needle.toLowerCase();
  const places = [
    p.birth?.place,
    p.death?.place,
    p.burial?.place,
    ...(p.residences ?? []).map((r) => r.place),
  ].filter(Boolean) as string[];
  return places.some((pl) => pl.toLowerCase().includes(n));
}

export function advancedFind(q: FinderQuery): Person[] {
  const text = q.text?.toLowerCase().trim();
  const surname = q.surname?.toLowerCase().trim();
  const given = q.given?.toLowerCase().trim();
  const place = q.place?.toLowerCase().trim();
  const country = q.country?.toLowerCase().trim();
  const occupation = q.occupation?.toLowerCase().trim();
  return people.filter((p) => {
    if (isAnchorlessPlaceholder(p)) return false;
    if (text) {
      const hay = `${p.given} ${p.surname} ${p.suffix ?? ""}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (surname && !p.surname.toLowerCase().includes(surname)) return false;
    if (given && !p.given.toLowerCase().includes(given)) return false;
    if (place && !personMatchesPlace(p, place)) return false;
    if (country) {
      const c = personCountry(p)?.toLowerCase();
      if (!c || !c.includes(country)) return false;
    }
    if (q.sex && q.sex !== "any") {
      if (p.sex !== q.sex) return false;
    }
    const by = parseYear(p.birth?.date);
    const dy = parseYear(p.death?.date);
    if (q.birthFrom !== undefined && (by === null || by < q.birthFrom)) return false;
    if (q.birthTo !== undefined && (by === null || by > q.birthTo)) return false;
    if (q.deathFrom !== undefined && (dy === null || dy < q.deathFrom)) return false;
    if (q.deathTo !== undefined && (dy === null || dy > q.deathTo)) return false;
    if (q.hasSource === "yes" && p.source_count <= 0) return false;
    if (q.hasSource === "no" && p.source_count > 0) return false;
    if (q.hasChildren === "yes" && p.child_ids.length === 0) return false;
    if (q.hasChildren === "no" && p.child_ids.length > 0) return false;
    if (q.hasParents === "yes" && p.parent_ids.length === 0) return false;
    if (q.hasParents === "no" && p.parent_ids.length > 0) return false;
    if (q.brickWall && (p.parent_ids.length !== 0 || p.family_child_ids.length !== 0))
      return false;
    if (q.living === "yes" && !isLiving(p)) return false;
    if (q.living === "no" && isLiving(p)) return false;
    if (q.military && !p.military) return false;
    if (occupation) {
      const occs = (p.occupations ?? []).map((o) => o.toLowerCase());
      if (!occs.some((o) => o.includes(occupation))) return false;
    }
    if (q.immigrant) {
      const bc = placeToCountry(p.birth?.place);
      const dc = placeToCountry(p.death?.place);
      if (!bc || !dc || bc === dc) return false;
    }
    return true;
  });
}

export function finderQueryToParams(q: FinderQuery): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === "" || v === "any" || v === false) continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

export function paramsToFinderQuery(qs: string): FinderQuery {
  const sp = new URLSearchParams(qs);
  const get = (k: string) => sp.get(k) ?? undefined;
  const num = (k: string) => {
    const v = sp.get(k);
    return v ? parseInt(v, 10) : undefined;
  };
  return {
    text: get("text"),
    surname: get("surname"),
    given: get("given"),
    place: get("place"),
    country: get("country"),
    sex: (get("sex") as FinderQuery["sex"]) ?? "any",
    birthFrom: num("birthFrom"),
    birthTo: num("birthTo"),
    deathFrom: num("deathFrom"),
    deathTo: num("deathTo"),
    hasSource: (get("hasSource") as FinderQuery["hasSource"]) ?? "any",
    hasChildren: (get("hasChildren") as FinderQuery["hasChildren"]) ?? "any",
    hasParents: (get("hasParents") as FinderQuery["hasParents"]) ?? "any",
    brickWall: get("brickWall") === "true",
    living: (get("living") as FinderQuery["living"]) ?? "any",
    military: get("military") === "true",
    immigrant: get("immigrant") === "true",
    occupation: get("occupation"),
  };
}

// ---------------------------------------------------------------------------
// Discoveries summary stats
// ---------------------------------------------------------------------------

export interface DiscoverStats {
  deepestLineDepth: number;
  earliestAncestorYear: number | null;
  surnamesTracked: number;
  anomalyCount: number;
  immigrantCount: number;
  militaryCount: number;
}

export function computeDiscoverStats(): DiscoverStats {
  const roots = deepestRootsBySurname();
  const earliest = earliestPerSurname(1);
  const anomalies = findAnomalies();
  let immigrantCount = 0;
  let militaryCount = 0;
  for (const p of people) {
    if (p.military) militaryCount += 1;
    const bc = placeToCountry(p.birth?.place);
    const dc = placeToCountry(p.death?.place);
    if (bc && dc && bc !== dc) immigrantCount += 1;
  }
  return {
    deepestLineDepth: roots[0]?.depth ?? 0,
    earliestAncestorYear: earliest[0]?.year ?? null,
    surnamesTracked: roots.length,
    anomalyCount: anomalies.length,
    immigrantCount,
    militaryCount,
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { paternalLine, maternalLine };
export type { LineageStep };
