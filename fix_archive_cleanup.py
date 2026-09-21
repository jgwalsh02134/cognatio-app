#!/usr/bin/env python3
"""Clean logistical errors that the records themselves make obvious.

Places: drop a repeated state or country ("New York, New York, New York"),
and fix strings that name two different states. People: merge records that
share a birth year (within a year) plus the same spouse, parent, or death
date — not people who merely share a name. Sex: fill it when a family role
or an unambiguous given name already decides it.

Does not merge namesakes born decades apart (fathers and sons).

    python3 fix_archive_cleanup.py
"""
import json
import re
from collections import Counter
from pathlib import Path

DATA = Path("client/src/data.json")

# drop_id -> keep_id. The kept record is the fuller one.
MERGES = {
    # Same birth year 1920 and death 7 Dec 2012; the kept record is the wife.
    "t0:I372634356507": "t0:I372634356131",
    # Same birth 5 Aug 1890, death June 1956, wife of Walter J Dugan.
    "t1:I102119268177": "t0:I18635922801",
    # Same death 14 Apr 1956 in New Rochelle; mother of Edward H. Cranwell Jr.
    # The t1 copy was also attached as her son's wife.
    "t1:I102119268425": "t0:I19744215649",
    # Same death 8 Feb 1968, same husband and children. Birth year disagrees
    # (1877 vs 1879) and is preserved as a note rather than overwritten.
    "t1:I102119268454": "t0:I19744304033",
    # Mother of Edith. t1 has no dates; t0 has a birth and the maiden name.
    "t1:I102624528667": "t0:I372535859984",
    # Same birth 19 Sep 1897 and death May 1978, wife of John Gaynor Walsh.
    "t1:I102119268128": "t0:I19744849560",
    # Same father and same wife; 1926 is the undated twin of 29 May 1925.
    "t0:I29550637674": "t0:I29550637901",
}

US_STATES = {
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
    "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
    "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "new york", "north carolina", "north dakota", "ohio",
    "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
    "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
    "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
}
COUNTRY_TAILS = {
    "usa": "USA",
    "u.s.a.": "USA",
    "u.s.": "USA",
    "us": "USA",
    "united states": "USA",
    "united states of america": "USA",
    "america": "USA",
}


