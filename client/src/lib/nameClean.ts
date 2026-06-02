// Deterministic name cleanup helpers.
//
// Genealogy data merged from GEDCOMs is full of name noise that quietly breaks
// matching, sorting, and duplicate detection: ALL-CAPS surnames, lowercase
// fragments, 19th-century abbreviations ("Wm.", "Jas."), stray quotes/commas,
// and double spaces. These helpers normalize names and surface concrete,
// one-click fixes the editor can stage. Everything here is pure + offline —
// no AI, no network — so it is reliable and instant.

/** Common 18-19c given-name abbreviations → modern full form. */
const GIVEN_ABBREVIATIONS: Record<string, string> = {
  wm: "William",
  jas: "James",
  jos: "Joseph",
  chas: "Charles",
  thos: "Thomas",
  geo: "George",
  jno: "John",
  jn: "John",
  robt: "Robert",
  rob: "Robert",
  edw: "Edward",
  edwd: "Edward",
  saml: "Samuel",
  benj: "Benjamin",
  danl: "Daniel",
  richd: "Richard",
  rich: "Richard",
  fredk: "Frederick",
  fred: "Frederick",
  alexr: "Alexander",
  alex: "Alexander",
  patk: "Patrick",
  pat: "Patrick",
  michl: "Michael",
  nichs: "Nicholas",
  jere: "Jeremiah",
  hy: "Henry",
  hen: "Henry",
  // Female
  margt: "Margaret",
  marg: "Margaret",
  eliz: "Elizabeth",
  elizth: "Elizabeth",
  cath: "Catherine",
  cathe: "Catherine",
  catho: "Catherine",
  ann: "Ann",
  cathne: "Catherine",
  saraht: "Sarah",
  marya: "Mary",
};

/** Particles that stay lowercase mid-name unless they lead. */
const LOWER_PARTICLES = new Set([
  "de", "del", "della", "der", "van", "von", "da", "di", "du", "la", "le",
  "vander", "ten", "ter",
]);

/** Suffixes that should keep a canonical capitalization. */
const SUFFIX_CANON: Record<string, string> = {
  jr: "Jr.",
  "jr.": "Jr.",
  sr: "Sr.",
  "sr.": "Sr.",
  ii: "II",
  iii: "III",
  iv: "IV",
  v: "V",
  esq: "Esq.",
  "esq.": "Esq.",
};

