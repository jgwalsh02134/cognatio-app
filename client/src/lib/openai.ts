/**
 * Browser-side OpenAI helpers for per-person research and chat.
 *
 * Uses the Responses API so we can attach the built-in `web_search` tool — the
 * same approach analyze_archive.py uses server-side.
 *
 * Two auth modes (see AiAuth):
 *  - "direct": the user supplied their own OpenAI key; we call OpenAI directly
 *    with an Authorization header. Works on static/disk builds.
 *  - "proxy": a server holds the key (e.g. OPENAI_API_KEY on Railway); we call
 *    our own /api/ai/responses endpoint with a shared access passphrase. The
 *    key never reaches the browser.
 */
import type {
  PersonWebFinding,
  WebFindingField,
  WebCorrection,
  WebConnection,
} from "@/components/WebFindingsCard";
import {
  fullDisplayName,
  getSiblings,
  isAnchorlessPlaceholder,
  lifespan,
  parseYear,
  type Person,
} from "@/lib/family";
import { linksFor } from "@/lib/researchLinks";

/** How an AI request authenticates. */
export type AiAuth =
  | { mode: "direct"; apiKey: string }
  | { mode: "proxy"; passcode: string };

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const PROXY_ENDPOINT = "/api/ai/responses";

/**
 * Ask the server whether it has a key configured (passphrase-gated proxy mode).
 * Returns false on any failure — including static deployments with no server,
 * where the client falls back to bring-your-own-key direct mode.
 */
export async function checkServerAI(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch("/api/ai/status", { signal });
    if (!res.ok) return false;
    const json = (await res.json()) as { enabled?: boolean };
    return !!json.enabled;
  } catch {
    return false;
  }
}
/**
 * Default model. As of mid-2026 OpenAI's current tiers are gpt-5.5 (flagship),
 * gpt-5.4, gpt-5.4-mini (strong mini), and gpt-5.4-nano. The gpt-4o family is
 * legacy and the *-search-preview models are scheduled for shutdown on
 * 2026-07-23. Default to gpt-5.4-mini: fast, cheap, and supports the
 * Responses API web_search tool.
 */
const DEFAULT_MODEL = "gpt-5.4-mini";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface ResponsesApiBody {
  model: string;
  input: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  tools?: Array<{ type: string }>;
  text?: {
    format: {
      type: "json_schema";
      name: string;
      schema: unknown;
      strict?: boolean;
    };
  };
  temperature?: number;
}

interface UrlCitation {
  type: "url_citation";
  url: string;
  title?: string;
  start_index?: number;
  end_index?: number;
}

interface ResponsesApiResult {
  output_text?: string;
  output?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: UrlCitation[];
    }>;
  }>;
  error?: { message?: string };
}