def tidy_place(place):
    if not place or not isinstance(place, str):
        return place
    original = place
    s = re.sub(r"\s+", " ", place).strip().strip(",")
    s = s.replace(" ,", ",").replace(", ", ", ")
    s = re.sub(r",(?=\S)", ", ", s)
    explicit = {
        "Albany, New York-Died In Childbirth": "Albany, New York, USA",
        "Albany, N.y.": "Albany, New York, USA",
        "Albany, N.Y.": "Albany, New York, USA",
        "Albany New York, USA": "Albany, New York, USA",
        "Albany New York": "Albany, New York, USA",
        "Albany city, Albany, New York": "Albany, Albany, New York, USA",
        "St. Peter's Cemetery Troy, NY": "St. Peter's Cemetery, Troy, New York, USA",
        "St. Peter's Cemetery Troy, NY United States": "St. Peter's Cemetery, Troy, New York, USA",
        "Gaspreau, Kings, Nova Scotia": "Gaspereau, Kings, Nova Scotia, Canada",
        "Gaspreau, Kings, Nova Scotia, Canada": "Gaspereau, Kings, Nova Scotia, Canada",
        "Rennselaer, New York, USA": "Rensselaer, New York, USA",
        "Cathedral of the Immaculate Conception Albany, New York, USA": "Cathedral of the Immaculate Conception, Albany, New York, USA",
        "Doane Stuart Chapel Albany, New York, USA": "Doane Stuart Chapel, Albany, New York, USA",
        "County, Meath, Ireland": "County Meath, Ireland",
        "Co, Kilkenny, Ireland": "County Kilkenny, Ireland",
        "Brooklodge, 5298, Ireland": "Brooklodge, Ireland",
        "Abbey Paisley,Renfrew,Scotland": "Abbey Paisley, Renfrew, Scotland",
        "Worchester, Mass.": "Worcester, Massachusetts, USA",
        "UTICA NY": "Utica, Oneida, New York, USA",
        "Wurtemburg": "Württemberg, Germany",
        "PA": "Pennsylvania, USA",
        "New York USA, New York, USA": "New York, USA",
        "Menands, Albany, New York USA, California, USA": "Menands, Albany, New York, USA",
        "Manhattan (Districts 501-750), Manhattan, New York, New York, USA": "Manhattan (Districts 501-750), New York, USA",
        "Clear Creek": "Clear Creek, Johnson, Iowa, USA",
        "Wolcott": "Wolcott, Lamoille, Vermont, USA",
    }
    if s in explicit:
        return explicit[s]

    raw = [p.strip() for p in s.split(",") if p.strip()]
    parts = []
    for p in raw:
        m = re.match(r"^(.*)\s+(USA|United States(?: of America)?)$", p, re.I)
        if m and m.group(1).strip():
            parts.append(m.group(1).strip())
            parts.append(m.group(2))
        else:
            parts.append(p)

    # A place cannot be in New York and California. Menands is Albany County, NY.
    lows = [p.lower() for p in parts]
    if "new york" in lows and "california" in lows:
        parts = [p for p in parts if p.lower() != "california"]

    cleaned = []
    for p in parts:
        key = p.lower().rstrip(".")
        if key in {"ny", "n.y"}:
            p = "New York"
            key = "new york"
        if cleaned and key == cleaned[-1].lower().rstrip("."):
            # City and county often share a name (Albany, Albany). Only a
            # repeated country token is dropped here. Repeated "New York"
            # (city, then state) is handled below.
            if key in COUNTRY_TAILS:
                continue
        if key in COUNTRY_TAILS:
            p = COUNTRY_TAILS[key]
            if cleaned and cleaned[-1] == "USA":
                continue
        cleaned.append(p)

    # "Manhattan, New York, New York" — the locality is already more specific
    # than the city, so the second "New York" repeats the state.
    ny = [i for i, p in enumerate(cleaned) if p.lower() == "new york"]
    if len(ny) >= 2:
        specific = any(
            p.lower() not in {"new york", "usa"}
            for p in cleaned[: ny[-1]]
        )
        # Three "New York"s is city + state + a duplicate. Two "New York"s
        # after a borough (Manhattan, Queens) repeat the state. Two "New York"s
        # alone are New York City and New York State, and both stay.
        if specific or len(ny) >= 3:
            keep = 1 if specific else 2
            new_parts = []
            seen_ny = 0
            for p in cleaned:
                if p.lower() == "new york":
                    seen_ny += 1
                    if seen_ny > keep:
                        continue
                new_parts.append(p)
            cleaned = new_parts

    # US places that name a state should end in one country token.
    if any(p.lower() in US_STATES for p in cleaned):
        if not cleaned or cleaned[-1] != "USA":
            if cleaned and cleaned[-1].lower() in COUNTRY_TAILS:
                cleaned[-1] = "USA"
            else:
                cleaned.append("USA")

    result = ", ".join(cleaned)
    return result or original


def walk_places(node, changed):
    if isinstance(node, dict):
        if "place" in node and isinstance(node["place"], str):
            nxt = tidy_place(node["place"])
            if nxt != node["place"]:
                changed.append((node["place"], nxt))
                node["place"] = nxt
        for v in node.values():
            walk_places(v, changed)
    elif isinstance(node, list):
        for v in node:
            walk_places(v, changed)


def retarget(node, mapping):
    if isinstance(node, dict):
        for k, v in list(node.items()):
            if k == "id" and isinstance(v, str) and v in mapping:
                continue
            node[k] = retarget(v, mapping)
        return node
    if isinstance(node, list):
        return [retarget(v, mapping) for v in node]
    if isinstance(node, str) and node in mapping:
        return mapping[node]
    return node


def dedupe(seq):
    out = []
    for x in seq or []:
        if x and x not in out:
            out.append(x)
    return out


def add_note(person, text):
    notes = [n for n in (person.get("notes") or []) if n]
    if text not in notes:
        notes.append(text)
    person["notes"] = notes


