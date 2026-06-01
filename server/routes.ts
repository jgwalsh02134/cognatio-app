import type { Express, Request, Response } from "express";
import express from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { storage } from "./storage";

// Resolve the canonical data.json path. The dev server runs from project root,
// so this becomes `<root>/client/src/data.json`. The endpoint only writes when
// the file already exists (i.e. we're inside the source checkout), so it's a
// no-op in production bundles where the file isn't shipped alongside the server.
const DATA_PATH = path.resolve(process.cwd(), "client/src/data.json");

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

  // Keep referencing storage so the import isn't tree-shaken / linted away.
  void storage;

  return httpServer;
}
