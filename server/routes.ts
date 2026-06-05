import type { Express, Request, Response } from "express";
import express from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { storage } from "./storage";
import { archiveEnabled, getOverlay, mergeOverlay } from "./archive";
import {
  addNote,
  communityNotesEnabled,
  deleteNote,
  listNotes,
  markHelpful,
} from "./community";

// Resolve the canonical data.json path. The dev server runs from project root,
// so this becomes `<root>/client/src/data.json`. The endpoint only writes when
// the file already exists (i.e. we're inside the source checkout), so it's a
// no-op in production bundles where the file isn't shipped alongside the server.
const DATA_PATH = path.resolve(process.cwd(), "client/src/data.json");

// ---------------------------------------------------------------------------
// AI proxy gate
//
// When OPENAI_API_KEY is set on the server, the browser can use AI features
// WITHOUT supplying their own key — calls are proxied through here so the key
// never reaches the client. Access is gated by a shared passphrase
// (AI_ACCESS_PASSCODE, default "2846" — the family editor passphrase) checked
// on every request, plus a simple in-memory per-IP rate limit to cap spend.
// ---------------------------------------------------------------------------

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** Sliding-window per-IP limiter. Tunable via AI_RATE_PER_MIN (default 20). */
const RL_WINDOW_MS = 60_000;
const RL_MAX = Math.max(1, parseInt(process.env.AI_RATE_PER_MIN || "20", 10));
const rlHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (rlHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  recent.push(now);
  rlHits.set(ip, recent);
  return recent.length > RL_MAX;
}

