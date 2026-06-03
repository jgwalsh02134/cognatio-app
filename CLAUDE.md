# CLAUDE.md — Walsh · Maloy · Dugan Family Archive

Instructions for Claude Code (and any AI assistant) working on this repo.

---

## Project at a glance

A **static** React + Vite + TypeScript genealogy site for the Walsh, Maloy, Dugan,
Cranwell, and connected families. The full archive (324 individuals, 113 families)
ships as a single `data.json` baked into the bundle — there is no backend, no
database, and no runtime API. Every feature must work when `dist/public/index.html`
is opened directly from disk.

A separate fork lives at `../family-tree-jgwalsh/` (the JG3 branch). When you
make changes here, **mirror them to that fork** unless told otherwise.

---

## Common tasks (fast paths)

| Goal | Do this |
|---|---|
| Install deps | `npm install` |
| Hot-reload dev | `npm run dev` (Vite, http://localhost:5173) |
| Production build | `rm -rf dist/public && npm run build` |
| Preview built site | `npx serve dist/public` |
| Regenerate canonical GEDCOM | `python3 export_gedcom.py` |
| Apply an affiliation update | edit `patch_affiliations.py`, run `python3 patch_affiliations.py` |
| Apply a military awards update | edit `patch_military.py`, run `python3 patch_military.py` |
| Add a coat of arms | drop the PNG into `client/src/assets/arms/`, register it in `components/SurnameArms.tsx` |
| Add an affiliation seal | drop the asset in `client/src/assets/affiliations/`, import + register in `components/Affiliations.tsx` |

Force a clean build (`rm -rf dist/public` before `npm run build`) when **small SVGs
(<4 KB) change** — Vite inlines them as data-URIs and incremental builds sometimes
skip the re-inline.

---

## Architecture

```
client/
  index.html                       ← Vite entry
  src/
    App.tsx                        ← Wouter router (hash-based)
    main.tsx
    index.css                      ← Tailwind + HSL CSS variables
    data.json                      ← THE SOURCE OF TRUTH (324 individuals, 113 families)
    lib/
      family.ts                    ← typed dataset loader; exports `people`, `families`, `stats`, `type Person`, `type Family`, `type EventInfo`
      gedcomExport.ts              ← client-side GEDCOM 5.5.1 builder (used by Download GEDCOM button)
      researchLinks.ts             ← Ancestry/FamilySearch URL helpers
      queryClient.ts               ← TanStack Query (legacy; not used now that there's no API)
      utils.ts                     ← shadcn `cn()` helper
    pages/
      Home.tsx                     ← hero, stats, heraldry, origin countries, honor roll
      PeopleList.tsx               ← searchable/filterable index
      PersonDetail.tsx             ← profile: Facts → Affiliations → Military → Sources → Relatives → Notes
      TreeView.tsx                 ← interactive node graph (Reactflow-style)
      Gaps.tsx                     ← research priorities / duplicates
      Export.tsx                   ← download .ged page
      not-found.tsx
    components/
      AppShell.tsx                 ← top nav + dark-mode toggle
      Affiliations.tsx             ← logo cards (Harvard, Siena, Knights of Malta, etc.)
      MilitaryService.tsx          ← branch insignia + ribbons + awards
      SurnameArms.tsx              ← coat of arms registry + `<SurnameArms>` component
      PersonAvatar.tsx             ← deterministic initial-avatar
      Logo.tsx
      ThemeProvider.tsx
      ui/                          ← shadcn primitives (Button, Card, Input, etc.)
    assets/
      arms/                        ← 16 PNG coats of arms
      military/                    ← branch SVGs + medal/ribbon SVGs
      affiliations/                ← Harvard, Siena, RPI, Cornell, Providence, Fordham,
                                     Westminster, Manhattanville, NYS seal, US House,
                                     Southern Pacific, Knights of Malta
server/                            ← optional Express server (NOT used in production)
shared/                            ← Drizzle schema (legacy, unused)
script/build.ts                    ← Vite + esbuild build pipeline
vite.config.ts                     ← `base: "./"` so the site works from disk
tailwind.config.ts
tsconfig.json
package.json
export_gedcom.py                   ← canonical CLI GEDCOM exporter
patch_affiliations.py              ← affiliations data-patch helper
patch_military.py                  ← military awards data-patch helper
fix_maloy_relationships.py         ← one-off lineage corrections
walsh_maloy_dugan_archive.ged      ← most recently generated GEDCOM (regenerate after data edits)
```

### Data model (`client/src/data.json`)

Top-level keys: `individuals[]`, `families[]`, `stats`.

```ts
type Person = {
  id: string;                  // namespaced: "t0:I…" or "t1:I…" (DO NOT collapse the t0:/t1: prefix)
  name: string;
  given?: string | null;
  surname?: string | null;
  suffix?: string | null;
  sex?: "M" | "F" | null;
  birth?: EventInfo | null;
  death?: EventInfo | null;
  burial?: EventInfo | null;
  residences?: EventInfo[];
  educations?: EventInfo[];
  occupations?: (string | null)[];
  notes?: (string | null)[];
  parent_ids?: string[];
  spouse_ids?: string[];
  child_ids?: string[];
  family_child_ids?: string[];   // FAMs they appear in as a child
  family_spouse_ids?: string[];  // FAMs they appear in as a spouse
  military?: MilitaryRecord | null;
  affiliations?: Affiliation[];
};

type Family = {
  id: string;                  // namespaced
  husband_id?: string;
  wife_id?: string;
  children_ids?: string[];
  marriage?: EventInfo | null;
  divorce?: EventInfo | null;
};

type EventInfo = { date?: string|null; place?: string|null; note?: string|null };

type Affiliation = {
  key: string;                 // lowercase identifier mapped in components/Affiliations.tsx
  name: string;
  role?: string | null;
  dates?: string | null;
  note?: string | null;
};
```

The `t0:` / `t1:` prefix on every ID encodes which of the two source GEDCOM
exports the record came from — **always preserve it**.

---

## Conventions

### Routing
- Hash routing only (`#/people`, `#/person/:id`, `#/tree`, `#/export`).
- Use `useLocation`, `Link`, etc. from **wouter**, never react-router.

### Styling
- Tailwind 3. HSL CSS variables defined in `index.css` (`--background`, `--primary`, etc.).
- Don't hard-code colors — always reference tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`).
- **Max heading size is `text-xl`** — hierarchy comes from weight + font-family, not size.
- Serif headlines = `font-display` (Source Serif 4). Body = default sans (Inter). Mono = `font-mono` (IBM Plex Mono).
- Hover/active uses `hover-elevate active-elevate-2` utility classes (defined in `index.css`), never `hover:scale-*`.

### Interactions
- Add `data-testid="…"` to every interactive element. Use kebab-case (`button-download-gedcom`, `cta-people`).
- Forms use `apiRequest` from `@/lib/queryClient` IF they need to hit a server. **The current build has no server, so most pages should not need this.**
- **No `localStorage` / `sessionStorage`** for genealogical state — the dataset lives in `data.json`. Theme preference in localStorage is fine.

### Components & imports
- Path alias `@/` resolves to `client/src/`.
- Use existing shadcn components from `client/src/components/ui/` rather than installing new UI libraries.
- Lucide icons at `h-4 w-4` (inline) or `h-5 w-5` (nav). Stroke 1.75 looks best — that's the lucide default.

### Asset handling
- New images go under `client/src/assets/<category>/` and are imported (not `<img src="/foo.png">`).
- SVGs are imported as URLs (`import seal from "@/assets/affiliations/foo.svg"` → use as `<img src={seal} />`).

---

## In-app editor (v1)

Trusted family members can stage edits live in the browser without ever
touching the source. Behind a passphrase-gated Edit Mode, the header reveals a
pencil affordance next to every editable field (name, sex, birth / death /
burial date+place, notes, sources, affiliations).

- **Unlock**: header lock icon → enter passphrase → confirm.
  - Passphrase hash lives in `client/src/components/EditContext.tsx` as a
    constant (SHA-256, no plaintext anywhere). To rotate:
    ```bash
    python3 -c "import hashlib; print(hashlib.sha256(b'NEWPHRASE').hexdigest())"
    ```
    Replace `EDIT_PASSPHRASE_HASH` in BOTH projects (main + JG3 fork).
- **State**: a React context (`EditProvider`) holds pending patches in memory.
  No localStorage / sessionStorage / IndexedDB — reload clears everything
  (with a `beforeunload` warning if changes exist).
- **Saving**: the `Changes` page (`/#/changes`) shows a per-person before/after
  diff and three commit paths:
  1. **Save to data.json** — visible only when `npm run dev` is running; POSTs
     the merged file to `/api/data` and the Express handler writes
     `client/src/data.json` directly.
  2. **Download data.json** — drop-in replacement file.
  3. **Download apply_changes.py** — a patch script in the same idiom as the
     existing `patch_*.py` scripts; commit it to the repo if you want history.
- **Mirror rule still applies.** Any change to editor components, the unlock
  flow, or the routes must be copied to the JG3 fork before redeploying.

The editor does NOT yet edit relationships (parents/spouse/children) or
marriage records — those touch FAM structures and are reserved for v2.

---

## Data-editing playbook (Python patch scripts)

When the user says "add X to person Y":

1. **Find the person**: search `client/src/data.json` for the name. Note the full ID including the `t0:`/`t1:` prefix.
2. **Decide if it's an affiliation, military update, or facts change.**
3. **For affiliations**:
   - Edit `patch_affiliations.py`, add the person ID and an Affiliation dict.
   - If the institution is new, drop its logo into `client/src/assets/affiliations/` and register it (lowercase keys + aliases) in `components/Affiliations.tsx`.
   - Run `python3 patch_affiliations.py`.
4. **For military updates**: edit `patch_military.py`, run it.
5. **For one-off relationship/structure fixes**: write a new `fix_*.py` script (use `fix_maloy_relationships.py` as a template). Don't hand-edit `data.json` directly when the change touches more than one record.
6. **After any data change**:
   ```bash
   rm -rf dist/public && npm run build
   python3 export_gedcom.py        # refresh the canonical .ged
   ```
7. **Mirror to the JG3 fork** (`../family-tree-jgwalsh/`) unless told otherwise. The patch scripts list both data.json paths and update them together.

### Adding a new affiliation logo

```tsx
// 1. drop file in client/src/assets/affiliations/some_seal.svg
// 2. edit components/Affiliations.tsx:
import someSeal from "@/assets/affiliations/some_seal.svg";
const AFFILIATION_LOGOS: Record<string, string> = {
  // ...
  some_thing: someSeal,
  some_thing_alias: someSeal,
};
// 3. mirror the asset to ../family-tree-jgwalsh/client/src/assets/affiliations/
// 4. mirror the component file too
```

---

## GEDCOM export (important!)

Both the in-app **Download GEDCOM** button (`client/src/lib/gedcomExport.ts`)
and the CLI script (`export_gedcom.py`) produce GEDCOM 5.5.1 files. They must
stay in sync — if you change one, change the other.

Key rules they both enforce:

- UTF-8, CRLF line endings, 200-char lines with `CONC`/`CONT`.
- xrefs preserve the `t0:`/`t1:` namespace: `@T0I18635645027@`, `@T1F11@`.
- Custom `EVEN` blocks with `2 TYPE Education`, `2 TYPE Military Service`,
  `2 TYPE Affiliation`.
- Names emitted as `Given /Surname/ Suffix` per the spec.

---

## Don'ts

- ❌ Don't strip the `t0:`/`t1:` namespace from IDs anywhere — it prevents xref collisions.
- ❌ Don't introduce a backend or runtime API. The whole project is static.
- ❌ Don't add `localStorage` for genealogical data.
- ❌ Don't use react-router. We use wouter with hash routing.
- ❌ Don't bump headings past `text-xl`.
- ❌ Don't hand-edit `data.json` for any change that touches more than one record — use a patch script.
- ❌ Don't forget to run `python3 export_gedcom.py` after a data edit.
- ❌ Don't forget to mirror data + component changes to `../family-tree-jgwalsh/` (the JG3 fork).

---

## Helpful context for genealogy work

- The dataset was reconciled from two Ancestry.com GEDCOM exports (`t0:` and `t1:`).
- Some individuals appear in both source files; the namespacing prevents collisions
  during export. A future task may be to deduplicate, but for now keep both.
- `military` records use lowercase branch keys: `army`, `navy`, `marines`,
  `coast_guard`, `air_force`. The component maps each to a branch insignia SVG.
- Affiliations recognized today: Harvard, Knights of Malta (SMOM), Siena
  University, RPI, Cornell, Providence, Fordham, Westminster (Missouri),
  Manhattanville, Manhattan College, NY State Public Service Commission,
  U.S. House of Representatives, Southern Pacific Railroad.

---

## When in doubt

Read `README.md` for the build flow, then `client/src/pages/Home.tsx` to see how
the existing patterns are wired together. The home page touches almost every
component (Hero CTA, stats, person card, surname arms grid, country flags,
military badges, honor roll), so it's the best one-file overview of the system.

---

## FamilySearch OAuth2 Integration

The app supports a server-side FamilySearch integration that fetches matching
genealogy records and grounds AI research in verified data. Tokens are stored
exclusively in Postgres — they never reach the browser.

### Registering the app with FamilySearch

1. Go to <https://www.familysearch.org/developers/> and sign in.
2. Create a new app (or use an existing one). Choose **Web App** as the app type.
3. Under **Redirect URIs**, add your exact callback URL:
   `https://your-domain.com/api/familysearch/callback`
   (For local dev: `http://localhost:5000/api/familysearch/callback`)
4. Note the **Client ID** and **Client Secret** from the app settings page.
5. Set the environment variables (see `.env.example`):
   ```
   FAMILYSEARCH_CLIENT_ID=your-client-id
   FAMILYSEARCH_CLIENT_SECRET=your-client-secret
   FAMILYSEARCH_REDIRECT_URI=https://your-domain.com/api/familysearch/callback
   FAMILYSEARCH_STATE_SECRET=some-long-random-string
   ```
6. For the FamilySearch sandbox (integration environment), also set:
   `FAMILYSEARCH_ENV=integration`
   and register the redirect URI in the integration app separately.

### Connect / disconnect flow

1. A family editor unlocks edit mode (lock icon, top right).
2. On any person's profile page, scroll to **Matching records (FamilySearch)**.
3. Click **Connect FamilySearch** — a popup opens to the FamilySearch authorize page.
4. The user signs in to FamilySearch and grants access.
5. FamilySearch redirects to `/api/familysearch/callback`, which exchanges the
   code for tokens, stores them in Postgres, and shows a "connected" confirmation
   page. The popup can then be closed.
6. The client polls `/api/familysearch/status` every 2 seconds until
   `connected: true` is returned, then updates the UI automatically.
7. To disconnect, click **Disconnect** (edit mode required). This deletes the
   token row from Postgres.

### Token storage

- Tokens live in the `familysearch_tokens` table (auto-created on first use).
- Only one row exists (`id = 'linked'`) — this is a shared family account, not
  per-user. All editors share the same FamilySearch connection.
- The access token is refreshed automatically when it is within 5 minutes of
  expiry. The rotated refresh token is persisted back to Postgres.
- Tokens are **never** sent to the browser or logged.

### Shared-account caveat

Because the app has no per-user accounts, the FamilySearch connection is shared
across all family editors. Whoever connects last wins. This is intentional —
the app is designed for a small, trusted family group. If you need per-user
isolation, you would need to add user accounts first.

### Security notes

- The OAuth `state` parameter is HMAC-signed (SHA-256, keyed with
  `FAMILYSEARCH_STATE_SECRET`), includes an expiry timestamp, and is single-use
  (nonces are tracked in memory). This prevents CSRF on the callback endpoint.
- The redirect URI must be an exact match of what is registered with FamilySearch.
- All token-modifying endpoints (`/connect-url`, `/disconnect`) require the
  family edit passphrase (`x-edit-passcode` header).
- Rate limiting applies to `/connect-url`, `/callback`, and `/search`.

### AI research grounding

When FamilySearch is connected and a person profile is open, the **Find missing
info** AI research button will automatically fetch FamilySearch candidates first
and inject them into the model's prompt under `FAMILYSEARCH RECORDS (verified
via API)`. The model is instructed to cite these URLs directly and extract
birth/death data from them before falling back to web search.

---

## AI Research Assistant (OpenAI, local-only)

This project includes `analyze_archive.py` — a local CLI that uses your
OpenAI API key to suggest research leads and flag possible cross-record
connections. The key is read from `.env` and is **never** baked into the
client bundle or the deployed site.

### Workflow

```
.env (local, gitignored)
  │  OPENAI_API_KEY=sk-...
  ▼
