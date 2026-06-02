// Research deep-link generators.
//
// Static SPA constraint: we cannot call FamilySearch / Ancestry APIs directly
// (both require an OAuth token + a backend to hold the secret). Instead, we
// pre-fill their public *search forms* with everything we know about a person
// so the user lands one click away from the answer.
//
// All functions return a fully-qualified URL. Country-specific links are only
// returned by `linksFor()` when the person is plausibly from that country.

import {
  fullDisplayName,
  parseYear,
  personCountry,
  type Person,
} from "./family";

export interface ResearchLink {
  /** Stable id for keying lists. */
  id: string;
  /** Short label shown on the button. */
  label: string;
  /** Tooltip / longer explanation. */
  hint: string;
  /** ISO 3166-1 alpha-2 / ISO 3166-2 country code shown as a typographic chip. */
  countryCode?: string;
  /** Country display name (used to resolve a flag image via CountryFlag). */
  countryName?: string;
  /** Fully-qualified URL. */
  url: string;
  /** Visual category used to style the chip. */
  group: "tree" | "records" | "graves" | "newspapers" | "country";
}

function yearAround(p: Person, span = 2): { from?: number; to?: number } {
  const by = parseYear(p.birth?.date);
  if (by === null) return {};
  return { from: by - span, to: by + span };
}

function fsSearch(p: Person): string {
  const params = new URLSearchParams();
  if (p.given) params.set("q.givenName", p.given);
  if (p.surname) params.set("q.surname", p.surname);
  const { from, to } = yearAround(p);
  if (from) params.set("q.birthLikeDate.from", String(from));
  if (to) params.set("q.birthLikeDate.to", String(to));
  if (p.birth?.place) params.set("q.birthLikePlace", p.birth.place);
  if (p.death?.place) params.set("q.deathLikePlace", p.death.place);
  const dy = parseYear(p.death?.date);
  if (dy) {
    params.set("q.deathLikeDate.from", String(dy - 2));
    params.set("q.deathLikeDate.to", String(dy + 2));
  }
  // FamilySearch's 2025 search overhaul retired "/search/record/results"
  // (it now 404s); the current records search is "/search/records/results".
  return `https://www.familysearch.org/search/records/results?${params.toString()}`;
}

function fsTreePersonSearch(p: Person): string {
  // FamilySearch Tree person search via the "find" UI
  const params = new URLSearchParams();
  if (p.given) params.set("self.givenName", p.given);
  if (p.surname) params.set("self.surname", p.surname);
  const by = parseYear(p.birth?.date);
  if (by) params.set("self.birthLikeDate", String(by));
  if (p.birth?.place) params.set("self.birthLikePlace", p.birth.place);
  return `https://www.familysearch.org/tree/find/name?${params.toString()}`;
}

function ancestrySearch(p: Person): string {
  const params = new URLSearchParams();
  if (p.given) params.set("name", p.given);
  if (p.surname) params.set("name_x", "_1");
  if (p.surname) params.set("surname", p.surname);
  const by = parseYear(p.birth?.date);
  if (by) params.set("birth", String(by));
  if (p.birth?.place) params.set("birth_place", p.birth.place);
  return `https://www.ancestry.com/search/?${params.toString()}`;
}

function findAGraveSearch(p: Person): string {
  const params = new URLSearchParams();
  if (p.given) params.set("firstname", p.given);
  if (p.surname) params.set("lastname", p.surname);
  const by = parseYear(p.birth?.date);
  const dy = parseYear(p.death?.date);
  if (by) params.set("birthyear", String(by));
  if (dy) params.set("deathyear", String(dy));
  return `https://www.findagrave.com/memorial/search?${params.toString()}`;
}

function googleSearch(p: Person, extra: string[] = []): string {
  const parts = [`"${fullDisplayName(p)}"`, ...extra];
  const by = parseYear(p.birth?.date);
  const dy = parseYear(p.death?.date);
  if (by) parts.push(String(by));
  if (dy) parts.push(String(dy));
  if (p.birth?.place) parts.push(`"${p.birth.place}"`);
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
}

function newspapersSearch(p: Person): string {
  const params = new URLSearchParams();
  params.set("query", `${p.given || ""} ${p.surname || ""}`.trim());
  const dy = parseYear(p.death?.date);
  if (dy) {
    params.set("dr_year", `${dy - 1} - ${dy + 1}`);
  }
  return `https://www.newspapers.com/search/?${params.toString()}`;
}

