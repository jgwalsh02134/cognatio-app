/**
 * Persistent edit overlay, backed by Postgres (Railway).
 *
 * The site's genealogy data is baked into the client bundle at build time. To
 * let trusted family members save edits PERMANENTLY without downloading a file,
 * we store a small "overlay" — a map of personId -> partial patch — in a single
 * JSONB row. The client fetches this overlay at startup and merges it over the
 * baked data, so saved edits appear on every load (on this server) without a
 * rebuild.
 *
 * Storing only the edited fields (not the whole ~1.5 MB archive) keeps the
 * payload tiny. Saves MERGE into the stored overlay so edits accumulate across
 * sessions.
 *
 * If DATABASE_URL is not set (static hosts, local disk), this module is inert
 * and the client simply uses the baked data.
 */
import postgres from "postgres";

export type PersonPatch = Record<string, unknown>;
export type Overlay = Record<string, PersonPatch>;

let sql: ReturnType<typeof postgres> | null | undefined;
let ready: Promise<void> | null = null;

export function archiveEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

function client(): ReturnType<typeof postgres> | null {
  if (sql === undefined) {
    const url = process.env.DATABASE_URL;
    sql = url
      ? postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10 })
      : null;
  }
  return sql;
}

async function ensureReady(db: ReturnType<typeof postgres>): Promise<void> {
  if (!ready) {
    ready = db`
      CREATE TABLE IF NOT EXISTS archive_overlay (
        id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        patches jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.then(() => undefined);
  }
  return ready;
}

/** Current overlay, or {} when unavailable. Never throws — the site must load
 *  on baked data even if the DB is down. */
export async function getOverlay(): Promise<Overlay> {
  const db = client();
  if (!db) return {};
  try {
    await ensureReady(db);
    const rows = await db<{ patches: Overlay }[]>`
      SELECT patches FROM archive_overlay WHERE id = 1
    `;
    return rows.length ? rows[0].patches : {};
  } catch (e) {
    console.error("getOverlay failed:", e);
    return {};
  }
}

/** Merge incoming per-person patches into the stored overlay (accumulative). */
export async function mergeOverlay(incoming: Overlay): Promise<{ people: number }> {
  const db = client();
  if (!db) throw new Error("Database not configured (DATABASE_URL unset).");
  await ensureReady(db);
  const current = await getOverlay();
  const merged: Overlay = { ...current };
  for (const [id, patch] of Object.entries(incoming)) {
    merged[id] = { ...(merged[id] ?? {}), ...patch };
  }
  // db.json() types its argument strictly; the overlay is plain JSON-safe data.
  const payload = db.json(merged as Parameters<typeof db.json>[0]);
  await db`
    INSERT INTO archive_overlay (id, patches, updated_at)
    VALUES (1, ${payload}, now())
    ON CONFLICT (id) DO UPDATE SET patches = ${payload}, updated_at = now()
  `;
  return { people: Object.keys(merged).length };
}
