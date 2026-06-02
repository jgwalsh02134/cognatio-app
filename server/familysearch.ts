/**
 * FamilySearch API integration — server-side only.
 *
 * Authentication model: Owner-token / refresh-token flow.
 *   A trusted family member generates a long-lived refresh token once via the
 *   FamilySearch OAuth2 device-code or authorization-code flow (see
 *   developers.familysearch.org). That refresh token is stored in
 *   FAMILYSEARCH_REFRESH_TOKEN. This module exchanges it for a short-lived
 *   access token (typically 1 hour) and caches it in memory. When the access
 *   token expires the next request silently refreshes it.
 *
 *   Token exchange endpoint:
 *     POST https://ident.familysearch.org/cis-web/oauth2/v3/token
 *     grant_type=refresh_token
 *     client_id=<FAMILYSEARCH_CLIENT_ID>
 *     client_secret=<FAMILYSEARCH_CLIENT_SECRET>
 *     refresh_token=<FAMILYSEARCH_REFRESH_TOKEN>
 *
 *   The access token is NEVER sent to the browser — all FamilySearch calls
 *   happen here on the server and only the normalized result is returned.
 *
 * Environment variables:
 *   FAMILYSEARCH_CLIENT_ID      — OAuth2 client id from developers.familysearch.org
 *   FAMILYSEARCH_CLIENT_SECRET  — OAuth2 client secret
 *   FAMILYSEARCH_REFRESH_TOKEN  — Long-lived refresh token for the family account
 *   FAMILYSEARCH_ENV            — "prod" (default) or "beta"
 *
 * Rate limits / ToS:
 *   FamilySearch throttles unauthenticated calls aggressively. Authenticated
 *   calls are more generous but still subject to per-app quotas. This module
 *   caps results at 10 and never retries on 429 — the route layer's existing
 *   per-IP rate limiter provides a first line of defence.
 *   Always comply with the FamilySearch Terms of Service:
 *   https://www.familysearch.org/terms
 */

const FS_IDENT_URL = "https://ident.familysearch.org/cis-web/oauth2/v3/token";

function fsApiBase(): string {
  return process.env.FAMILYSEARCH_ENV === "beta"
    ? "https://apibeta.familysearch.org"
    : "https://api.familysearch.org";
}

/** True only when all three required env vars are present. */
export function familySearchEnabled(): boolean {
  return !!(
    process.env.FAMILYSEARCH_CLIENT_ID &&
    process.env.FAMILYSEARCH_CLIENT_SECRET &&
    process.env.FAMILYSEARCH_REFRESH_TOKEN
  );
}

// ---------------------------------------------------------------------------
// In-memory access-token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  /** Unix ms when the token expires (conservative: 5 min before actual expiry). */
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/** Exchange the stored refresh token for a fresh access token. */
async function refreshAccessToken(): Promise<string> {
  const clientId = process.env.FAMILYSEARCH_CLIENT_ID!;
  const clientSecret = process.env.FAMILYSEARCH_CLIENT_SECRET!;
  const refreshToken = process.env.FAMILYSEARCH_REFRESH_TOKEN!;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(FS_IDENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FamilySearch token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!json.access_token) {
    throw new Error(
      `FamilySearch token response missing access_token: ${json.error ?? ""} ${json.error_description ?? ""}`.trim(),
    );
  }

  // Cache with a 5-minute safety margin before the stated expiry.
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (expiresIn - 300) * 1000,
  };

  return json.access_token;
}

/** Return a valid access token, refreshing if stale. Never throws on its own —
 *  callers should catch and handle. */
async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  return refreshAccessToken();
}

// ---------------------------------------------------------------------------
// Normalized result types
// ---------------------------------------------------------------------------

export interface FsEventInfo {
  date?: string;
  place?: string;
}

