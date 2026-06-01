#!/usr/bin/env python3
"""
AI Web-Research Assistant — uses OpenAI's web_search tool to find concrete
missing facts about people in the family archive (Walsh / Maloy / Dugan /
Cranwell). Writes structured suggested edits with real source URLs into
client/src/research_suggestions.json so the site's Gaps page can show them
and the in-app editor can apply them with one review-and-commit click.

This version uses the OpenAI Responses API with `web_search` enabled — the
model actually visits FindAGrave, Ancestry, FamilySearch, obituary sites,
NY Historic Newspapers, and parish records, then returns findings with
citations. NOT just analysis of the JSON you already have.

Usage:
    # one-time setup
    cp .env.example .env
    # edit .env to add OPENAI_API_KEY=sk-...
    pip install openai python-dotenv

    # run web research (uses gpt-4o or gpt-4.1 for better tool use)
    python3 analyze_archive.py                       # top 25 people with most gaps
    python3 analyze_archive.py --limit 80            # cover more
    python3 analyze_archive.py --person t0:I12345    # one person
    python3 analyze_archive.py --refresh             # ignore cached, re-research
    python3 analyze_archive.py --duplicates-only     # skip per-person, just refresh
                                                     # the deterministic cross-record pass

The OPENAI_API_KEY is read from .env and used ONLY when this script runs.
It NEVER ends up in the bundle or the deployed site.

Cost note: web_search ~$0.025/query + ~$0.01-0.03 in tokens per person at
gpt-4o-mini, ~$0.05-0.10 at gpt-4.1. Set OPENAI_MODEL env var to override.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

try:
    from openai import OpenAI
except ImportError:
    print("Missing dependency. Run: pip install openai python-dotenv", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "client" / "src" / "data.json"
OUT_PATH = ROOT / "client" / "src" / "research_suggestions.json"
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


SYSTEM_PROMPT = """You are a working genealogy research assistant for the
Walsh, Maloy, Dugan, Cranwell family archive — an American Catholic family
primarily in Albany & Troy NY, with Irish, German, and Anglo lines reaching
back to the 1700s.

Your job: use the web_search tool to find CONCRETE missing facts about a
specific person — not a same-named stranger.

Required search behavior:
- Search FindAGrave, Ancestry public trees, FamilySearch, obituary sites
  (parkerbrosmemorial.com, dignitymemorial.com, legacy.com, wjlyonsfuneralhome.com,
  konicekandcollettfuneralhome.com), local newspaper archives, NYS Historic
  Newspapers, Catholic parish records, US census, Irish civil records.
- Issue multiple queries: "Name findagrave", "Name obituary", "Name City",
  "Surname family City", and surname-variant spellings.
- Visit the actual record/memorial/obituary page — don't return search-result URLs.
- Match findings to THIS person via multiple anchors: year of birth/death,
  place, spouse, parents, occupation. Note explicitly which anchors matched.

Output STRICT JSON matching the schema you're given. No commentary outside JSON.

Confidence:
- "high"   = 3+ anchors matched OR an exact FindAGrave/Ancestry record
- "medium" = 2 anchors matched with a credible source URL
- "low"    = 1 weak anchor but a real URL — still emit as a research lead