async function callResponsesApi(
  auth: AiAuth,
  body: ResponsesApiBody,
  signal?: AbortSignal,
): Promise<ResponsesApiResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url: string;
  if (auth.mode === "proxy") {
    url = PROXY_ENDPOINT;
    headers["x-ai-passcode"] = auth.passcode;
  } else {
    url = OPENAI_ENDPOINT;
    headers["Authorization"] = `Bearer ${auth.apiKey}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json()) as ResponsesApiResult;
  if (!res.ok) {
    const msg = json.error?.message || `OpenAI ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function extractText(resp: ResponsesApiResult): string {
  if (resp.output_text) return resp.output_text;
  if (!resp.output) return "";
  const parts: string[] = [];
  for (const o of resp.output) {
    if (o.type !== "message" || !o.content) continue;
    for (const c of o.content) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("");
}

function extractCitations(resp: ResponsesApiResult): UrlCitation[] {
  const cites: UrlCitation[] = [];
  if (!resp.output) return cites;
  for (const o of resp.output) {
    if (!o.content) continue;
    for (const c of o.content) {
      if (c.annotations) {
        for (const a of c.annotations) {
          if (a.type === "url_citation" && a.url) cites.push(a);
        }
      }
    }
  }
  return cites;
}

/** Try the `web_search` tool first, fall back to `web_search_preview` on
 *  unsupported-tool errors so older keys / regions still work. */
async function callWithWebSearch(
  auth: AiAuth,
  baseBody: Omit<ResponsesApiBody, "tools">,
  signal?: AbortSignal,
): Promise<ResponsesApiResult> {
  try {
    return await callResponsesApi(
      auth,
      { ...baseBody, tools: [{ type: "web_search" }] },
      signal,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (
      msg.includes("web_search") ||
      msg.includes("tool") ||
      msg.includes("not supported")
    ) {
      return await callResponsesApi(
        auth,
        { ...baseBody, tools: [{ type: "web_search_preview" }] },
        signal,
      );
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Per-person research
// ---------------------------------------------------------------------------

const FIELD_ENUM = [
  "birth_date", "birth_place",
  "death_date", "death_place",
  "burial_date", "burial_place",
  "occupation", "military", "education",
  "note", "parents_father", "parents_mother",
];

const RESEARCH_SYSTEM_PROMPT = `You are a working genealogy research assistant
for the Walsh, Maloy, Dugan, Cranwell family archive — an American Catholic
family primarily in Albany & Troy NY, with Irish, German, and Anglo lines
reaching back to the 1700s. This archive was merged from TWO Ancestry GEDCOM
exports, so IDs are namespaced "t0:" and "t1:" and the SAME real person often
appears twice (once under each prefix). Finding those duplicates is valuable.

You perform THREE jobs in a single pass. Use the web_search tool for job 1;
jobs 2 and 3 are mostly reasoning over the data you are given.

JOB 1 — FIND MISSING FACTS ("findings"):
- Use web_search to find CONCRETE missing facts about THIS specific person,
  not a same-named stranger. Search FindAGrave, Ancestry public trees,
  FamilySearch, obituary sites (legacy.com, dignitymemorial.com, local funeral
  homes), NYS Historic Newspapers, US census, Catholic parish records, Irish
  civil records. Try surname-variant spellings.
- Issue multiple queries. Prefer visiting the actual record/memorial/obituary
  page over a search-results page. Cite its real URL — NEVER fabricate a URL.
- Disambiguate using the FAMILY block and anchors (birth/death year, place,
  spouse, parents). Say which anchors matched in "reasoning".

JOB 2 — FLAG ERRORS ("corrections"):
- Inspect the existing values for internal contradictions or impossibilities
  and propose fixes. Examples: death before birth; born after a parent's
  death or before a parent was ~13; child born when the person was <13 or
  dead; marriage before birth; lifespan > 110 years; a place that is clearly
  malformed; a year that is an obvious typo (e.g. 1089 for 1809).
- Only flag things that are actually wrong or near-certainly wrong. Put the
  current bad value in "current_value" and the fix in "suggested_value", and
  explain in "issue". A web source is optional here.

JOB 3 — FIND CONNECTIONS ("connections"):
- Using the CANDIDATE PEOPLE list (all already in this archive), identify
  likely (a) DUPLICATES — the same real person as THIS one, especially across
  the t0:/t1: split — and (b) MISSING RELATIONSHIPS — a probable parent,
  spouse, sibling, or child of THIS person who is in the archive but not yet
  linked. Reference the candidate by the exact ID shown and put it in
  "related_id". If you propose someone NOT in the candidate list, leave
  related_id "" and name them in "related_name".
- Justify each with shared name/dates/places/relatives in "reasoning".

Output STRICT JSON matching the schema. No prose outside JSON.

Confidence:
- "high"   = 3+ matching anchors / an exact record / a near-certain duplicate
- "medium" = 2 anchors with a credible basis
- "low"    = a single weak signal but still worth a human look

NEVER invent facts or URLs. If a job yields nothing, return an empty array for
it and explain briefly in "narrative".`;

const PERSON_SCHEMA = {
  type: "json_schema" as const,
  name: "person_research",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: FIELD_ENUM },
            suggested_value: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            reasoning: { type: "string" },
            source_title: { type: "string" },
            source_url: { type: "string" },
          },
          required: [
            "field", "suggested_value", "confidence",
            "reasoning", "source_title", "source_url",
          ],
        },
      },
      corrections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: FIELD_ENUM },
            current_value: { type: "string" },
            suggested_value: { type: "string" },
            issue: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            source_title: { type: "string" },
            source_url: { type: "string" },
          },
          required: [
            "field", "current_value", "suggested_value", "issue",
            "confidence", "source_title", "source_url",
          ],
        },
      },
      connections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            relation: { type: "string" },
            related_id: { type: "string" },
            related_name: { type: "string" },
            reasoning: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: [
            "relation", "related_id", "related_name", "reasoning", "confidence",
          ],
        },
      },
      narrative: { type: "string" },
      search_log: { type: "string" },
    },
    required: ["findings", "corrections", "connections", "narrative", "search_log"],
  },
};

