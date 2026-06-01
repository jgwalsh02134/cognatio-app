import type { Express, Request, Response } from "express";
import express from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { storage } from "./storage";
import { archiveEnabled, getOverlay, mergeOverlay } from "./archive";

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

  // Keep referencing storage so the import isn't tree-shaken / linted away.
  void storage;

  return httpServer;
}