function usCensusSearch(p: Person): string {
  // FamilySearch US Census collection (1790-1950)
  const params = new URLSearchParams();
  params.set("collection_id", "1888129"); // US census collections umbrella
  if (p.given) params.set("q.givenName", p.given);
  if (p.surname) params.set("q.surname", p.surname);
  const by = parseYear(p.birth?.date);
  if (by) {
    params.set("q.birthLikeDate.from", String(by - 2));
    params.set("q.birthLikeDate.to", String(by + 2));
  }
  return `https://www.familysearch.org/search/records/results?${params.toString()}`;
}

function irishGenealogySearch(p: Person): string {
  // The state's free civil-records site
  return "https://civilrecords.irishgenealogy.ie/churchrecords/civil-search.jsp?namefm=" +
    encodeURIComponent(p.given || "") +
    "&namel=" + encodeURIComponent(p.surname || "");
}

function scotlandsPeopleSearch(p: Person): string {
  return "https://www.scotlandspeople.gov.uk/record-results?surname=" +
    encodeURIComponent(p.surname || "") +
    "&forename=" + encodeURIComponent(p.given || "");
}

function archionSearch(p: Person): string {
  return "https://www.archion.de/de/search/?q=" +
    encodeURIComponent(`${p.given || ""} ${p.surname || ""}`.trim());
}

function libraryArchivesCanadaSearch(p: Person): string {
  return "https://www.bac-lac.gc.ca/eng/Pages/results.aspx?k=" +
    encodeURIComponent(`${p.given || ""} ${p.surname || ""}`.trim());
}

/**
 * Build a country/era-aware list of research deep-links for a person.
 * Generic ones are always present; country-specific ones are appended only
 * when the person's recorded country matches.
 */
export function linksFor(p: Person): ResearchLink[] {
  const links: ResearchLink[] = [
    { id: "fs-records", label: "FamilySearch records", hint: "Pre-filled record search", url: fsSearch(p), group: "records" },
    { id: "fs-tree",    label: "FamilySearch tree",    hint: "Look for an existing tree match", url: fsTreePersonSearch(p), group: "tree" },
    { id: "ancestry",   label: "Ancestry",             hint: "Pre-filled Ancestry record search", url: ancestrySearch(p), group: "records" },
    { id: "google",     label: "Google",               hint: "Wide net web search", url: googleSearch(p, ["genealogy"]), group: "records" },
  ];

  // Death/burial helpers
  const by = parseYear(p.birth?.date);
  const yearsAlive = by ? new Date().getFullYear() - by : 0;
  if (p.death?.date || p.burial?.date || yearsAlive >= 90) {
    links.push({ id: "findagrave", label: "FindAGrave", hint: "Headstone & cemetery records", url: findAGraveSearch(p), group: "graves" });
    links.push({ id: "newspapers", label: "Newspapers.com", hint: "Obituaries & clippings", url: newspapersSearch(p), group: "newspapers" });
  }

  const country = personCountry(p);
  if (country === "United States" && by && by >= 1830 && by <= 1950) {
    links.push({ id: "us-census", label: "US Census", hint: "FamilySearch US census collections", url: usCensusSearch(p), group: "country", countryCode: "US", countryName: "United States" });
  }
  if (country === "Ireland") {
    links.push({ id: "ie-civil", label: "IrishGenealogy.ie", hint: "State civil records (free)", url: irishGenealogySearch(p), group: "country", countryCode: "IE", countryName: "Ireland" });
  }
  if (country === "Scotland") {
    links.push({ id: "scotpeople", label: "ScotlandsPeople", hint: "Scottish vital records", url: scotlandsPeopleSearch(p), group: "country", countryCode: "GB-SCT", countryName: "Scotland" });
  }
  if (country === "Germany" || country === "Austria") {
    links.push({ id: "archion", label: "Archion", hint: "German/Austrian church books", url: archionSearch(p), group: "country", countryCode: "DE", countryName: "Germany" });
  }
  if (country === "Canada") {
    links.push({ id: "lac", label: "Library & Archives Canada", hint: "Canadian government records", url: libraryArchivesCanadaSearch(p), group: "country", countryCode: "CA", countryName: "Canada" });
  }

  return links;
}

/** Plain "John Walsh 1891 Albany New York" string for paste-into-anything. */
export function copySearchString(p: Person): string {
  const parts: string[] = [];
  if (p.given || p.surname) parts.push(`${p.given || ""} ${p.surname || ""}`.trim());
  const by = parseYear(p.birth?.date);
  const dy = parseYear(p.death?.date);
  if (by) parts.push(String(by));
  if (dy) parts.push(`d. ${dy}`);
  if (p.birth?.place) parts.push(p.birth.place);
  return parts.join(" — ");
}
