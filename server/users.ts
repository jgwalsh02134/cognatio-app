/**
 * User store for signup / login.
 *
 * Backend selection mirrors the archive/community pattern:
 *   - When DATABASE_URL is set (Railway), users live in Postgres via the shared
 *     connection pool from archive.ts (getSqlClient()).
 *   - Otherwise (local dev / disk builds) they fall back to the same SQLite
 *     `data.db` file used by storage.ts, so signup/login is testable without a
 *     Postgres instance.
 *
 * Passwords are hashed with node:crypto scrypt (no new dependencies). We store
 * `scrypt$<saltHex>$<hashHex>` and compare with crypto.timingSafeEqual. Plaintext
 * passwords and hashes are NEVER logged.
 */
import crypto from "node:crypto";
import { getSqlClient } from "./archive";
import { sqlite } from "./storage";

/** Public shape returned to callers/routes — never includes the hash. */
export interface AppUser {
  id: string;
  username: string;
}

/** Internal row including the password hash (server-side only). */
interface UserRow {
  id: string;
  username: string;
  password_hash: string;
}

/** Thrown by createUser when the username already exists (maps to HTTP 409). */
export class UsernameConflictError extends Error {
  constructor(message = "That username is already taken.") {
    super(message);
    this.name = "UsernameConflictError";
  }
}

function usePostgres(): boolean {
  return !!process.env.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Postgres backend
// ---------------------------------------------------------------------------

let pgReady: Promise<void> | null = null;
function ensurePgReady(
  db: NonNullable<ReturnType<typeof getSqlClient>>,
): Promise<void> {
  if (!pgReady) {
    pgReady = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          username text NOT NULL,
          password_hash text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      // Case-insensitive uniqueness on the username.
      await db`
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
          ON users (lower(username))
      `;
    })();
  }
  return pgReady;
}

// ---------------------------------------------------------------------------
// SQLite backend (dev fallback — reuses storage.ts's data.db handle)
// ---------------------------------------------------------------------------

let sqliteReady = false;
function ensureSqliteReady(): void {
  if (sqliteReady) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
      ON users (lower(username))
  `);
  sqliteReady = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Ensure the users table exists on whichever backend is active. */
export async function initUserStore(): Promise<void> {
  if (usePostgres()) {
    const db = getSqlClient();
    if (db) await ensurePgReady(db);
  } else {
    ensureSqliteReady();
  }
}

async function findByUsername(username: string): Promise<UserRow | null> {
  const uname = username.trim();
  if (usePostgres()) {
    const db = getSqlClient();
    if (!db) return null;
    await ensurePgReady(db);
    const rows = await db<UserRow[]>`
      SELECT id, username, password_hash
      FROM users
      WHERE lower(username) = lower(${uname})
      LIMIT 1
    `;
    return rows.length ? rows[0] : null;
  }
  ensureSqliteReady();
  const row = sqlite
    .prepare(
      "SELECT id, username, password_hash FROM users WHERE lower(username) = lower(?) LIMIT 1",
    )
    .get(uname) as UserRow | undefined;
  return row ?? null;
}

/**
 * Create a new user. Throws UsernameConflictError if the username (case-
 * insensitively) already exists.
 */
export async function createUser(
  username: string,
  password: string,
): Promise<AppUser> {
  const uname = username.trim();
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  const existing = await findByUsername(uname);
  if (existing) throw new UsernameConflictError();

  if (usePostgres()) {
    const db = getSqlClient();
    if (!db) throw new Error("Database not configured (DATABASE_URL unset).");
    await ensurePgReady(db);
    try {
      await db`
        INSERT INTO users (id, username, password_hash)
        VALUES (${id}, ${uname}, ${passwordHash})
      `;
    } catch (e) {
      // Unique-violation safety net for the check-then-insert race.
      if ((e as { code?: string })?.code === "23505") {
        throw new UsernameConflictError();
      }
      throw e;
    }
  } else {
    ensureSqliteReady();
    try {
      sqlite
        .prepare(
          "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
        )
        .run(id, uname, passwordHash);
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      if (code.includes("SQLITE_CONSTRAINT")) {
        throw new UsernameConflictError();
      }
      throw e;
    }
  }

  return { id, username: uname };
}

/** Return the user when the credentials are valid, otherwise null. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<AppUser | null> {
  const row = await findByUsername(username);
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, username: row.username };
}

/** Look up a user by id (used to validate live sessions). */
export async function getUserById(id: string): Promise<AppUser | null> {
  if (usePostgres()) {
    const db = getSqlClient();
    if (!db) return null;
    await ensurePgReady(db);
    const rows = await db<{ id: string; username: string }[]>`
      SELECT id, username FROM users WHERE id = ${id} LIMIT 1
    `;
    return rows.length ? { id: rows[0].id, username: rows[0].username } : null;
  }
  ensureSqliteReady();
  const row = sqlite
    .prepare("SELECT id, username FROM users WHERE id = ? LIMIT 1")
    .get(id) as { id: string; username: string } | undefined;
  return row ? { id: row.id, username: row.username } : null;
}
