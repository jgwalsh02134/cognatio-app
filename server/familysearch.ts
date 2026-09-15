/**
 * FamilySearch OAuth2 integration — server-side token management.
 *
 * Tokens are stored exclusively in Postgres (familysearch_tokens table) and
 * never sent to the browser. The OAuth flow uses the Authorization Code grant
 * with a popup window; the client polls /api/familysearch/status to detect
 * completion.
 *
 * Environment variables required to enable:
 *   FAMILYSEARCH_CLIENT_ID
 *   FAMILYSEARCH_CLIENT_SECRET
 *   FAMILYSEARCH_REDIRECT_URI   (must be registered with FamilySearch)
 *
 * Optional:
 *   FAMILYSEARCH_ENV            "production" (default), "beta", or "integration"
 *   FAMILYSEARCH_SCOPES         OAuth scopes (optional; omitted when unset —
 *                               "openid" requires a realm on your app key)
 *   FAMILYSEARCH_STATE_SECRET   HMAC key for state param (falls back to DATA_WRITE_PASSCODE)
 *
 * FamilySearch splits across three hosts, which we must NOT conflate:
 *   - Identity / OAuth:  ident[beta|int].familysearch.org/cis-web/oauth2/v3/*
 *   - Platform API:      api[beta|-integ].familysearch.org/platform/*
 *   - Human web UI:      [www|beta|integration].familysearch.org (clickable links)
 */
import crypto from "node:crypto";
import { getSqlClient } from "./archive";

// ---------------------------------------------------------------------------
// FamilySearch base URLs (three distinct hosts — see header note)
// ---------------------------------------------------------------------------

function fsEnv(): "production" | "beta" | "integration" {
  const env = (process.env.FAMILYSEARCH_ENV || "production").toLowerCase();
  return env === "beta" || env === "integration" ? env : "production";
}

/** Identity host for the OAuth2 authorize/token endpoints. */
function identBase(): string {
  switch (fsEnv()) {
    case "beta": return "https://identbeta.familysearch.org";
    case "integration": return "https://identint.familysearch.org";
    default: return "https://ident.familysearch.org";
  }
}

/** Platform API host (tree/records/users). */
function apiBase(): string {
  switch (fsEnv()) {
    case "beta": return "https://apibeta.familysearch.org";
    case "integration": return "https://api-integ.familysearch.org";
    default: return "https://api.familysearch.org";
  }
}

/** Human-facing web host for clickable person links. */
function webBase(): string {
  switch (fsEnv()) {
    case "beta": return "https://beta.familysearch.org";
    case "integration": return "https://integration.familysearch.org";
    default: return "https://www.familysearch.org";
  }
}

function tokenEndpoint(): string {
  return `${identBase()}/cis-web/oauth2/v3/token`;
}

