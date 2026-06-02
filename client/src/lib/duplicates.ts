// Deterministic duplicate detection + merge planning.
//
// This archive was reconciled from two Ancestry GEDCOM exports (the t0:/t1:
// namespaces), so the same real person frequently exists twice. This module
// finds likely duplicate PAIRS by scoring name/date/place/relative overlap —
// no AI, no network — and builds a field-level "absorb" merge plan the v1
// editor can stage (consolidate field data onto a chosen canonical record).
//
// NOTE: v1 edits are field-only — it cannot yet repoint relationships or
// delete a record, so a structural tree merge still needs a follow-up patch
// script. Absorbing consolidates the *data* and tags both records so that
// cleanup is unambiguous.

import {
  isAnchorlessPlaceholder,
  parseYear,
  people,
  type EventInfo,
  type Person,
} from "@/lib/family";
import { nameKey } from "@/lib/nameClean";
import type { PersonPatch } from "@/components/EditContext";

export interface DuplicatePair {
  a: Person;
  b: Person;
  score: number;
  reasons: string[];
}

function firstPlaceToken(place?: string | null): string {
  return (place ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
}

function sharesAny(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

/** Score a single ordered pair. Returns null when clearly not a duplicate. */
function scorePair(a: Person, b: Person): { score: number; reasons: string[] } | null {
  // Already linked as parent/child/spouse → a relationship, not a duplicate.
  if (
    a.parent_ids?.includes(b.id) ||
    b.parent_ids?.includes(a.id) ||
    a.spouse_ids?.includes(b.id) ||
    a.child_ids?.includes(b.id) ||
    b.child_ids?.includes(a.id)
  ) {
    return null;
  }

  const reasons: string[] = [];
  let score = 0;

  const keyA = nameKey(a.given, a.surname);
  const keyB = nameKey(b.given, b.surname);
  const sameName = !!keyA && keyA === keyB;
  const surA = (a.surname || "").toLowerCase().trim();
  const surB = (b.surname || "").toLowerCase().trim();
  const givenA = (a.given || "").toLowerCase().trim().split(/\s+/)[0] ?? "";
  const givenB = (b.given || "").toLowerCase().trim().split(/\s+/)[0] ?? "";

  if (sameName) {
    score += 5;
    reasons.push("Identical name");
  } else {
    if (surA && surB && surA === surB) {
      score += 2;
    } else if (
      surA.length >= 4 &&
      surB.length >= 4 &&
      (surA.startsWith(surB.slice(0, 4)) || surB.startsWith(surA.slice(0, 4)))
    ) {
      score += 1;
      reasons.push("Similar surname");
    } else {
      // Different family names → not a duplicate worth surfacing.
      return null;
    }
    if (givenA && givenB && givenA === givenB) {
      score += 1;
      reasons.push("Same first name");
    }
  }

  const by = parseYear(a.birth?.date);
  const oby = parseYear(b.birth?.date);
  if (by && oby) {
    const d = Math.abs(by - oby);
    if (d <= 2) {
      score += 3;
      reasons.push(`Birth years match (${by}/${oby})`);
    } else if (d <= 10) {
      score += 1;
    } else if (d > 15 && sameName) {
      // Same name but 15+ years apart → likely father/son, namesakes.
      score -= 3;
      reasons.push(`Birth years far apart (${by} vs ${oby})`);
    }
  }

  const dy = parseYear(a.death?.date);
  const ody = parseYear(b.death?.date);
  if (dy && ody && Math.abs(dy - ody) <= 2) {
    score += 2;
    reasons.push("Death years match");
  }

  if (firstPlaceToken(a.birth?.place) && firstPlaceToken(a.birth?.place) === firstPlaceToken(b.birth?.place)) {
    score += 1;
    reasons.push("Same birth place");
  }

  if (sharesAny(a.parent_ids, b.parent_ids)) {
    score += 2;
    reasons.push("Shared parent");
  }
  if (sharesAny(a.spouse_ids, b.spouse_ids)) {
    score += 2;
    reasons.push("Shared spouse");
  }
  if (sharesAny(a.child_ids, b.child_ids)) {
    score += 2;
    reasons.push("Shared child");
  }

  // Cross-source duplicate: same name but the OTHER GEDCOM prefix.
  if (sameName && a.id.slice(0, 2) !== b.id.slice(0, 2)) {
    score += 2;
    reasons.push("Across both source files");
  }

  return { score, reasons };
}

/**
 * Find likely duplicate pairs across the whole archive, ranked by confidence.
 * `min` is the score threshold; defaults to 6 (≈ identical name + a date or
 * relative match) to keep precision high.
 */
export function findDuplicatePairs(opts?: { min?: number; limit?: number }): DuplicatePair[] {
  const min = opts?.min ?? 6;
  const candidates = people.filter((p) => !isAnchorlessPlaceholder(p));
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      // Cheap prefilter: must share at least a surname signal.
      const surA = (a.surname || "").toLowerCase().trim();
      const surB = (b.surname || "").toLowerCase().trim();
      if (!surA || !surB) continue;
      if (surA[0] !== surB[0]) continue; // first letter must match to bother scoring
      const res = scorePair(a, b);
      if (res && res.score >= min) {
        pairs.push({ a, b, score: res.score, reasons: res.reasons });
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return opts?.limit ? pairs.slice(0, opts.limit) : pairs;
}

export function confidenceLabel(score: number): "high" | "medium" | "low" {
  if (score >= 9) return "high";
  if (score >= 7) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Merge planning
// ---------------------------------------------------------------------------

export type MergeFieldKey =
  | "given"
  | "surname"
  | "suffix"
  | "sex"
  | "birth.date"
  | "birth.place"
  | "death.date"
  | "death.place"
  | "burial.date"
  | "burial.place";

export const MERGE_FIELD_LABELS: Record<MergeFieldKey, string> = {
  given: "Given name",
  surname: "Surname",
  suffix: "Suffix",
  sex: "Sex",
  "birth.date": "Birth date",
  "birth.place": "Birth place",
  "death.date": "Death date",
  "death.place": "Death place",
  "burial.date": "Burial date",
  "burial.place": "Burial place",
};

const SCALAR_KEYS: MergeFieldKey[] = [
  "given", "surname", "suffix", "sex",
  "birth.date", "birth.place",
  "death.date", "death.place",
  "burial.date", "burial.place",
];

function getScalar(p: Person, key: MergeFieldKey): string {
  switch (key) {
    case "given": return p.given || "";
    case "surname": return p.surname || "";
    case "suffix": return p.suffix || "";
    case "sex": return p.sex || "";
    case "birth.date": return p.birth?.date || "";
    case "birth.place": return p.birth?.place || "";
    case "death.date": return p.death?.date || "";
    case "death.place": return p.death?.place || "";
    case "burial.date": return p.burial?.date || "";
    case "burial.place": return p.burial?.place || "";
  }
}

export type MergeRowStatus = "fill" | "conflict" | "same" | "only-canonical" | "only-none";

export interface MergeRow {
  key: MergeFieldKey;
  label: string;
  canonical: string;
  duplicate: string;
  status: MergeRowStatus;
}

/** Per-field comparison between the chosen canonical record and the duplicate. */
export function mergeRows(canonical: Person, dup: Person): MergeRow[] {
  return SCALAR_KEYS.map((key) => {
    const c = getScalar(canonical, key);
    const d = getScalar(dup, key);
    let status: MergeRowStatus;
    if (!c && !d) status = "only-none";
    else if (c && !d) status = "only-canonical";
    else if (!c && d) status = "fill";
    else status = c.trim() === d.trim() ? "same" : "conflict";
    return { key, label: MERGE_FIELD_LABELS[key], canonical: c, duplicate: d, status };
  }).filter((r) => r.status !== "only-none");
}

function withEvent(base: EventInfo | null | undefined, key: "date" | "place", value: string): EventInfo {
  return {
    date: key === "date" ? value : base?.date ?? null,
    place: key === "place" ? value : base?.place ?? null,
    note: base?.note ?? null,
  };
}

function uniqStrings(a: string[] | undefined, b: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...(a ?? []), ...(b ?? [])]) {
    const key = (v ?? "").trim().toLowerCase();
    if (!v || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function uniqEvents(a: EventInfo[] | undefined, b: EventInfo[] | undefined): EventInfo[] {
  const out: EventInfo[] = [];
  const seen = new Set<string>();
  for (const e of [...(a ?? []), ...(b ?? [])]) {
    const key = `${e?.date ?? ""}|${e?.place ?? ""}`.toLowerCase().trim();
    if (key === "|" || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * Build the staged edit that absorbs the duplicate's data into the canonical
 * record. Gaps on the canonical are filled from the duplicate; list fields
 * (occupations, residences, educations, notes) are unioned. Conflicting scalar
 * values are kept on the canonical UNLESS the key is in `takeFromDup`.
 * A provenance note is appended so the merge is auditable.
 */
export function buildAbsorbPatch(
  canonical: Person,
  dup: Person,
  takeFromDup: Set<MergeFieldKey>,
): PersonPatch {
  const patch: PersonPatch = {};
  const rows = mergeRows(canonical, dup);

  // Helper to set a scalar/event key onto the patch.
  const setKey = (key: MergeFieldKey, value: string) => {
    switch (key) {
      case "given": patch.given = value; break;
      case "surname": patch.surname = value; break;
      case "suffix": patch.suffix = value; break;
      case "sex": patch.sex = value || null; break;
      case "birth.date": patch.birth = withEvent(patch.birth ?? canonical.birth, "date", value); break;
      case "birth.place": patch.birth = withEvent(patch.birth ?? canonical.birth, "place", value); break;
      case "death.date": patch.death = withEvent(patch.death ?? canonical.death, "date", value); break;
      case "death.place": patch.death = withEvent(patch.death ?? canonical.death, "place", value); break;
      case "burial.date": patch.burial = withEvent(patch.burial ?? canonical.burial, "date", value); break;
      case "burial.place": patch.burial = withEvent(patch.burial ?? canonical.burial, "place", value); break;
    }
  };

  for (const row of rows) {
    if (row.status === "fill") setKey(row.key, row.duplicate);
    else if (row.status === "conflict" && takeFromDup.has(row.key)) setKey(row.key, row.duplicate);
  }

  // Union list fields when the duplicate adds anything.
  const occ = uniqStrings(canonical.occupations, dup.occupations);
  if (occ.length > (canonical.occupations?.length ?? 0)) patch.occupations = occ;
  const res = uniqEvents(canonical.residences, dup.residences);
  if (res.length > (canonical.residences?.length ?? 0)) patch.residences = res;
  const edu = uniqEvents(canonical.educations, dup.educations);
  if (edu.length > (canonical.educations?.length ?? 0)) patch.educations = edu;

  const provenance = `Merged data absorbed from duplicate ${dup.id} (${dup.name}). Review for structural removal.`;
  const baseNotes = canonical.notes ?? [];
  if (!baseNotes.some((n) => n.includes(`duplicate ${dup.id}`))) {
    patch.notes = [...baseNotes, provenance];
  }

  return patch;
}

/** Tag the duplicate record so the redundancy is recorded for cleanup. */
export function buildDuplicateTagPatch(dup: Person, canonical: Person): PersonPatch {
  const tag = `Likely duplicate of ${canonical.id} (${canonical.name}). Data absorbed into that record.`;
  const baseNotes = dup.notes ?? [];
  if (baseNotes.some((n) => n.includes(`duplicate of ${canonical.id}`))) return {};
  return { notes: [...baseNotes, tag] };
}
