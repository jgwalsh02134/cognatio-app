# Opening this project in Cursor (or VS Code)

This zip is a complete, self-contained Vite + React + TypeScript project. It
runs locally with two commands and ships as a single static folder.

## 1. Unzip and open

```bash
unzip walsh_maloy_dugan_family_archive_src.zip -d walsh-maloy-dugan
cd walsh-maloy-dugan
cursor .          # or: code .
```

The folder includes pre-configured `.vscode/settings.json` (workspace
TypeScript SDK, format-on-save, Tailwind hints) and `.cursorrules` so
Cursor's AI understands the project conventions from the first prompt.

## 2. Install dependencies

You need **Node.js 18 or newer** (Node 20 LTS recommended) and **npm 9+**.

```bash
node --version       # → v20.x or v22.x
npm --version        # → 10.x

npm install
```

This installs ~300 packages including React, Vite, Tailwind, shadcn/ui,
wouter (router), TanStack Query, Recharts, react-markdown, and the OpenAI
SDK. Takes ~30 seconds on a warm npm cache.

## 3. Run the dev server

```bash
npm run dev
```

Vite serves the site at **http://localhost:5173** with hot module reload.
Edit any file under `client/src/` and the browser updates instantly.

## 4. Build for production

```bash
npm run build
```

Produces a single static folder at **`dist/public/`** (~2 MB gzipped)
containing `index.html`, hashed JS/CSS, and all images. The folder can
be:

- opened directly from disk (double-click `index.html`)
- uploaded to any static host (S3, Netlify, Vercel, Cloudflare Pages,
  GitHub Pages, plain Apache/nginx)
- served locally with `npx serve dist/public`

For small SVG icons (<4 KB) Vite inlines them as data-URIs. If you swap
an icon and don't see the change, **delete `dist/public/` first**, then
rebuild — that forces a fresh inline pass.

## 5. Type-check (no build)

```bash
npx tsc --noEmit
```

## 6. Editing data

The entire family archive lives in `client/src/data.json`. Edit it
directly, or use the **in-app editor** — click the lock icon in the
header, enter the passphrase **`2846`**, then click any pencil icon to
edit names, dates, places, notes, sources, and affiliations. Click the
yellow "N unsaved" badge to review a diff and download a patched
`data.json` (or `apply_changes.py`).

## 7. Optional: AI features

The site has two AI-powered features (Find Missing Info button on each
profile, and a floating chat drawer):

1. Click the lock icon, enter passphrase **`2846`** — this unlocks the
   AI features for trusted family use only.
2. Open the AI chat and enter your **OpenAI API key**. The key is held
   in React state for the session only — it is **never** written to
   `localStorage`, cookies, or any persistent storage.
3. Default model is `gpt-5.4-mini`. You can switch in the chat header
   to `gpt-5.4`, `gpt-5.5` (flagship), or `gpt-5.4-nano` (cheapest).

## 8. Project conventions (read before refactoring)

See `CLAUDE.md` for the full project guide and `.cursorrules` for the
hard rules. Highlights:

- **Never** use `localStorage` / `sessionStorage` / `indexedDB` / cookies
  — the production iframe sandbox blocks them and crashes the page.
- **Hash routing** via wouter (`useHashLocation`) — never path routing.
- **`text-xl` is the maximum** heading size — the aesthetic is editorial.
- **Preserve `t0:` / `t1:` ID namespacing** when adding people/families.
- **Mirror changes** to the JG3 fork (`../family-tree-jgwalsh/`) unless
  told otherwise.

## 9. Folder map

```
client/src/
  data.json          ← THE source of truth (324 people, 113 families)
  App.tsx            ← Router + providers
  index.css          ← Tailwind + design tokens
  pages/             ← Home, PeopleList, PersonDetail, TreeView, Gaps, Export, Changes
  components/        ← AppShell, AIChat, AIContext, EditContext, ScrollToTop, ui/* (shadcn)
  lib/               ← family.ts, gedcomExport.ts, openai.ts, researchLinks.ts
  assets/            ← arms PNGs, affiliation seals, military ribbons

server/              ← thin Express dev-server for the in-app "Save to disk" endpoint
shared/              ← (unused; legacy from the template)
script/              ← build helpers
*.py                 ← GEDCOM + patch scripts (Python 3)
walsh_maloy_dugan_archive.ged  ← canonical GEDCOM 5.5.1 export
```

Happy editing.