/** Title-case one token, honoring Mc/Mac/O'/D'/hyphens and Roman-numeral-ish. */
function titleCaseToken(token: string, isFirst: boolean): string {
  if (!token) return token;
  const lower = token.toLowerCase();

  // Mid-name particles ("van", "de") stay lowercase unless they lead.
  if (!isFirst && LOWER_PARTICLES.has(lower)) return lower;

  // Hyphenated: Title-case each part (Anne-Marie, Smith-Jones).
  if (token.includes("-")) {
    return token
      .split("-")
      .map((p) => titleCaseToken(p, true))
      .join("-");
  }

  // Apostrophe: O'Brien, D'Arcy — capitalize the letter after the apostrophe.
  if (lower.includes("'")) {
    return lower
      .split("'")
      .map((p, i) => (i === 0 ? cap(p) : cap(p)))
      .join("'");
  }

  // "Mc"/"Mac" Gaelic prefixes → McDonald, MacArthur.
  if (lower.startsWith("mc") && lower.length > 2) {
    return "Mc" + cap(lower.slice(2));
  }
  if (lower.startsWith("mac") && lower.length > 4) {
    // Avoid butchering names like "Mack"; only when a real second syllable.
    return "Mac" + cap(lower.slice(3));
  }

  return cap(lower);
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Strip stray punctuation/quotes and collapse internal whitespace. */
export function cleanWhitespacePunct(s: string): string {
  return s
    .replace(/["""'']/g, (m) => (m === "'" || m === "\u2019" ? "'" : "")) // keep apostrophes, drop quotes
    .replace(/\s*,\s*$/g, "") // trailing comma
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-case a full multi-token name string (given or surname). */
export function titleCaseName(input: string): string {
  const cleaned = cleanWhitespacePunct(input);
  if (!cleaned) return cleaned;
  const tokens = cleaned.split(" ");
  return tokens.map((t, i) => titleCaseToken(t, i === 0)).join(" ");
}

/** Expand known abbreviations token-by-token within a given name. */
export function expandAbbreviations(given: string): string {
  const cleaned = cleanWhitespacePunct(given);
  if (!cleaned) return cleaned;
  return cleaned
    .split(" ")
    .map((t) => {
      const key = t.toLowerCase().replace(/\.$/, "");
      return GIVEN_ABBREVIATIONS[key] ?? t;
    })
    .join(" ");
}

/** Canonicalize a suffix string (jr → Jr., iii → III). */
export function canonicalSuffix(suffix: string): string {
  const cleaned = cleanWhitespacePunct(suffix);
  if (!cleaned) return cleaned;
  const key = cleaned.toLowerCase();
  return SUFFIX_CANON[key] ?? cleaned;
}

/** The fully normalized form of a name part (case + whitespace + punct). */
export function normalizeNamePart(input: string): string {
  return titleCaseName(input);
}

export interface NameFix {
  /** Which field this fix targets. */
  field: "given" | "surname" | "suffix";
  /** Human label for the issue. */
  issue: string;
  /** Current value. */
  current: string;
  /** Proposed value. */
  suggested: string;
}

/**
 * Detect concrete, fixable problems with a person's name parts and return the
 * suggested replacement for each. Only emits a fix when the suggestion differs
 * from the current value, so an all-clean name yields an empty array.
 */
export function detectNameFixes(p: {
  given: string;
  surname: string;
  suffix: string;
}): NameFix[] {
  const fixes: NameFix[] = [];

  const checkPart = (
    field: NameFix["field"],
    value: string,
    canon: (s: string) => string,
  ) => {
    const current = value ?? "";
    if (!current.trim()) return;
    const suggested = canon(current);
    if (suggested && suggested !== current) {
      let issue = "Normalize spelling";
      if (current === current.toUpperCase() && /[A-Z]{2,}/.test(current)) {
        issue = "All-caps — restore mixed case";
      } else if (current === current.toLowerCase() && /[a-z]/.test(current)) {
        issue = "All-lowercase — capitalize";
      } else if (/\s{2,}|^\s|\s$|,/.test(current)) {
        issue = "Stray spacing or punctuation";
      } else if (/["""]/.test(current)) {
        issue = "Stray quotation marks";
      }
      fixes.push({ field, issue, current, suggested });
    }
  };

  // Given: first expand abbreviations, then title-case.
  const givenExpanded = expandAbbreviations(p.given);
  const givenCanon = titleCaseName(givenExpanded);
  if (givenCanon && givenCanon !== (p.given ?? "")) {
    const abbrevChanged = givenExpanded !== cleanWhitespacePunct(p.given ?? "");
    fixes.push({
      field: "given",
      issue: abbrevChanged ? "Expand abbreviation (e.g. Wm. → William)" : namePartIssue(p.given),
      current: p.given ?? "",
      suggested: givenCanon,
    });
  }

  checkPart("surname", p.surname, titleCaseName);
  checkPart("suffix", p.suffix, canonicalSuffix);

  return fixes;
}

function namePartIssue(current: string): string {
  if (current === current.toUpperCase() && /[A-Z]{2,}/.test(current)) {
    return "All-caps — restore mixed case";
  }
  if (current === current.toLowerCase() && /[a-z]/.test(current)) {
    return "All-lowercase — capitalize";
  }
  if (/\s{2,}|^\s|\s$|,/.test(current)) return "Stray spacing or punctuation";
  return "Normalize spelling";
}

/**
 * A normalized comparison key for a name — lowercased, de-punctuated, with
 * abbreviations expanded — used to detect cross-record duplicates regardless
 * of casing/abbreviation noise.
 */
export function nameKey(given: string, surname: string): string {
  const g = expandAbbreviations(given || "").toLowerCase();
  const s = (surname || "").toLowerCase();
  return `${g} ${s}`
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
