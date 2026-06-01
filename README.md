# Walsh · Maloy · Dugan Family Archive

A static, single-page React + Vite genealogy site for the Walsh, Maloy, and
Dugan families — built from two reconciled Ancestry.com GEDCOM exports and
enriched with military service, awards, education, and affiliations
(Harvard, Knights of Malta, Siena, RPI, NYS PSC, U.S. House, Southern Pacific
Railroad, and more).

The app is **fully static once built** — the entire archive ships inside the
JavaScript bundle, so the production output is a folder of HTML/CSS/JS that
can be opened directly from disk or hosted on any static web server.

---

## Editing in the browser

The site has a built-in **in-app editor (v1)** for trusted family members to
update names, dates, places, notes, sources, and affiliations directly on each
person's page — no GEDCOM round-trip required.

1. Click the **lock icon** in the header and enter the family passphrase.
2. Click any pencil icon next to a name, date, place, note, source, or
   affiliation to edit it. A yellow "N unsaved" badge appears in the header.
3. Click the badge (or visit `/#/changes`) to review a before/after diff.
4. Commit changes one of three ways:
   - **Save to data.json** (only available when running `npm run dev` — writes
     directly to `client/src/data.json` via the local Express endpoint).
   - **Download data.json** — drop the file in `client/src/` and rebuild.
   - **Download apply_changes.py** — a self-contained patch script you can
     run on any machine with Python 3 to mutate `data.json` in place.

**Passphrase rotation:** change the hash in
`client/src/components/EditContext.tsx` (constant `EDIT_PASSPHRASE_HASH`):

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'NEW_PASSPHRASE').hexdigest())"
```

Marriage/relationship editing is deferred to v2 — for those, continue using
the Python patch-script workflow described below.

---

## Live download / build (no setup required)

The site itself contains a one-click **Download GEDCOM** button on the home
page that exports the entire archive as a standards-compliant GEDCOM 5.5.1
(`.ged`) file you can import into Ancestry, FamilySearch, MyHeritage,
RootsMagic, Gramps, Reunion, etc.

A canonical CLI generator is also included at the repo root:

```bash
python3 export_gedcom.py
```

That command writes `walsh_maloy_dugan_archive.ged` next to this README.

---

## Running locally

### Prerequisites

- **Node.js 18+** (Node 20 LTS recommended)
- **npm 9+** (ships with Node)

### One-time install

```bash
npm install
```

### Development server (hot reload)

```bash
npm run dev
```

The Vite dev server runs on `http://localhost:5173`. The site uses hash
routing, so all pages are reachable as `#/people`, `#/tree`, `#/export`, etc.

### Production build

```bash
npm run build
```

The compiled site lands in `dist/public/`. Every asset is content-hashed and
the `index.html` references relative paths (`base: "./"`), so you can:

- Open `dist/public/index.html` directly from disk in any modern browser, **or**
- Serve the folder with any static file server:

```bash
npx serve dist/public
# or
python3 -m http.server -d dist/public 8080
```

---

## Packaging as a downloadable archive

The repo is intentionally self-contained — every photo, coat of arms,
military insignia, and college seal is committed under
`client/src/assets/`. To produce a portable source bundle for someone else,
just zip the project after removing the dev artifacts:

```bash
rm -rf node_modules dist
cd ..
zip -r walsh_maloy_dugan_family_archive_src.zip family-tree \
  -x '**/node_modules/*' -x '**/dist/*' -x '**/.DS_Store'
```

The recipient runs `npm install && npm run build` and gets the same site.

---

## Project layout

```
family-tree/
├── client/                  # React app source
│   ├── index.html
│   └── src/
│       ├── App.tsx          # Wouter router
│       ├── data.json        # The genealogical dataset (source of truth)
│       ├── pages/           # Home, PeopleList, PersonDetail, TreeView, Gaps, Export
│       ├── components/      # AppShell, Affiliations, MilitaryService, SurnameArms, etc.
│       ├── lib/
│       │   ├── family.ts        # Typed data layer
│       │   └── gedcomExport.ts  # GEDCOM 5.5.1 exporter (used by the Download button)
│       └── assets/
│           ├── arms/            # 16 coats of arms (PNG)
│           ├── military/        # branch insignia + medals/ribbons (SVG)
│           └── affiliations/    # Harvard, Siena, Knights of Malta, NYS seal, etc.
├── server/                  # Optional Express server (used in dev for SSR-less hosting)
├── shared/                  # Drizzle schema (legacy, unused in the static build)
├── script/build.ts          # Vite + esbuild build pipeline
├── vite.config.ts
├── tailwind.config.ts
├── package.json
└── export_gedcom.py         # Standalone CLI GEDCOM generator
```

---

## Updating the archive

Edits to people, families, military records, and affiliations live in
`client/src/data.json`. The Python helper scripts at the repo root apply
common patches:

```bash
python3 patch_military.py          # awards, ribbons, KIA flags
python3 patch_affiliations.py      # Harvard, KoM, Siena, college seals, etc.
python3 fix_maloy_relationships.py # one-off lineage corrections
python3 export_gedcom.py           # regenerate the canonical .ged
```

After any data edit, rebuild with `npm run build` and the home page's
**Download GEDCOM** button will reflect the change immediately.

---

## Tech stack

- **React 18** + **TypeScript** + **Vite 7**
- **Tailwind CSS 3** with shadcn/ui (Radix) primitives
- **Wouter** for hash routing
- **Lucide** for icons
- **Recharts** + **Embla** for charts/carousels where used
- Data lives in a single committed `data.json`; no runtime database

---

## License

Family history records belonging to the Walsh, Maloy, Dugan, Cranwell,
Flavin, Reilly, Gaynor, Galbraith, Faden, Keough, Kessler, Quandt, Leahy,
Maier, Crummey, Riordan, and related lines. Private family use only.

---

## Optional: AI research assistant

To get OpenAI-generated research leads + duplicate/relationship flags on
the Gaps page, run locally:

```bash
cp .env.example .env
# edit .env to add your OPENAI_API_KEY
pip install openai python-dotenv
python3 analyze_archive.py
npm run build
```

The API key lives only in your local `.env` (gitignored). The script
writes `client/src/research_suggestions.json`, which Vite inlines into
the static bundle at build time. The deployed site never makes an
OpenAI call. See **CLAUDE.md → "AI Research Assistant"** for full
options.