/** Authorize page URL (used by the connect-url route). */
export function authorizeEndpoint(): string {
  return `${identBase()}/cis-web/oauth2/v3/authorization`;
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export function familySearchEnabled(): boolean {
  return !!(
    process.env.FAMILYSEARCH_CLIENT_ID &&
    process.env.FAMILYSEARCH_CLIENT_SECRET &&
    process.env.FAMILYSEARCH_REDIRECT_URI
  );
}

// ---------------------------------------------------------------------------
// DB schema bootstrap
// ---------------------------------------------------------------------------

let ready: Promise<void> | null = null;

async function ensureReady(
  db: NonNullable<ReturnType<typeof getSqlClient>>,
): Promise<void> {
  if (!ready) {
    ready = db`
      CREATE TABLE IF NOT EXISTS familysearch_tokens (
        id text PRIMARY KEY DEFAULT 'linked',
        access_token text,
        refresh_token text,
        expires_at timestamptz,
        scope text,
        fs_user text,
        updated_at timestamptz DEFAULT now()
      )
    `.then(() => undefined);
  }
  return ready;
}

// ---------------------------------------------------------------------------
// Token row type
// ---------------------------------------------------------------------------

interface TokenRow {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: Date | string | null;
  scope: string | null;
  fs_user: string | null;
  updated_at: Date | string | null;
}

// ---------------------------------------------------------------------------
// isConnected
// ---------------------------------------------------------------------------

export async function isConnected(): Promise<boolean> {
  const db = getSqlClient();
  if (!db) return false;
  try {
    await ensureReady(db);
    const rows = await db<{ id: string }[]>`
      SELECT id FROM familysearch_tokens WHERE id = 'linked' LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Returns the fs_user value from the stored token row, or null. */
export async function getFsUser(): Promise<string | null> {
  const db = getSqlClient();
  if (!db) return null;
  try {
    await ensureReady(db);
    const rows = await db<{ fs_user: string | null }[]>`
      SELECT fs_user FROM familysearch_tokens WHERE id = 'linked' LIMIT 1
    `;
    return rows.length ? (rows[0].fs_user ?? null) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token exchange / refresh helpers
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

async function upsertToken(
  data: TokenResponse,
  fsUser?: string,
): Promise<void> {
  const db = getSqlClient();
  if (!db) throw new Error("Database not configured (DATABASE_URL unset).");
  await ensureReady(db);

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;

  // Fetch existing row to preserve refresh_token if the new response omits it.
  let refreshToken = data.refresh_token ?? null;
  if (!refreshToken) {
    const existing = await db<{ refresh_token: string | null }[]>`
      SELECT refresh_token FROM familysearch_tokens WHERE id = 'linked' LIMIT 1
    `;
    if (existing.length) refreshToken = existing[0].refresh_token;
  }

  // Resolve fs_user: prefer the passed-in value, then existing row.
  let resolvedUser = fsUser ?? null;
  if (!resolvedUser) {
    const existing = await db<{ fs_user: string | null }[]>`
      SELECT fs_user FROM familysearch_tokens WHERE id = 'linked' LIMIT 1
    `;
    if (existing.length) resolvedUser = existing[0].fs_user;
  }

  await db`
    INSERT INTO familysearch_tokens
      (id, access_token, refresh_token, expires_at, scope, fs_user, updated_at)
    VALUES (
      'linked',
      ${data.access_token},
      ${refreshToken},
      ${expiresAt ? expiresAt.toISOString() : null},
      ${data.scope ?? null},
      ${resolvedUser},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, familysearch_tokens.refresh_token),
      expires_at   = EXCLUDED.expires_at,
      scope        = EXCLUDED.scope,
      fs_user      = COALESCE(EXCLUDED.fs_user, familysearch_tokens.fs_user),
      updated_at   = now()
  `;
}

/** Exchange an authorization code for tokens and persist them. */
export async function exchangeCodeForToken(code: string): Promise<void> {
  const clientId = process.env.FAMILYSEARCH_CLIENT_ID!;
  const clientSecret = process.env.FAMILYSEARCH_CLIENT_SECRET!;
  const redirectUri = process.env.FAMILYSEARCH_REDIRECT_URI!;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const resp = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`FamilySearch token exchange failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error("FamilySearch token response missing access_token");
  }

  // Try to fetch the authenticated user's display name.
  let fsUser: string | undefined;
  try {
    fsUser = await fetchFsUser(data.access_token);
  } catch {
    // Non-fatal — we still store the token.
  }

  await upsertToken(data, fsUser);
}

/** Refresh the access token using the stored refresh token. */
async function refreshAccessToken(): Promise<string | null> {
  const db = getSqlClient();
  if (!db) return null;
  try {
    await ensureReady(db);
    const rows = await db<TokenRow[]>`
      SELECT refresh_token FROM familysearch_tokens WHERE id = 'linked' LIMIT 1
    `;
    if (!rows.length || !rows[0].refresh_token) return null;

    const refreshToken = rows[0].refresh_token;
    const clientId = process.env.FAMILYSEARCH_CLIENT_ID!;
    const clientSecret = process.env.FAMILYSEARCH_CLIENT_SECRET!;

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const resp = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!resp.ok) {
      console.error("FamilySearch refresh failed:", resp.status);
      return null;
    }

    const data = (await resp.json()) as TokenResponse;
    if (!data.access_token) return null;

    await upsertToken(data);
    return data.access_token;
  } catch (e) {
    console.error("refreshAccessToken error:", e);
    return null;
  }
}

