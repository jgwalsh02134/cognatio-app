/**
 * Client-side helpers for the FamilySearch OAuth2 integration.
 *
 * Tokens are stored server-side only (Postgres). The browser never sees them.
 * The connect flow opens a popup window that completes the OAuth redirect; the
 * client polls /api/familysearch/status until connected:true.
 *
 * All calls degrade gracefully — on a static/disk build with no server, status
 * returns { enabled: false, connected: false } and searches return [].
 */

export interface FamilySearchStatus {
  enabled: boolean;
  connected: boolean;
  fsUser?: string;
}

export interface FsCandidate {
  fsId: string;
  name: string;
  sex: string;
  birth?: { date?: string; place?: string };
  death?: { date?: string; place?: string };
  url: string;
  score: number;
}

export interface FsSearchAnchors {
  name?: string;
  givenName?: string;
  surname?: string;
  birthYear?: number;
  birthPlace?: string;
  deathYear?: number;
  deathPlace?: string;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function familySearchStatus(
  signal?: AbortSignal,
): Promise<FamilySearchStatus> {
  try {
    const r = await fetch("/api/familysearch/status", { signal });
    if (!r.ok) return { enabled: false, connected: false };
    const j = (await r.json()) as FamilySearchStatus;
    return {
      enabled: !!j.enabled,
      connected: !!j.connected,
      fsUser: j.fsUser,
    };
  } catch {
    return { enabled: false, connected: false };
  }
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

/**
 * Open the FamilySearch OAuth popup and poll until connected.
 *
 * @param passcode  The family edit passphrase (x-edit-passcode header).
 * @param onStatus  Optional callback invoked on each poll result.
 * @returns         The final status (connected:true on success).
 */
export async function connectFamilySearch(
  passcode: string,
  onStatus?: (s: FamilySearchStatus) => void,
): Promise<FamilySearchStatus> {
  // 1. Get the authorize URL from the server.
  const urlResp = await fetch("/api/familysearch/connect-url", {
    method: "POST",
    headers: { "x-edit-passcode": passcode },
  });
  if (!urlResp.ok) {
    const j = (await urlResp.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Server responded ${urlResp.status}`);
  }
  const { url } = (await urlResp.json()) as { url: string };

  // 2. Open the popup.
  const popup = window.open(
    url,
    "familysearch-oauth",
    "width=600,height=700,noopener,noreferrer",
  );
  if (!popup) {
    throw new Error(
      "Could not open popup window. Please allow popups for this site and try again.",
    );
  }

  // 3. Poll /api/familysearch/status every 2 s for up to 2 minutes.
  const POLL_INTERVAL_MS = 2000;
  const TIMEOUT_MS = 2 * 60 * 1000;
  const deadline = Date.now() + TIMEOUT_MS;

  return new Promise<FamilySearchStatus>((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const status = await familySearchStatus();
        onStatus?.(status);

        if (status.connected) {
          clearInterval(interval);
          resolve(status);
          return;
        }

        // If the popup was closed by the user before completing, stop polling.
        if (popup.closed && !status.connected) {
          if (Date.now() > deadline - TIMEOUT_MS + 5000) {
            // Give a 5-second grace period after popup close.
            clearInterval(interval);
            reject(new Error("Popup closed before authorization completed."));
            return;
          }
        }

        if (Date.now() >= deadline) {
          clearInterval(interval);
          reject(new Error("FamilySearch authorization timed out. Please try again."));
        }
      } catch (e) {
        // Network errors during polling are transient — keep trying.
        if (Date.now() >= deadline) {
          clearInterval(interval);
          reject(e);
        }
      }
    }, POLL_INTERVAL_MS);
  });
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export async function disconnectFamilySearch(passcode: string): Promise<void> {
  const r = await fetch("/api/familysearch/disconnect", {
    method: "POST",
    headers: { "x-edit-passcode": passcode },
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Server responded ${r.status}`);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchFamilySearch(
  anchors: FsSearchAnchors,
  passcode: string,
  signal?: AbortSignal,
): Promise<{ connected: boolean; candidates: FsCandidate[] }> {
  try {
    const r = await fetch("/api/familysearch/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-edit-passcode": passcode,
      },
      body: JSON.stringify({ anchors }),
      signal,
    });
    if (!r.ok) return { connected: false, candidates: [] };
    const j = (await r.json()) as {
      connected?: boolean;
      candidates?: FsCandidate[];
    };
    return {
      connected: !!j.connected,
      candidates: Array.isArray(j.candidates) ? j.candidates : [],
    };
  } catch {
    return { connected: false, candidates: [] };
  }
}
