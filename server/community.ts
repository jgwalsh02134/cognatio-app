/**
 * Community notes, backed by Postgres (Railway).
 *
 * Family members can leave shared, attributed notes on any person — corrections,
 * memories, source tips, "this looks like a duplicate of…", etc. Reads are
 * public (anyone with the site can see them); writes are gated by the family
 * passphrase at the route layer. When DATABASE_URL is unset (static/disk
 * builds) this module is inert and the client hides the feature.
 */
import crypto from "node:crypto";
import { getSqlClient } from "./archive";

// Allowed neon sticky-note colors. Anything else is coerced to the default so
// the palette stays consistent and a malicious client can't inject CSS.
export const NEON_COLORS = ["#FF10F0", "#FFF01F", "#FF5E00", "#39FF14", "#04D9FF"] as const;
const DEFAULT_COLOR = "#FFF01F";
function normalizeColor(c: unknown): string {
  return typeof c === "string" && (NEON_COLORS as readonly string[]).includes(c)
    ? c
    : DEFAULT_COLOR;
}

export interface CommunityNote {
  id: string;
  person_id: string;
  author: string;
  body: string;
  color: string;
  helpful: number;
  created_at: string;
}

interface NoteRow {
  id: string;
  person_id: string;
  author: string;
  body: string;
  color: string | null;
  helpful: number;
  created_at: Date | string;
}

export function communityNotesEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

let ready: Promise<void> | null = null;
async function ensureReady(db: NonNullable<ReturnType<typeof getSqlClient>>): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS community_notes (
          id text PRIMARY KEY,
          person_id text NOT NULL,
          author text NOT NULL,
          body text NOT NULL,
          color text NOT NULL DEFAULT '#FFF01F',
          helpful integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      // Migrate tables created before the sticky-note color field existed.
      await db`
        ALTER TABLE community_notes
          ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#FFF01F'
      `;
      await db`
        CREATE INDEX IF NOT EXISTS community_notes_person_idx
          ON community_notes (person_id)
      `;
    })();
  }
  return ready;
}

function toNote(r: NoteRow): CommunityNote {
  return {
    id: r.id,
    person_id: r.person_id,
    author: r.author,
    body: r.body,
    color: normalizeColor(r.color),
    helpful: r.helpful,
    created_at: new Date(r.created_at).toISOString(),
  };
}

/** All notes for a person, newest first. Never throws — returns [] on failure. */
export async function listNotes(personId: string): Promise<CommunityNote[]> {
  const db = getSqlClient();
  if (!db) return [];
  try {
    await ensureReady(db);
    const rows = await db<NoteRow[]>`
      SELECT id, person_id, author, body, color, helpful, created_at
      FROM community_notes
      WHERE person_id = ${personId}
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return rows.map(toNote);
  } catch (e) {
    console.error("listNotes failed:", e);
    return [];
  }
}

export async function addNote(input: {
  personId: string;
  author: string;
  body: string;
  color?: string;
}): Promise<CommunityNote> {
  const db = getSqlClient();
  if (!db) throw new Error("Database not configured (DATABASE_URL unset).");
  await ensureReady(db);
  const id = crypto.randomUUID();
  const author = input.author.trim().slice(0, 80) || "Anonymous";
  const body = input.body.trim().slice(0, 2000);
  const color = normalizeColor(input.color);
  const rows = await db<NoteRow[]>`
    INSERT INTO community_notes (id, person_id, author, body, color)
    VALUES (${id}, ${input.personId}, ${author}, ${body}, ${color})
    RETURNING id, person_id, author, body, color, helpful, created_at
  `;
  return toNote(rows[0]);
}

export async function markHelpful(id: string): Promise<number> {
  const db = getSqlClient();
  if (!db) return 0;
  await ensureReady(db);
  const rows = await db<{ helpful: number }[]>`
    UPDATE community_notes SET helpful = helpful + 1 WHERE id = ${id}
    RETURNING helpful
  `;
  return rows.length ? rows[0].helpful : 0;
}

export async function deleteNote(id: string): Promise<void> {
  const db = getSqlClient();
  if (!db) return;
  await ensureReady(db);
  await db`DELETE FROM community_notes WHERE id = ${id}`;
}