function personAnchors(person: Person, lookup: Map<string, string>): string {
  const parts: string[] = [`NAME: ${person.name}`, `ID: ${person.id}`];
  if (person.sex) parts.push(`SEX: ${person.sex}`);
  if (person.birth) {
    parts.push(
      `BIRTH: ${person.birth.date || "?"} @ ${person.birth.place || "?"}`,
    );
  }
  if (person.death) {
    parts.push(
      `DEATH: ${person.death.date || "?"} @ ${person.death.place || "?"}`,
    );
  }
  if (person.burial) {
    parts.push(
      `BURIAL: ${person.burial.date || "?"} @ ${person.burial.place || "?"}`,
    );
  }
  for (const r of (person.residences ?? []).slice(0, 3)) {
    parts.push(`RESIDENCE: ${r.date || "?"} @ ${r.place || "?"}`);
  }
  const occs = (person.occupations ?? []).filter(Boolean);
  if (occs.length > 0) parts.push(`OCCUPATIONS: ${occs.slice(0, 3).join("; ")}`);
  if (person.military) {
    const m = person.military;
    parts.push(
      `MILITARY: ${m.branch ?? ""} ${m.conflict ?? ""} ${m.rank ?? ""} ${
        m.unit ?? ""
      }`.trim(),
    );
  }
  if (person.parent_ids?.length) {
    parts.push(
      `PARENTS: ${person.parent_ids
        .map((id) => lookup.get(id) ?? id)
        .join("; ")}`,
    );
  }
  if (person.spouse_ids?.length) {
    parts.push(
      `SPOUSES: ${person.spouse_ids
        .map((id) => lookup.get(id) ?? id)
        .join("; ")}`,
    );
  }
  if (person.child_ids?.length) {
    parts.push(
      `CHILDREN: ${person.child_ids
        .slice(0, 6)
        .map((id) => lookup.get(id) ?? id)
        .join("; ")}`,
    );
  }
  return parts.join("\n");
}

/** Compact one-liner used in family + candidate lists. */
function relLine(p: Person): string {
  const place = p.birth?.place?.split(",")[0]?.trim();
  return `${p.id} — ${fullDisplayName(p)} (${lifespan(p)}${place ? `, ${place}` : ""})`;
}

/** Linked family already in the archive, so the model can disambiguate THIS
 *  person from same-named strangers and reason about missing links. */
function buildFamilyBlock(
  person: Person,
  getP: (id: string) => Person | undefined,
): string {
  const sections: string[] = [];
  const collect = (label: string, ids: string[] | undefined) => {
    const ppl = (ids ?? []).map(getP).filter((x): x is Person => !!x);
    if (ppl.length) sections.push(`${label}:\n` + ppl.map((p) => "  " + relLine(p)).join("\n"));
  };
  collect("PARENTS", person.parent_ids);
  collect("SPOUSES", person.spouse_ids);
  collect("CHILDREN", person.child_ids);
  const sibs = getSiblings(person).slice(0, 10);
  if (sibs.length) sections.push("SIBLINGS:\n" + sibs.map((p) => "  " + relLine(p)).join("\n"));
  return sections.length ? sections.join("\n") : "(no linked family recorded in the archive)";
}