/**
 * Returns a valid access token, refreshing if stale. Returns null on any
 * error so callers can degrade gracefully.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const db = getSqlClient();
  if (!db) return null;
  try {
    await ensureReady(db);
    const rows = await db<TokenRow[]>`
      SELECT access_token, refresh_token, expires_at
      FROM familysearch_tokens
      WHERE id = 'linked'
      LIMIT 1
    `;
    if (!rows.length) return null;

    const row = rows[0];
    if (!row.access_token) return null;

    // Check expiry — refresh if within 5 minutes of expiry.
    if (row.expires_at) {
      const exp = new Date(row.expires_at).getTime();
      const now = Date.now();
      if (exp - now < 5 * 60 * 1000) {
        return await refreshAccessToken();
      }
    }

    return row.access_token;
  } catch (e) {
    console.error("getValidAccessToken error:", e);
    return null;
  }
}

/** Delete the stored token row (disconnect). */
export async function deleteToken(): Promise<void> {
  const db = getSqlClient();
  if (!db) return;
  await ensureReady(db);
  await db`DELETE FROM familysearch_tokens WHERE id = 'linked'`;
}

// ---------------------------------------------------------------------------
// FamilySearch API helpers
// ---------------------------------------------------------------------------

async function fetchFsUser(accessToken: string): Promise<string> {
  const resp = await fetch(`${apiBase()}/platform/users/current`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) throw new Error(`FamilySearch /users/current: ${resp.status}`);
  const data = (await resp.json()) as {
    users?: Array<{ displayName?: string; contactName?: string }>;
  };
  const user = data.users?.[0];
  return user?.displayName || user?.contactName || "FamilySearch user";
}

// ---------------------------------------------------------------------------
// Normalized person shape
// ---------------------------------------------------------------------------

export interface FsCandidate {
  fsId: string;
  name: string;
  sex: string;
  birth?: { date?: string; place?: string };
  death?: { date?: string; place?: string };
  url: string;
  score: number;
}