def person_name(p):
    given = (p.get("given") or "").strip()
    surname = (p.get("surname") or "").strip()
    if given and surname:
        return f"{given} {surname}"
    return given or surname or p.get("name") or ""


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    by = {p["id"]: p for p in data["individuals"]}

    # Field fills that must happen before the dropped record disappears.
    mary = by["t0:I19744215649"]
    mary["surname"] = "McCarthy"
    mary["name"] = person_name(mary)
    add_note(mary, "A second export gives her birth year as 1874. This record keeps May 1872.")

    edith = by["t0:I19744304033"]
    add_note(
        edith,
        "A second export records her birth as 25 Mar 1877 in Rhode Island, and spells the middle name Maud. This record keeps 26 Mar 1879, Providence, and Maude.",
    )
    # Father is on the dropped Edith Maud record and is copied by retargeting
    # her parent_ids only if we union them. Union parents explicitly.
    father = "t1:I102119741545"
    if father not in (edith.get("parent_ids") or []):
        edith.setdefault("parent_ids", []).append(father)

    ella = by["t0:I372535859984"]
    add_note(ella, "Married name Caldwell; wife of William Minns Caldwell.")
    if father not in (ella.get("spouse_ids") or []):
        ella.setdefault("spouse_ids", []).append(father)

    riley = by["t0:I19744849560"]
    riley["given"] = "Mary F."
    riley["name"] = person_name(riley)
    add_note(riley, "Also recorded as Mary F. Reilly.")
    reilly_father = "t1:I102624922981"
    if reilly_father not in (riley.get("parent_ids") or []):
        riley.setdefault("parent_ids", []).append(reilly_father)

    betty = by["t0:I372634356131"]
    betty["sex"] = "F"

    by["t0:I29577991891"]["sex"] = "F"  # May Helen, daughter of Joseph P. Dugan
    by["t0:I29550636913"]["sex"] = "M"  # Joseph Warren Faden, Jr.

    # Given-name punctuation that is not an abbreviation.
    louis = by["t0:I29577903368"]
    louis["given"] = "Louis F."
    louis["name"] = person_name(louis)
    josephp = by["t0:I29577946350"]
    josephp["given"] = "Joseph P"
    josephp["name"] = person_name(josephp)

    # Infant death note was stored inside the place string.
    william_infant = by["t0:I19808837839"]
    if william_infant.get("death"):
        william_infant["death"]["note"] = "Died in childbirth"

    # Grandson's death date is his grandfather's (1944), twenty years before
    # his own birth. The death is not his.
    james_henry = by["t0:I18635654544"]
    james_henry["death"] = None

    # Date missing a space: "February 12,2015"
    mary_meade = by["t0:I19746204874"]
    if mary_meade.get("death") and mary_meade["death"].get("date"):
        mary_meade["death"]["date"] = re.sub(
            r",(?=\d)", ", ", mary_meade["death"]["date"]
        )

    # Fragment residences that are not places.
    def drop_places(person, banned):
        person["residences"] = [
            r for r in (person.get("residences") or [])
            if (r.get("place") or "").strip() not in banned
        ]

    drop_places(by["t0:I19886650464"], {"New", "York"})
    drop_places(by["t1:I102119741545"], {"Ward"})
    # Same-day "Johnson, Iowa" is the county half of Clear Creek.
    for pid in ("t0:I19746204737", "t0:I19746204874"):
        kept = []
        for r in by[pid].get("residences") or []:
            if (r.get("place") or "").strip() == "Johnson, Iowa, USA" and r.get("date") == "1 Jan 1925":
                continue
            kept.append(r)
        by[pid]["residences"] = kept

    data = retarget(data, MERGES)
    by = {p["id"]: p for p in data["individuals"]}

    # Families that duplicated a marriage or attached a person as their own child.
    drop_fams = {"t1:F5", "t1:F10", "t1:F14", "t1:F17", "t0:F33", "t0:F98"}
    # t1:F14's husband (William Minns) should stay on Ella's family.
    for fam in data["families"]:
        if fam["id"] == "t0:F101" and not fam.get("husband_id"):
            fam["husband_id"] = "t1:I102119741545"

    data["families"] = [f for f in data["families"] if f["id"] not in drop_fams]

    # Edward H. Cranwell Jr. is not his own parent, not his mother's husband,
    # and not a child of his grandparents.
    jr = by["t0:I19744180137"]
    jr["parent_ids"] = ["t0:I19744215609", "t0:I19744215649"]
    jr["spouse_ids"] = [s for s in jr.get("spouse_ids") or [] if s != "t0:I19744215649"]
    jr["child_ids"] = [c for c in jr.get("child_ids") or [] if c != jr["id"]]
    jr["family_child_ids"] = ["t0:F83"]
    jr["family_spouse_ids"] = ["t0:F3"]
    for pid in ("t0:I372433897708", "t0:I372433897803"):
        by[pid]["child_ids"] = [c for c in by[pid].get("child_ids") or [] if c != jr["id"]]
    for fam in data["families"]:
        if fam["id"] == "t0:F59":
            fam["children_ids"] = [c for c in fam.get("children_ids") or [] if c != jr["id"]]

    # Walter J Dugan is not his own parent or child, and his wife is not his mother.
    walter = by["t0:I18635890324"]
    walter["parent_ids"] = ["t0:I18635953178", "t0:I18635953179"]
    walter["child_ids"] = [c for c in walter.get("child_ids") or [] if c != walter["id"]]
    walter["family_child_ids"] = ["t0:F89"]
    walter["family_spouse_ids"] = ["t0:F47"]

    # John Maloy is James Henry's great-grandfather, not his father.
    john = by["t0:I18635810354"]
    john["child_ids"] = [c for c in john.get("child_ids") or [] if c != "t0:I18635654544"]
    john["family_spouse_ids"] = [f for f in john.get("family_spouse_ids") or [] if f != "t1:F17"]
    james_henry = by["t0:I18635654544"]
    james_henry["family_child_ids"] = ["t0:F11"]

    # William C's extra marriage family was dropped; point him at the dated one.
    william_c = by["t0:I29550637901"]
    william_c["family_spouse_ids"] = ["t0:F5"]
    william_c["family_child_ids"] = ["t0:F18"]
    # Father's child list should not depend on the dropped family.
    father_wj = by["t0:I18669423251"]
    if william_c["id"] not in (father_wj.get("child_ids") or []):
        father_wj.setdefault("child_ids", []).append(william_c["id"])

    data["individuals"] = [p for p in data["individuals"] if p["id"] not in MERGES]
    by = {p["id"]: p for p in data["individuals"]}
    fam_ids = {f["id"] for f in data["families"]}

    def scrub_person(p):
        pid = p["id"]
        for key in ("parent_ids", "spouse_ids", "child_ids"):
            p[key] = [i for i in dedupe(p.get(key)) if i in by and i != pid]
        p["family_child_ids"] = [i for i in dedupe(p.get("family_child_ids")) if i in fam_ids]
        p["family_spouse_ids"] = [i for i in dedupe(p.get("family_spouse_ids")) if i in fam_ids]

    for p in data["individuals"]:
        scrub_person(p)
    for fam in data["families"]:
        if fam.get("husband_id") not in by:
            fam["husband_id"] = None
        if fam.get("wife_id") not in by:
            fam["wife_id"] = None
        fam["children_ids"] = [c for c in dedupe(fam.get("children_ids")) if c in by]
        # Nobody is their own child.
        fam["children_ids"] = [
            c for c in fam["children_ids"]
            if c not in {fam.get("husband_id"), fam.get("wife_id")}
        ]

    place_changes = []
    walk_places(data, place_changes)

    for p in data["individuals"]:
        seen = set()
        residences = []
        for r in p.get("residences") or []:
            key = ((r.get("date") or ""), (r.get("place") or ""), (r.get("note") or ""))
            if key in seen:
                continue
            seen.add(key)
            residences.append(r)
        p["residences"] = residences

    counts = Counter((p.get("surname") or "").strip() or "(unknown)" for p in data["individuals"])
    data["stats"]["total_individuals"] = len(data["individuals"])
    data["stats"]["total_families"] = len(data["families"])
    data["stats"]["top_surnames"] = [
        {"surname": s, "count": n} for s, n in counts.most_common(24)
    ]

    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"people {data['stats']['total_individuals']} families {data['stats']['total_families']}")
    print(f"places rewritten {len(place_changes)}")
    shown = []
    for a, b in place_changes:
        if (a, b) not in shown:
            shown.append((a, b))
    for a, b in shown:
        print(f"  {a!r} -> {b!r}")


if __name__ == "__main__":
    main()