function normName(p: Person): string {
  return `${p.given || ""} ${p.surname || ""}`
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pick archive people who might be a duplicate of, or a missing relative of,
 * THIS person — so the model has concrete, ID-referenced candidates to reason
 * about for connections. Scored by name/surname similarity, birth-year
 * proximity, and a cross-source (t0:/t1:) duplicate bonus.
 */
function connectionCandidates(person: Person, all: Person[], max = 22): Person[] {
  const selfNorm = normName(person);
  const selfSur = (person.surname || "").toLowerCase().trim();
  const by = parseYear(person.birth?.date);
  const exclude = new Set<string>([
    person.id,
    ...(person.parent_ids ?? []),
    ...(person.spouse_ids ?? []),
    ...(person.child_ids ?? []),
  ]);
  const scored: { p: Person; s: number }[] = [];
  for (const o of all) {
    if (exclude.has(o.id) || isAnchorlessPlaceholder(o)) continue;
    const oNorm = normName(o);
    const oSur = (o.surname || "").toLowerCase().trim();
    let s = 0;
    const sameName = !!selfNorm && oNorm === selfNorm;
    if (sameName) s += 5;
    else if (selfSur && oSur && oSur === selfSur) s += 2;
    else if (
      selfSur.length >= 4 &&
      oSur.length >= 4 &&
      (oSur.startsWith(selfSur.slice(0, 4)) || selfSur.startsWith(oSur.slice(0, 4)))
    )
      s += 1;
    const oby = parseYear(o.birth?.date);
    if (by && oby) {
      const d = Math.abs(by - oby);
      if (d <= 3) s += 2;
      else if (d <= 40) s += 1;
    }
    // Cross-source duplicate: same name but the other GEDCOM prefix.
    if (sameName && o.id.slice(0, 2) !== person.id.slice(0, 2)) s += 2;
    if (s >= 2) scored.push({ p: o, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.p);
}

function coreGaps(person: Person): string[] {
  const g: string[] = [];
  if (!person.birth?.date) g.push("birth_date");
  if (!person.birth?.place) g.push("birth_place");
  const byMatch = (person.birth?.date || "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  const by = byMatch ? parseInt(byMatch[0], 10) : 0;
  if (!person.death?.date && by && by < 1940) g.push("death_date");
  if (!person.death?.place && by && by < 1940) g.push("death_place");
  if (!(person.parent_ids?.length ?? 0)) g.push("parents");
  return g;
}

const ALLOWED_FIELDS = new Set<WebFindingField>([
  "birth_date", "birth_place",
  "death_date", "death_place",
  "burial_date", "burial_place",
  "occupation", "military", "education",
  "note", "parents_father", "parents_mother",
]);

export async function researchPerson(opts: {
  auth: AiAuth;
  person: Person;
  nameById: Map<string, string>;
  /** Full archive — used to build duplicate/relationship candidates. */
  allPeople?: Person[];
  model?: string;
  signal?: AbortSignal;
}): Promise<PersonWebFinding> {
  const { auth, person, nameById, allPeople = [], model = DEFAULT_MODEL, signal } = opts;
  const gaps = coreGaps(person);
  const anchors = personAnchors(person, nameById);
  const getP = (id: string) => allPeople.find((p) => p.id === id);
  const familyBlock = buildFamilyBlock(person, getP);
  const candidates = connectionCandidates(person, allPeople);
  const candidateBlock = candidates.length
    ? candidates.map((p) => "  " + relLine(p)).join("\n")
    : "(no obvious candidates found in the archive)";
  const recordUrls = linksFor(person)
    .slice(0, 6)
    .map((l) => `  ${l.label}: ${l.url}`)
    .join("\n");

  const userMsg = [
    "PERSON TO RESEARCH:",
    anchors,
    "",
    "FAMILY ALREADY LINKED IN THE ARCHIVE (use to disambiguate & to spot missing links):",
    familyBlock,
    "",
    "CANDIDATE PEOPLE IN THIS ARCHIVE (for duplicate / connection checks — reference by the exact ID shown):",
    candidateBlock,
    "",
    "PRE-BUILT RECORD SEARCHES (solid starting points for web_search):",
    recordUrls || "  (none)",
    "",
    `Detected gaps for job 1: ${gaps.join(", ") || "(use your judgment)"}`,
    "",
    "Do all three jobs. For job 1 issue at least 3 web_search queries and cite",
    "real record pages. For job 2 only flag genuine contradictions. For job 3",
    "prefer candidates from the list above and fill related_id with their ID.",
  ].join("\n");

  const body = {
    model,
    input: [
      { role: "system" as const, content: RESEARCH_SYSTEM_PROMPT },
      { role: "user" as const, content: userMsg },
    ],
    text: { format: PERSON_SCHEMA },
    temperature: 0.2,
  };
  const resp = await callWithWebSearch(auth, body, signal);
  const text = extractText(resp);
  if (!text) {
    return { findings: [], corrections: [], connections: [], narrative: "No response from model.", search_log: "" };
  }
  let parsed: PersonWebFinding;
  try {
    parsed = JSON.parse(text) as PersonWebFinding;
  } catch {
    return {
      findings: [],
      corrections: [],
      connections: [],
      narrative: text.slice(0, 500),
      search_log: "JSON parse failed",
    };
  }
  // Defense-in-depth: validate enums / required bits, drop bad rows.
  parsed.findings = (parsed.findings ?? []).filter(
    (f) => f && ALLOWED_FIELDS.has(f.field) && f.source_url,
  );
  parsed.corrections = ((parsed.corrections ?? []) as WebCorrection[]).filter(
    (c) => c && ALLOWED_FIELDS.has(c.field) && (c.suggested_value || "").trim(),
  );
  parsed.connections = ((parsed.connections ?? []) as WebConnection[]).filter(
    (c) => c && (c.related_name || c.related_id),
  );
  return parsed;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const CHAT_SYSTEM_PROMPT = `You are the AI research companion for a private
family archive (Walsh, Maloy, Dugan, Cranwell — Albany/Troy NY area, with
Irish, German, and Anglo branches reaching back to the 1700s).

You help the family historian:
- answer questions about people already in the archive (use the FAMILY DATA
  context block — IDs use the t0:/t1: namespace prefix, preserve it),
- find missing facts via web_search (FindAGrave, obituaries, US census,
  Catholic parish records, FamilySearch, Ancestry public trees, NYS Historic
  Newspapers, Irish civil records),
- find CONNECTIONS in the data: likely duplicate records (the archive was
  merged from two GEDCOMs, so the same person often appears under both a t0:
  and a t1: ID — flag these), and missing parent/spouse/sibling/child links
  between people already present,
- spot ERRORS: contradictory or impossible dates (death before birth, child
  born after a parent died or before they were ~13, lifespan > 110, obvious
  year typos), malformed places, and mismatched relationships — name the
  person(s) by ID and say what the fix should be,
- explain relationships, name variants, and historical context (e.g. typical
  immigration / military service / parish patterns for the era and place).

Style:
- Be concrete and concise. Cite source URLs whenever you assert an external
  fact. Don't speculate; say "I don't know yet" or "no record found" instead.
- When referring to someone in the archive, ALWAYS include their ID in
  parentheses so the user can navigate, e.g. "John J. Walsh (t0:I12345)".

Formatting (MANDATORY — output is rendered as GitHub-flavored Markdown):
- Use proper Markdown: short paragraphs, **bold** for names/dates, *italics*
  sparingly, \`code\` for raw values (IDs, dates as written in records).
- Use bulleted or numbered lists for any group of 2+ items, facts, or steps.
- Use ## or ### headings ONLY when the answer is long enough to need
  sections; never use # (h1).
- Use Markdown tables for tabular comparisons (people side-by-side, census
  enumerations, military service rows). Keep tables narrow — 2-4 columns.
- Use > blockquotes when quoting a record, obituary, or primary source.
- Render hyperlinks with [label](url) — never paste bare URLs in prose.
- Never wrap the whole answer in a code block. Code blocks are only for
  literal data the user might copy (GEDCOM snippets, JSON).`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  sources: { url: string; title?: string }[];
}

export async function chat(opts: {
  auth: AiAuth;
  contextBlock: string;
  history: ChatTurn[];
  userMessage: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const { auth, contextBlock, history, userMessage, model = DEFAULT_MODEL, signal } = opts;
  const systemContent =
    `${CHAT_SYSTEM_PROMPT}\n\n` +
    `--- FAMILY DATA (compact summary; refer to people by name + ID) ---\n` +
    `${contextBlock}\n--- END FAMILY DATA ---`;

  const input: ResponsesApiBody["input"] = [
    { role: "system", content: systemContent },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];

  const body = {
    model,
    input,
    temperature: 0.3,
  };
  const resp = await callWithWebSearch(auth, body, signal);
  const text = extractText(resp) || "(no response)";
  const cites = extractCitations(resp);
  // Deduplicate by URL
  const seen = new Set<string>();
  const sources: { url: string; title?: string }[] = [];
  for (const c of cites) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    sources.push({ url: c.url, title: c.title });
  }
  return { text, sources };
}

// ---------------------------------------------------------------------------
// Compact archive summary for chat context
// ---------------------------------------------------------------------------

/** One line per person, ~150 chars. Keeps prompts < ~80KB for 324 people. */
export function buildArchiveSummary(people: Person[]): string {
  const lines = people.map((p) => {
    const bits: string[] = [];
    bits.push(`${p.id} ${p.name}`);
    if (p.sex) bits.push(`(${p.sex})`);
    const bd = p.birth?.date ?? "";
    const bp = p.birth?.place ?? "";
    if (bd || bp) bits.push(`b.${bd}${bp ? ` ${bp}` : ""}`);
    const dd = p.death?.date ?? "";
    const dp = p.death?.place ?? "";
    if (dd || dp) bits.push(`d.${dd}${dp ? ` ${dp}` : ""}`);
    if (p.military?.branch) {
      bits.push(`mil:${p.military.branch}${p.military.conflict ? `/${p.military.conflict}` : ""}`);
    }
    if (p.parent_ids?.length) bits.push(`par:${p.parent_ids.join(",")}`);
    if (p.spouse_ids?.length) bits.push(`sp:${p.spouse_ids.join(",")}`);
    return bits.join(" | ");
  });
  return lines.join("\n");
}