function normalizeCandidate(
  entry: Record<string, unknown>,
  base: string,
): FsCandidate | null {
  try {
    const id = String(entry.id ?? "");
    if (!id) return null;

    // Name
    const names = (entry.names as Array<Record<string, unknown>>) ?? [];
    const preferredName = names.find((n) => n.preferred) ?? names[0];
    const nameForms =
      (preferredName?.nameForms as Array<Record<string, unknown>>) ?? [];
    const fullText = String(nameForms[0]?.fullText ?? "");

    // Sex
    const gender = (entry.gender as Record<string, unknown>) ?? {};
    const sex = String(gender.type ?? "").includes("Female")
      ? "F"
      : String(gender.type ?? "").includes("Male")
        ? "M"
        : "U";

    // Facts
    const facts = (entry.facts as Array<Record<string, unknown>>) ?? [];
    let birth: FsCandidate["birth"];
    let death: FsCandidate["death"];
    for (const f of facts) {
      const type = String(f.type ?? "");
      const date = (f.date as Record<string, unknown>) ?? {};
      const place = (f.place as Record<string, unknown>) ?? {};
      const dateStr = String(date.original ?? date.formal ?? "");
      const placeStr = String(place.original ?? "");
      if (type.includes("Birth")) {
        birth = { date: dateStr || undefined, place: placeStr || undefined };
      } else if (type.includes("Death")) {
        death = { date: dateStr || undefined, place: placeStr || undefined };
      }
    }

    const score = typeof entry.score === "number" ? entry.score : 0;
    const url = `${base}/tree/person-details/${id}`;

    return { fsId: id, name: fullText || id, sex, birth, death, url, score };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// searchPersons
// ---------------------------------------------------------------------------

export interface PersonAnchors {
  name?: string;
  givenName?: string;
  surname?: string;
  birthYear?: number;
  birthPlace?: string;
  deathYear?: number;
  deathPlace?: string;
}

export async function searchPersons(
  anchors: PersonAnchors,
  max = 10,
): Promise<FsCandidate[]> {
  const token = await getValidAccessToken();
  if (!token) return [];

  try {
    const params = new URLSearchParams();
    if (anchors.givenName) params.set("q.givenName", anchors.givenName);
    if (anchors.surname) params.set("q.surname", anchors.surname);
    // FamilySearch wants a date RANGE as q.<event>LikeDate.from/.to, each value
    // prefixed with "+YYYY" (URLSearchParams encodes the + as %2B). A ±2-year
    // window keeps the right person without dropping near-miss records.
    if (anchors.birthYear) {
      params.set("q.birthLikeDate.from", `+${anchors.birthYear - 2}`);
      params.set("q.birthLikeDate.to", `+${anchors.birthYear + 2}`);
    }
    if (anchors.birthPlace) params.set("q.birthLikePlace", anchors.birthPlace);
    if (anchors.deathYear) {
      params.set("q.deathLikeDate.from", `+${anchors.deathYear - 2}`);
      params.set("q.deathLikeDate.to", `+${anchors.deathYear + 2}`);
    }
    if (anchors.deathPlace) params.set("q.deathLikePlace", anchors.deathPlace);
    params.set("count", String(Math.min(max, 20)));

    const url = `${apiBase()}/platform/tree/search?${params.toString()}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      console.error("FamilySearch search failed:", resp.status);
      return [];
    }

    const data = (await resp.json()) as {
      entries?: Array<{ content?: { gedcomx?: { persons?: unknown[] } }; score?: number }>;
    };

    const candidates: FsCandidate[] = [];
    for (const entry of data.entries ?? []) {
      const persons = entry.content?.gedcomx?.persons ?? [];
      for (const p of persons as Array<Record<string, unknown>>) {
        const c = normalizeCandidate(
          { ...p, score: entry.score ?? 0 },
          webBase(),
        );
        if (c) candidates.push(c);
      }
      if (candidates.length >= max) break;
    }

    return candidates.slice(0, max);
  } catch (e) {
    console.error("searchPersons error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getPerson
// ---------------------------------------------------------------------------

export async function getPerson(fsId: string): Promise<FsCandidate | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  try {
    const url = `${apiBase()}/platform/tree/persons/${encodeURIComponent(fsId)}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      console.error("FamilySearch getPerson failed:", resp.status);
      return null;
    }

    const data = (await resp.json()) as {
      persons?: Array<Record<string, unknown>>;
    };
    const p = data.persons?.[0];
    if (!p) return null;
    return normalizeCandidate(p, webBase());
  } catch (e) {
    console.error("getPerson error:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// State parameter helpers (HMAC-signed, expiring, single-use)
// ---------------------------------------------------------------------------

const USED_NONCES = new Set<string>();

function stateSecret(): string {
  return (
    process.env.FAMILYSEARCH_STATE_SECRET ||
    process.env.DATA_WRITE_PASSCODE ||
    "default-state-secret"
  );
}

export function generateState(): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const exp = Date.now() + 10 * 60 * 1000; // 10 minutes
  const payload = JSON.stringify({ nonce, exp });
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

export function verifyState(state: string): { ok: boolean; error?: string } {
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { payload: string; sig: string };

    const expected = crypto
      .createHmac("sha256", stateSecret())
      .update(decoded.payload)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(decoded.sig, "hex"),
        Buffer.from(expected, "hex"),
      )
    ) {
      return { ok: false, error: "Invalid state signature" };
    }

    const { nonce, exp } = JSON.parse(decoded.payload) as {
      nonce: string;
      exp: number;
    };

    if (Date.now() > exp) {
      return { ok: false, error: "State parameter expired" };
    }

    if (USED_NONCES.has(nonce)) {
      return { ok: false, error: "State nonce already used" };
    }

    USED_NONCES.add(nonce);
    // Prune old nonces periodically to avoid unbounded growth.
    if (USED_NONCES.size > 1000) {
      const iter = USED_NONCES.values();
      for (let i = 0; i < 200; i++) USED_NONCES.delete(iter.next().value as string);
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Malformed state parameter" };
  }
}
