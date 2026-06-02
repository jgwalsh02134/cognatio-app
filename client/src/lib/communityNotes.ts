// Client for the community-notes API (server-backed, Postgres).
//
// Reads are public; writes send the family passphrase as `x-edit-passcode`
// (the same credential the editor uses). Every call degrades gracefully: on a
// static/disk build with no server, status returns false and lists return [],
// so the UI can simply hide the feature.

export interface CommunityNote {
  id: string;
  person_id: string;
  author: string;
  body: string;
  helpful: number;
  created_at: string;
}

export async function communityNotesStatus(signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch("/api/notes/status", { signal });
    if (!r.ok) return false;
    const j = (await r.json()) as { enabled?: boolean };
    return !!j.enabled;
  } catch {
    return false;
  }
}

export async function listCommunityNotes(
  personId: string,
  signal?: AbortSignal,
): Promise<CommunityNote[]> {
  try {
    const r = await fetch(`/api/notes?person=${encodeURIComponent(personId)}`, { signal });
    if (!r.ok) return [];
    const j = (await r.json()) as { notes?: CommunityNote[] };
    return Array.isArray(j.notes) ? j.notes : [];
  } catch {
    return [];
  }
}

export async function addCommunityNote(opts: {
  personId: string;
  author: string;
  body: string;
  passcode: string;
}): Promise<CommunityNote> {
  const r = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-edit-passcode": opts.passcode },
    body: JSON.stringify({ personId: opts.personId, author: opts.author, body: opts.body }),
  });
  const j = (await r.json().catch(() => ({}))) as { note?: CommunityNote; error?: string };
  if (!r.ok || !j.note) throw new Error(j.error || `Server responded ${r.status}`);
  return j.note;
}

export async function markCommunityNoteHelpful(id: string): Promise<number> {
  const r = await fetch(`/api/notes/${encodeURIComponent(id)}/helpful`, { method: "POST" });
  const j = (await r.json().catch(() => ({}))) as { helpful?: number; error?: string };
  if (!r.ok) throw new Error(j.error || `Server responded ${r.status}`);
  return j.helpful ?? 0;
}

export async function deleteCommunityNote(id: string, passcode: string): Promise<void> {
  const r = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-edit-passcode": passcode },
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Server responded ${r.status}`);
  }
}