NEVER invent or speculate. NEVER produce a fake URL. If nothing matches,
return an empty findings array and explain why in `narrative`.
"""


PERSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "person_research",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "findings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "field": {
                                "type": "string",
                                "enum": [
                                    "birth_date", "birth_place",
                                    "death_date", "death_place",
                                    "burial_date", "burial_place",
                                    "occupation", "military", "education",
                                    "note", "parents_father", "parents_mother",
                                ],
                            },
                            "suggested_value": {"type": "string"},
                            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                            "reasoning": {"type": "string"},
                            "source_title": {"type": "string"},
                            "source_url": {"type": "string"},
                        },
                        "required": [
                            "field", "suggested_value", "confidence",
                            "reasoning", "source_title", "source_url",
                        ],
                    },
                },
                "narrative": {"type": "string"},
                "search_log": {"type": "string"},
            },
            "required": ["findings", "narrative", "search_log"],
        },
    },
}


# ---------- helpers ----------

def years_from_event(ev):
    if not ev or not ev.get("date"):
        return None
    m = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", ev["date"])
    return int(m.group(0)) if m else None


def core_gaps(p):
    g = []
    if not (p.get("birth") or {}).get("date"): g.append("birth_date")
    if not (p.get("birth") or {}).get("place"): g.append("birth_place")
    by = years_from_event(p.get("birth")) or 0
    if not (p.get("death") or {}).get("date") and by < 1940: g.append("death_date")
    if not (p.get("death") or {}).get("place") and by < 1940: g.append("death_place")
    if not (p.get("parent_ids") or []): g.append("parents")
    return g


def person_anchors(p, name_by_id):
    """Build a compact anchor block the LLM uses to disambiguate."""
    parts = [f"NAME: {p.get('name')}", f"ID: {p['id']}"]
    if p.get("sex"): parts.append(f"SEX: {p['sex']}")
    if p.get("birth"):
        parts.append(f"BIRTH: {p['birth'].get('date') or '?'} @ {p['birth'].get('place') or '?'}")
    if p.get("death"):
        parts.append(f"DEATH: {p['death'].get('date') or '?'} @ {p['death'].get('place') or '?'}")
    if p.get("residences"):
        for r in p["residences"][:3]:
            parts.append(f"RESIDENCE: {r.get('date') or '?'} @ {r.get('place') or '?'}")
    if p.get("occupations"):
        occs = [o for o in p["occupations"] if o]
        if occs: parts.append(f"OCCUPATIONS: {'; '.join(occs[:3])}")
    if p.get("military"):
        m = p["military"]
        parts.append(f"MILITARY: {m.get('branch','')} {m.get('conflict','')} {m.get('rank','')} {m.get('unit','')}".strip())
    pids = p.get("parent_ids") or []
    if pids:
        parts.append("PARENTS: " + "; ".join(name_by_id.get(i, i) for i in pids))
    sps = p.get("spouse_ids") or []
    if sps:
        parts.append("SPOUSES: " + "; ".join(name_by_id.get(i, i) for i in sps))
    ch = p.get("child_ids") or []
    if ch:
        parts.append("CHILDREN: " + "; ".join(name_by_id.get(i, i)[:30] for i in ch[:6]))
    return "\n".join(parts)


# ---------- per-person web research ----------

def research_person(client, p, name_by_id):
    gaps = core_gaps(p)
    if not gaps:
        return None
    anchors = person_anchors(p, name_by_id)
    user_msg = (
        f"Person to research:\n\n{anchors}\n\n"
        f"Detected gaps: {', '.join(gaps)}\n\n"
        "Use the web_search tool to find concrete facts for the listed gaps. "
        "Issue at least 3 queries (findagrave, obituary, place-anchored). "
        "Visit the actual record page (not search results) and cite its URL. "
        "Match THIS person via the anchors above — when uncertain, label "
        "confidence as low rather than omitting."
    )
    try:
        resp = client.responses.create(
            model=MODEL,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            tools=[{"type": "web_search"}],
            response_format=PERSON_SCHEMA,
            temperature=0.2,
        )
        # Responses API exposes output_text for the final structured response
        text = resp.output_text
        return json.loads(text)
    except Exception as e:
        # Fall back to web_search_preview tool name (older API)
        try:
            resp = client.responses.create(
                model=MODEL,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                tools=[{"type": "web_search_preview"}],
                response_format=PERSON_SCHEMA,
                temperature=0.2,
            )
            return json.loads(resp.output_text)
        except Exception as e2:
            print(f"  research error for {p['id']}: {e2}", file=sys.stderr)
            return None


# ---------- deterministic cross-record findings ----------
#
# No LLM here — the previous LLM cross-record pass produced noise like
# "Stephen Dugan ↔ James Dempsey same name" and "Walter J Dugan + Walter J
# Dugan thematic cluster". Now we do high-confidence pure-Python detection.

def normalize_name(name: str) -> str:
    """Strip punctuation, lowercase, collapse spaces."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (name or "").lower())).strip()


def name_keys(name: str):
    """Produce a few normalized variants for fuzzy duplicate detection."""
    n = normalize_name(name)
    if not n: return set()
    parts = n.split()
    if not parts: return set()
    keys = {n}
    if len(parts) >= 2:
        # First + Last (drop middle initials/names)
        keys.add(f"{parts[0]} {parts[-1]}")
    return keys


def find_duplicates(individuals):
    """High-confidence duplicate detection: same name + matching birth or death year."""
    out = []
    by_key = {}
    for p in individuals:
        by = years_from_event(p.get("birth"))
        dy = years_from_event(p.get("death"))
        for k in name_keys(p.get("name", "")):
            by_key.setdefault(k, []).append((p, by, dy))

    seen_pairs = set()
    for key, group in by_key.items():
        if len(group) < 2: continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, by_a, dy_a = group[i]
                b, by_b, dy_b = group[j]
                if a["id"] == b["id"]: continue
                pair = tuple(sorted([a["id"], b["id"]]))
                if pair in seen_pairs: continue

                reasons = []
                # Same birth year
                if by_a and by_b and by_a == by_b:
                    reasons.append(f"both born {by_a}")
                elif by_a and by_b and abs(by_a - by_b) <= 2:
                    reasons.append(f"born within 2 years ({by_a}/{by_b})")
                # Same death year
                if dy_a and dy_b and dy_a == dy_b:
                    reasons.append(f"both died {dy_a}")
                elif dy_a and dy_b and abs(dy_a - dy_b) <= 2:
                    reasons.append(f"died within 2 years ({dy_a}/{dy_b})")
                # Same parents
                pa = set(a.get("parent_ids") or [])
                pb = set(b.get("parent_ids") or [])
                if pa and pb and pa == pb:
                    reasons.append("identical parents")
                # Same place
                bpa = (a.get("birth") or {}).get("place"); bpb = (b.get("birth") or {}).get("place")
                if bpa and bpb and bpa == bpb:
                    reasons.append(f"both born in {bpa}")

                if not reasons: continue
                # Confidence: pure name match w/ 2+ corroborating facts = high
                # name+1 fact = medium, name only = excluded
                confidence = "high" if len(reasons) >= 2 else "medium"
                seen_pairs.add(pair)
                out.append({
                    "a_id": a["id"],
                    "a_name": a.get("name"),
                    "b_id": b["id"],
                    "b_name": b.get("name"),
                    "confidence": confidence,
                    "reasons": reasons,
                })
    return out


