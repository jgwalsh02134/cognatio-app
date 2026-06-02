// Client wrapper for the server-side FamilySearch API proxy.
//
// The server holds the FamilySearch OAuth tokens — they are never sent to the
// browser. This module calls our own /api/familysearch/* endpoints, which
// authenticate with FamilySearch on the server and return only the normalized
// result. Every call degrades gracefully: on a static/disk build with no
// server, status returns false and search returns [], so the UI can simply
// hide the feature.

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
  /** Direct link to the FamilySearch person page. */
  url: string;
  /** Relevance score returned by the FamilySearch search API. */
  score: number;
}

export interface FsSearchInput {
  given?: string;
  surname?: string;
  birthYear?: number | string;
  deathYear?: number | string;
  birthPlace?: string;
  deathPlace?: string;
}

/**
 * Ask the server whether FamilySearch integration is configured.
 * Returns false on any failure — including static deployments with no server.
 */
export async function familySearchStatus(signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch("/api/familysearch/status", { signal });
    if (!r.ok) return false;
    const j = (await r.json()) as { enabled?: boolean };
    return !!j.enabled;
  } catch {
    return false;
  }
}

/**
 * Search FamilySearch for persons matching the given criteria.
 * Requires the family passphrase (same credential as the editor).
 * Returns [] on any failure — callers should handle the empty case gracefully.
 */
export async function searchFamilySearch(
  input: FsSearchInput,
  passcode: string,
  signal?: AbortSignal,
): Promise<FsCandidate[]> {
  try {
    const r = await fetch("/api/familysearch/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-edit-passcode": passcode,
      },
      body: JSON.stringify(input),
      signal,
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { candidates?: FsCandidate[]; error?: string };
    return Array.isArray(j.candidates) ? j.candidates : [];
  } catch {
    return [];
  }
}

/**
 * Fetch a single FamilySearch person by their FS ID.
 * Returns null on any failure.
 */
export async function getFamilySearchPerson(
  fsId: string,
  signal?: AbortSignal,
): Promise<FsCandidate | null> {
  try {
    const r = await fetch(`/api/familysearch/person/${encodeURIComponent(fsId)}`, { signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { person?: FsCandidate; error?: string };
    return j.person ?? null;
  } catch {
    return null;
  }
}