/** Constant-time comparison of a provided secret against an expected value. */
function secretMatches(provided: string | undefined | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** AI proxy passphrase (default "2846"). */
function passcodeOk(provided: string | undefined | null): boolean {
  return secretMatches(provided, process.env.AI_ACCESS_PASSCODE || "2846");
}

/** Edit-save passphrase — the family editor passphrase (default "2846"). */
function editPasscodeOk(provided: string | undefined | null): boolean {
  return secretMatches(provided, process.env.DATA_WRITE_PASSCODE || "2846");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Accept large JSON payloads (the archive is ~1.5 MB even minified).
  app.use("/api/data", express.json({ limit: "10mb" }));

  app.head("/api/data", async (_req: Request, res: Response) => {
    try {
      await fs.access(DATA_PATH);
      res.sendStatus(200);
    } catch {
      res.sendStatus(404);
    }
  });

  app.post("/api/data", async (req: Request, res: Response) => {
    try {
      // Minimal shape guard. We trust the editor but want to bail fast if
      // someone hits this with random JSON.
      const body = req.body as { individuals?: unknown; families?: unknown; stats?: unknown };
      if (!body || !Array.isArray(body.individuals) || !Array.isArray(body.families)) {
        return res.status(400).json({ error: "Body must have individuals[] and families[]" });
      }
      try {
        await fs.access(DATA_PATH);
      } catch {
        return res.status(404).json({ error: `data.json not found at ${DATA_PATH}` });
      }
      const json = JSON.stringify(body, null, 2);
      await fs.writeFile(DATA_PATH, json + "\n", "utf8");
      res.json({
        ok: true,
        path: DATA_PATH,
        individuals: body.individuals.length,
        families: body.families.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: e instanceof Error ? e.message : "Unknown server error" });
    }
  });

  // ----- AI proxy ---------------------------------------------------------

  // Lets the client discover whether server-side AI is available. When false
  // (e.g. static/disk builds, or no key set), the client falls back to its
  // bring-your-own-OpenAI-key flow.
  app.get("/api/ai/status", (_req: Request, res: Response) => {
    res.json({ enabled: !!process.env.OPENAI_API_KEY });
  });

  // Passphrase-gated proxy to the OpenAI Responses API. The server's key is
  // never exposed to the browser.
  app.post(
    "/api/ai/responses",
    express.json({ limit: "1mb" }),
    async (req: Request, res: Response) => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return res
          .status(503)
          .json({ error: { message: "AI is not configured on this server." } });
      }

      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (rateLimited(ip)) {
        return res.status(429).json({
          error: { message: "Too many AI requests — wait a minute and try again." },
        });
      }

      if (!passcodeOk(req.header("x-ai-passcode"))) {
        return res
          .status(401)
          .json({ error: { message: "Invalid or missing access passphrase." } });
      }

      try {
        const upstream = await fetch(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(req.body ?? {}),
        });
        // Pass the upstream body & status straight through (it's already in the
        // shape the client's openai.ts expects, including { error: { message } }).
        const text = await upstream.text();
        res.status(upstream.status).type("application/json").send(text);
      } catch (e) {
        res.status(502).json({
          error: { message: e instanceof Error ? e.message : "Upstream AI error" },
        });
      }
    },
  );

  // Passphrase-gated proxy to the OpenAI Images *edit* API, used only for
  // restoring / colorizing uploaded family photos. The client sends a data-URL
  // + a pre-built (identity-locked) prompt; we forward it as multipart with the
  // server key and return the edited image as a data-URL. gpt-image-2 processes
  // inputs at high fidelity (best likeness preservation); older models get
  // input_fidelity=high.
  app.post(
    "/api/ai/images/edit",
    express.json({ limit: "12mb" }),
    async (req: Request, res: Response) => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return res
          .status(503)
          .json({ error: { message: "AI is not configured on this server." } });
      }
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      if (rateLimited(ip)) {
        return res.status(429).json({
          error: { message: "Too many AI requests — wait a minute and try again." },
        });
      }
      if (!passcodeOk(req.header("x-ai-passcode"))) {
        return res
          .status(401)
          .json({ error: { message: "Invalid or missing access passphrase." } });
      }
      const body = req.body as { image?: string; prompt?: string };
      if (!body?.image || !body.image.startsWith("data:") || !body?.prompt) {
        return res
          .status(400)
          .json({ error: { message: "Body must include an image data-URL and a prompt." } });
      }

      async function callOpenAI(model: string): Promise<globalThis.Response> {
        const comma = body.image!.indexOf(",");
        const meta = body.image!.slice(5, comma); // e.g. "image/png;base64"
        const mime = meta.split(";")[0] || "image/png";
        const bytes = Buffer.from(body.image!.slice(comma + 1), "base64");
        const form = new FormData();
        form.append("model", model);
        form.append(
          "image",
          new Blob([bytes], { type: mime }),
          mime.includes("png") ? "photo.png" : "photo.jpg",
        );
        form.append("prompt", body.prompt!);
        form.append("size", "1024x1024");
        form.append("quality", "high");
        // gpt-image-2 is always high fidelity and rejects this param.
        if (model.startsWith("gpt-image-1")) form.append("input_fidelity", "high");
        return fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
        });
      }

      try {
        let upstream = await callOpenAI("gpt-image-2");
        if (!upstream.ok && (upstream.status === 400 || upstream.status === 404)) {
          // Account may not have gpt-image-2 — fall back to a high-fidelity model.
          upstream = await callOpenAI("gpt-image-1.5");
        }
        const json = (await upstream.json()) as {
          data?: { b64_json?: string }[];
          error?: { message?: string };
        };
        if (!upstream.ok) {
          return res
            .status(upstream.status)
            .json({ error: { message: json.error?.message || "Image edit failed." } });
        }
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) {
          return res.status(502).json({ error: { message: "No image returned." } });
        }
        res.json({ image: `data:image/png;base64,${b64}` });
      } catch (e) {
        res.status(502).json({
          error: { message: e instanceof Error ? e.message : "Upstream AI error" },
        });
      }
    },
  );

  // ----- Persistent edit overlay (Postgres) ------------------------------

  // Tells the client whether server-side permanent saving is available.
  app.get("/api/archive/status", (_req: Request, res: Response) => {
    res.json({ enabled: archiveEnabled() });
  });

  // Public read: the saved overlay (personId -> partial patch). The client
  // merges this over the baked dataset at startup. Returns {} on any failure
  // so the site always loads.
  app.get("/api/archive", async (_req: Request, res: Response) => {
    const patches = await getOverlay();
    res.json({ patches });
  });

  // Passphrase-gated write: merge the submitted patches into the stored overlay.
  app.post(
    "/api/archive",
    express.json({ limit: "10mb" }),
    async (req: Request, res: Response) => {
      if (!archiveEnabled()) {
        return res
          .status(503)
          .json({ error: "Permanent saving is not configured on this server." });
      }
      if (!editPasscodeOk(req.header("x-edit-passcode"))) {
        return res
          .status(401)
          .json({ error: "Invalid or missing edit passphrase." });
      }
      const body = req.body as { patches?: unknown };
      if (
        !body ||
        typeof body.patches !== "object" ||
        body.patches === null ||
        Array.isArray(body.patches)
      ) {
        return res
          .status(400)
          .json({ error: "Body must be { patches: { [personId]: { ...fields } } }." });
      }
      try {
        const result = await mergeOverlay(body.patches as Record<string, Record<string, unknown>>);
        res.json({ ok: true, ...result });
      } catch (e) {
        res
          .status(500)
          .json({ error: e instanceof Error ? e.message : "Save failed" });
      }
    },
  );

  // ----- Community notes (Postgres) --------------------------------------

  app.use("/api/notes", express.json({ limit: "64kb" }));

  // Whether community notes can be persisted on this server.
  app.get("/api/notes/status", (_req: Request, res: Response) => {
    res.json({ enabled: communityNotesEnabled() });
  });

  // Public read: all notes for a person, newest first.
  app.get("/api/notes", async (req: Request, res: Response) => {
    const person = String(req.query.person || "");
    if (!person) return res.json({ notes: [] });
    const notes = await listNotes(person);
    res.json({ notes });
  });

  // Passphrase-gated write: add a note to a person.
  app.post("/api/notes", async (req: Request, res: Response) => {
    if (!communityNotesEnabled()) {
      return res
        .status(503)
        .json({ error: "Community notes are not configured on this server." });
    }
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (rateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests — wait a minute and try again." });
    }
    if (!editPasscodeOk(req.header("x-edit-passcode"))) {
      return res.status(401).json({ error: "Invalid or missing family passphrase." });
    }
    const body = req.body as { personId?: string; author?: string; body?: string; color?: string };
    if (!body || !body.personId || !body.body || !body.body.trim()) {
      return res.status(400).json({ error: "personId and a non-empty body are required." });
    }
    try {
      const note = await addNote({
        personId: String(body.personId),
        author: String(body.author || "Anonymous"),
        body: String(body.body),
        color: typeof body.color === "string" ? body.color : undefined,
      });
      res.json({ ok: true, note });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to add note" });
    }
  });

  // Public, rate-limited: mark a note helpful (+1).
  app.post("/api/notes/:id/helpful", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (rateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests — wait a minute and try again." });
    }
    try {
      const helpful = await markHelpful(String(req.params.id));
      res.json({ ok: true, helpful });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
    }
  });

  // Passphrase-gated: delete a note (moderation).
  app.delete("/api/notes/:id", async (req: Request, res: Response) => {
    if (!editPasscodeOk(req.header("x-edit-passcode"))) {
      return res.status(401).json({ error: "Invalid or missing family passphrase." });
    }
    try {
      await deleteNote(String(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed" });
    }
  });

  // Keep referencing storage so the import isn't tree-shaken / linted away.
  void storage;

  return httpServer;
}