def find_military_clusters(individuals, name_by_id):
    """Real military clusters by conflict — not made-up themes."""
    clusters = {}
    for p in individuals:
        mil = p.get("military") or {}
        conflict = (mil.get("conflict") or "").strip()
        if not conflict: continue
        clusters.setdefault(conflict, []).append({
            "id": p["id"],
            "name": p.get("name"),
            "branch": mil.get("branch") or "",
            "rank": mil.get("rank") or "",
            "unit": mil.get("unit") or "",
        })
    return [
        {"theme": f"{conflict} veterans", "members": members,
         "note": f"{len(members)} family members served in {conflict}"}
        for conflict, members in sorted(clusters.items(), key=lambda x: -len(x[1]))
        if len(members) >= 2
    ]


def find_place_era_clusters(individuals):
    """Same city/state + same decade of birth — real groupings, no LLM guessing."""
    clusters = {}
    for p in individuals:
        by = years_from_event(p.get("birth"))
        bp = (p.get("birth") or {}).get("place") or ""
        # Reduce place to "City, State"
        m = re.match(r"([^,]+),\s*([^,]+)", bp)
        if not (by and m): continue
        decade = (by // 10) * 10
        place = f"{m.group(1).strip()}, {m.group(2).strip()}"
        # Skip overly generic places
        if place.lower() in ("?, ?", "ireland, ireland", "germany, germany"): continue
        key = f"{place} · {decade}s"
        clusters.setdefault(key, []).append({"id": p["id"], "name": p.get("name"), "year": by})
    return [
        {"theme": key, "members": members,
         "note": f"{len(members)} family members born in {key}"}
        for key, members in sorted(clusters.items(), key=lambda x: -len(x[1]))
        if len(members) >= 3
    ][:10]


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--person")
    ap.add_argument("--refresh", action="store_true",
                    help="Re-research people who already have findings")
    ap.add_argument("--duplicates-only", action="store_true",
                    help="Skip per-person web research, just refresh deterministic cross-record pass")
    ap.add_argument("--no-cross-record", action="store_true")
    ap.add_argument("--data", default=str(DATA_PATH))
    ap.add_argument("--out", default=str(OUT_PATH))
    args = ap.parse_args()

    data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    individuals = data["individuals"]
    name_by_id = {p["id"]: p.get("name", "?") for p in individuals}

    # Load existing suggestions so we accumulate
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": MODEL,
        "web_findings": {},
        "cross_record": {},
    }
    if Path(args.out).exists():
        try:
            existing = json.loads(Path(args.out).read_text(encoding="utf-8"))
            out["web_findings"] = existing.get("web_findings", {}) or {}
            out["cross_record"] = existing.get("cross_record", {}) or {}
        except Exception:
            pass

    if not args.duplicates_only:
        if "OPENAI_API_KEY" not in os.environ:
            print("Missing OPENAI_API_KEY. Set in .env or export it.", file=sys.stderr)
            sys.exit(2)
        client = OpenAI()

        if args.person:
            targets = [p for p in individuals if p["id"] == args.person]
        else:
            ranked = sorted(individuals, key=lambda p: -len(core_gaps(p)))
            already = set(out["web_findings"].keys())
            targets = [
                p for p in ranked
                if core_gaps(p) and (args.refresh or p["id"] not in already)
                and (p.get("name") or "").strip() and "Unknown" not in (p.get("name") or "")
            ][: max(args.limit, 1)]

        print(f"Researching {len(targets)} people via web_search (model={MODEL})…")
        for i, p in enumerate(targets, 1):
            print(f"  [{i}/{len(targets)}] {p['id']}: {p.get('name')}")
            result = research_person(client, p, name_by_id)
            if result:
                out["web_findings"][p["id"]] = result
            time.sleep(0.3)

    if not args.no_cross_record:
        print("Computing deterministic cross-record findings…")
        out["cross_record"] = {
            "duplicates": find_duplicates(individuals),
            "military_clusters": find_military_clusters(individuals, name_by_id),
            "place_era_clusters": find_place_era_clusters(individuals),
        }

    out["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    Path(args.out).write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {args.out}")
    print(f"  web_findings entries: {len(out['web_findings'])}")
    cr = out.get("cross_record", {})
    print(f"  duplicates: {len(cr.get('duplicates', []))}")
    print(f"  military clusters: {len(cr.get('military_clusters', []))}")
    print(f"  place/era clusters: {len(cr.get('place_era_clusters', []))}")
    print("\nNext: `npm run build` to ship the new suggestions to the site.")


if __name__ == "__main__":
    main()