python3 analyze_archive.py
  │  • reads client/src/data.json
  │  • calls OpenAI (default model: gpt-4o-mini)
  │  • writes client/src/research_suggestions.json
  ▼
npm run build
  │  Vite inlines research_suggestions.json into the bundle
  ▼
Deployed site reads suggestions statically — no API call at runtime
```

### Setup

```bash
cp .env.example .env
# edit .env, paste your key from https://platform.openai.com/api-keys
pip install openai python-dotenv
```

### Common runs

```bash
python3 analyze_archive.py                       # top 20 people with most gaps
python3 analyze_archive.py --limit 50            # widen the per-person pass
python3 analyze_archive.py --person t0:I18635645027   # one specific person
python3 analyze_archive.py --connections-only    # just the cross-record pass
python3 analyze_archive.py --no-connections      # just per-person research
OPENAI_MODEL=gpt-4o python3 analyze_archive.py   # override model
```

After running, `npm run build` and the **Gaps** page shows:
- An "AI cross-record findings" panel (duplicates, relationships, clusters)
- An "AI research suggestions" subcard under each person who has results

### Output schema (`client/src/research_suggestions.json`)

```jsonc
{
  "generated_at": "2026-05-23T14:32:00Z",
  "model": "gpt-4o-mini",
  "per_person": {
    "t0:I...": {
      "research_priorities": [
        { "gap": "death_date", "suggestion": "...", "sources_to_check": ["FindAGrave", "..."], "likely_answer": "..." }
      ],
      "narrative": "2-3 sentence editorial summary"
    }
  },
  "connections": {
    "potential_duplicates":    [{ "a_id": "...", "b_id": "...", "reason": "..." }],
    "potential_relationships": [{ "a_id": "...", "b_id": "...", "relationship": "...", "reason": "..." }],
    "thematic_clusters":       [{ "theme": "...", "members": ["..."], "note": "..." }]
  }
}
```

### Hard rules

- ❌ Never put `OPENAI_API_KEY` in `data.json`, source code, or the bundle.
- ❌ Never commit `.env`. (`.gitignore` already protects it.)
- ❌ Never call OpenAI from the browser — there is no server, and the key
  would leak. All AI work happens in the local Python script.
- ✅ Audience for these suggestions is **trusted family only** — the site
  ships as a static download. If you ever publish to a wider audience,
  manually review every AI-generated line first.
- ✅ Mirror any change to `analyze_archive.py` or the JSON schema to the
  JG3 fork (`../family-tree-jgwalsh/`).