export interface FsCandidate {
  fsId: string;
  name: string;
  sex: string;
  birth?: FsEventInfo;
  death?: FsEventInfo;
  url: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Raw FamilySearch API shapes (minimal — only what we use)
// ---------------------------------------------------------------------------

interface FsDisplayFact {
  type?: string;
  date?: string;
  place?: string;
}

interface FsDisplayPerson {
  id?: string;
  name?: string;
  gender?: string;
  lifespan?: string;
  birthPlace?: string;
  deathPlace?: string;
  facts?: FsDisplayFact[];
}

interface FsSearchEntry {
  id?: string;
  score?: number;
  content?: {
    gedcomx?: {
      persons?: Array<{
        id?: string;
        gender?: { type?: string };
        names?: Array<{
          nameForms?: Array<{ fullText?: string }>;
        }>;
        facts?: Array<{
          type?: string;
          date?: { original?: string };
          place?: { original?: string };
        }>;
      }>;
    };
  };
  displayProperties?: FsDisplayPerson;
}

interface FsSearchResponse {
  entries?: FsSearchEntry[];
  results?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchInput {
  given?: string;
  surname?: string;
  birthYear?: number | string;
  deathYear?: number | string;
  birthPlace?: string;
  deathPlace?: string;
}

function buildSearchParams(input: SearchInput): URLSearchParams {
  const p = new URLSearchParams();
  // FamilySearch Record Search API query parameters:
  // https://www.familysearch.org/developers/docs/api/tree/Search_for_Persons_in_the_FamilySearch_Tree_resource
  const parts: string[] = [];
  if (input.given) parts.push(`givenName:${input.given}`);
  if (input.surname) parts.push(`surname:${input.surname}`);
  if (input.birthYear) parts.push(`birthLikeYear:${input.birthYear}~`);
  if (input.deathYear) parts.push(`deathLikeYear:${input.deathYear}~`);
  if (input.birthPlace) parts.push(`birthLikePlace:${input.birthPlace}`);
  if (input.deathPlace) parts.push(`deathLikePlace:${input.deathPlace}`);
  if (parts.length > 0) p.set("q", parts.join(" "));
  p.set("count", "10");
  return p;
}

function normalizeSex(raw: string | undefined): string {
  if (!raw) return "U";
  const u = raw.toUpperCase();
  if (u.includes("MALE") && !u.includes("FEMALE")) return "M";
  if (u.includes("FEMALE")) return "F";
  return "U";
}

function extractFact(
  facts: Array<{ type?: string; date?: { original?: string }; place?: { original?: string } }> | undefined,
  typeFragment: string,
): FsEventInfo | undefined {
  if (!facts) return undefined;
  const f = facts.find((x) => (x.type ?? "").toLowerCase().includes(typeFragment.toLowerCase()));
  if (!f) return undefined;
  const result: FsEventInfo = {};
  if (f.date?.original) result.date = f.date.original;
  if (f.place?.original) result.place = f.place.original;
  return Object.keys(result).length > 0 ? result : undefined;
}

function entryToCandidate(entry: FsSearchEntry): FsCandidate | null {
  // Prefer the richer content.gedcomx.persons[0] shape; fall back to
  // displayProperties for simpler responses.
  const dp = entry.displayProperties;
  const persons = entry.content?.gedcomx?.persons ?? [];
  const gp = persons[0];

  const fsId =
    gp?.id ??
    dp?.id ??
    entry.id ??
    "";
  if (!fsId) return null;

  const name =
    gp?.names?.[0]?.nameForms?.[0]?.fullText ??
    dp?.name ??
    "(unknown)";

  const sex = normalizeSex(
    gp?.gender?.type ?? dp?.gender ?? "",
  );

  const birth = extractFact(gp?.facts, "birth") ??
    (dp?.birthPlace ? { place: dp.birthPlace } : undefined);
  const death = extractFact(gp?.facts, "death") ??
    (dp?.deathPlace ? { place: dp.deathPlace } : undefined);

  const url = `${fsApiBase()}/platform/tree/persons/${fsId}`;

  return {
    fsId,
    name,
    sex,
    birth,
    death,
    url,
    score: entry.score ?? 0,
  };
}

/**
 * Search FamilySearch Tree for persons matching the given criteria.
 * Returns up to 10 normalized candidates. Never throws — logs and returns []
 * on any failure so the route can degrade gracefully.
 */
export async function searchPersons(input: SearchInput): Promise<FsCandidate[]> {
  if (!familySearchEnabled()) return [];
  try {
    const token = await getAccessToken();
    const params = buildSearchParams(input);
    const url = `${fsApiBase()}/platform/tree/search?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/x-fs-v1+json",
      },
    });
    if (!res.ok) {
      console.error(`FamilySearch search failed (${res.status}):`, await res.text().catch(() => ""));
      return [];
    }
    const json = (await res.json()) as FsSearchResponse;
    const entries = json.entries ?? [];
    const candidates: FsCandidate[] = [];
    for (const e of entries) {
      const c = entryToCandidate(e);
      if (c) candidates.push(c);
    }
    return candidates.slice(0, 10);
  } catch (e) {
    console.error("FamilySearch searchPersons error:", e);
    return [];
  }
}

/**
 * Fetch a single person by FamilySearch ID.
 * Returns null on any failure.
 */
export async function getPerson(fsId: string): Promise<FsCandidate | null> {
  if (!familySearchEnabled()) return null;
  try {
    const token = await getAccessToken();
    const url = `${fsApiBase()}/platform/tree/persons/${encodeURIComponent(fsId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/x-fs-v1+json",
      },
    });
    if (!res.ok) {
      console.error(`FamilySearch getPerson(${fsId}) failed (${res.status})`);
      return null;
    }
    type GpPerson = NonNullable<NonNullable<NonNullable<FsSearchEntry["content"]>["gedcomx"]>["persons"]>[number];
    const json = (await res.json()) as { persons?: GpPerson[] };
    const gp = json.persons?.[0];
    if (!gp) return null;
    const name = gp.names?.[0]?.nameForms?.[0]?.fullText ?? "(unknown)";
    const sex = normalizeSex(gp.gender?.type ?? "");
    const birth = extractFact(gp.facts, "birth");
    const death = extractFact(gp.facts, "death");
    return {
      fsId,
      name,
      sex,
      birth,
      death,
      url: `${fsApiBase()}/platform/tree/persons/${fsId}`,
      score: 1,
    };
  } catch (e) {
    console.error("FamilySearch getPerson error:", e);
    return null;
  }
}
