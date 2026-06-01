import { createRoot } from "react-dom/client";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

/**
 * Best-effort fetch of the saved edit overlay before the app mounts. Must run
 * BEFORE App (and therefore family.ts) is imported, so we set the global then
 * dynamically import App. On static hosts / when no server or DB is present,
 * this silently no-ops and the baked dataset is used.
 */
async function hydrateOverlay(): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("/api/archive", {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) return;
    const json = (await res.json()) as { patches?: Record<string, Record<string, unknown>> };
    if (json && json.patches && typeof json.patches === "object") {
      window.__ARCHIVE_PATCHES__ = json.patches as Window["__ARCHIVE_PATCHES__"];
    }
  } catch {
    /* offline, static host, or no DB → fall back to baked data */
  }
}

async function boot(): Promise<void> {
  await hydrateOverlay();
  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(<App />);
}

void boot();
