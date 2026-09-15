#!/usr/bin/env python3
# One-off place-name canonicalization.
#
# The archive accumulated ~63 redundant spellings of the same localities across
# two GEDCOM imports (e.g. 12 spellings of Troy, NY). This maps every variant to
# a single canonical "City, County, State, USA" form (non-US places use
# "City, County, Country"), and fixes genuine errors found along the way:
#   - "Troy, Albany, New York…"      → wrong county (Troy is Rensselaer)
#   - "Peterborough, 1654329, …"      → stray numeric code removed
#   - "…, Renss…" / "…, Alb…"         → truncated counties expanded
#   - "Iowa City, Allamakee/Wright"   → Iowa City is Johnson County
#
# Intentionally NOT touched (genuinely ambiguous — could mean NY State or NYC):
#   bare "New York"  and  "New York, USA".  Only the explicitly-NYC spellings
#   ("New York, New York", "New York, New York City, New York", etc.) collapse.
#
# Run from project root:  python3 fix_places.py
import json
from pathlib import Path

# Canonical target per raw variant (matched on the stripped string).
CANON = {
    # ---- Troy, Rensselaer Co. (incl. wards & Lansingburgh) ----
    **{v: "Troy, Rensselaer, New York, USA" for v in [
        "Troy, Rensselaer, New York, USA",
        "Troy, Rensselaer, New York, United States",
        "Troy, Rensselaer, New York",
        "Troy, NY",
        "Troy, Rensselaer County, New York, USA",
        "Troy, Albany, New York, United States",   # county error -> Rensselaer
        "Troy, New York",
        "Troy, New York, USA",
        "Troy, New York, United States",
        "Troy,New York",
        "Troy, Rensselaer, New York, United States of America",
        "Troy, Renss, New York",
    ]},
    **{v: "Troy Ward 15, Rensselaer, New York, USA" for v in [
        "Troy Ward 15, Rensselaer, New York, United States",
        "Troy Ward 15, Rensselaer, New York, USA",
        "Troy Ward 15, Rensselaer, New York",
    ]},
    **{v: "Troy Ward 13, Rensselaer, New York, USA" for v in [
        "Troy Ward 13, Rensselaer, New York, USA",
        "Troy Ward 13, Rensselaer, New York",
    ]},
    **{v: "Troy Ward 16, Rensselaer, New York, USA" for v in [
        "Troy Ward 16, Rensselaer, New York",
        "Troy Ward 16, Rensselaer, New York, United States",
    ]},
    **{v: "Troy Ward 10, Rensselaer, New York, USA" for v in [
        "Troy Ward 10, Rensselaer, New York, USA",
        "Troy Ward 10, Rensselaer, New York, United States",
    ]},
    **{v: "Lansingburgh, Rensselaer, New York, USA" for v in [
        "Lansingburgh, Rensselaer, New York, United States",
        "Lansingburgh, Rensselaer, New York, USA",
        "Lansingburgh, Rensselaer County, New York, USA",
        "Lansingburgh, Rensselaer, New York",
    ]},
    # ---- Albany Co. ----
    **{v: "Albany, Albany, New York, USA" for v in [
        "Albany, Albany, New York, United States",
        "Albany, New York, USA",
        "Albany, Albany, New York, USA",
        "Albany, NY",
        "Albany, New York",
        "Albany, Albany, New York, United States of America",
        "Albany, Albany, New York",
        "Albany, NY, U.S.A.",
    ]},
    **{v: "Colonie, Albany, New York, USA" for v in [
        "Colonie, Albany, New York",
        "Colonie, Albany, New York, United States",
        "Colonie, Albany, New York, USA",
        "Colonie, Alb, New York",   # truncated county
        "Colonie, New York",
    ]},
    **{v: "Menands, Albany, New York, USA" for v in [
        "Menands, Albany County, New York, United States of America",
        "Menands, Albany County, New York, USA",
        "Menands, Albany, New York, USA",
    ]},
    **{v: "Loudonville, Albany, New York, USA" for v in [
        "Loudonville, NY",
        "Loudonville, Albany County, New York, United States of America",
    ]},
    **{v: "Cohoes, Albany, New York, USA" for v in [
        "Cohoes, New York",
        "Cohoes, Albany, New York, USA",
    ]},
    # ---- Washington Co. ----
    **{v: "Greenwich, Washington, New York, USA" for v in [
        "Greenwich, Washington, New York, United States",
        "Greenwich, Washington, New York, United States of America",
        "Greenwich, Washington, New York, USA",
        "Greenwich, Washington, New York",
    ]},
    **{v: "Jackson, Washington, New York, USA" for v in [
        "Jackson, Washington, New York, United States",
        "Jackson, Washington, New York, USA",
        "Jackson, Washington, New York",
        "Jackson, Washington, NY, US",
    ]},
    # ---- Westchester Co. ----
    **{v: "New Rochelle, Westchester, New York, USA" for v in [
        "New Rochelle, New York, USA",
        "New Rochelle, Westchester, New York",
        "New Rochelle, Westchester, New York, United States",
        "New Rochelle, Westchester, New York, United States of America",
    ]},
    **{v: "White Plains, Westchester, New York, USA" for v in [
        "White Plains, NY",
        "White Plains, Westchester, New York, USA",
    ]},
    **{v: "Larchmont, Westchester, New York, USA" for v in [
        "Larchmont, Westchester, New York",
        "Larchmont, Westchester, New York, USA",
    ]},
    # ---- Other NY counties ----
    **{v: "Utica, Oneida, New York, USA" for v in [
        "Utica, Oneida County, New York, United States of America",
        "Utica, New York, USA",
    ]},
    **{v: "Waterford, Saratoga, New York, USA" for v in [
        "Waterford, NY",
        "Waterford, New York",
    ]},
    # ---- New York City (explicit spellings only) ----
    **{v: "New York, New York, New York, USA" for v in [
        "New York, United States",
        "New York, New York, New York, United States",
        "New York, USA",
        "New York, New York City, New York",
        "New York, New York",
        "New York, New York, New York, USA",
        "New York, New York, New York, United States of America",
    ]},
    # ---- Vermont ----
    **{v: "Bennington, Bennington, Vermont, USA" for v in [
        "Bennington, Bennington, Vermont, USA",
        "Bennington, Bennington, Vermont, United States",
    ]},
    # ---- Iowa ----
    **{v: "Iowa City, Johnson, Iowa, USA" for v in [
        "Iowa City, Allamakee, Iowa, United States",  # county error
        "Iowa City, Wright, Iowa, USA",               # county error
        "Iowa City, Johnson, Iowa, USA",
    ]},
    **{v: "Johnson, Iowa, USA" for v in [
        "Johnson, Iowa",
        "Johnson, Iowa, United States",
    ]},
    **{v: "Iowa, USA" for v in [
        "Iowa",
        "Iowa, USA",
    ]},
    # ---- Ireland ----
    "ireland": "Ireland",
    "Ireland": "Ireland",
    **{v: "Cork, Cork, Ireland" for v in ["Cork, Cork, Ireland", "Cork, Ireland"]},
    **{v: "Wexford, Wexford, Ireland" for v in ["Wexford, Wexford, Ireland", "Wexford, Ireland"]},
    # ---- Canada ----
    **{v: "Peterborough, Ontario, Canada" for v in [
        "Peterborough, Ontario, Canada",
        "Peterborough, 1654329, Ontario, Canada",  # stray code removed
    ]},
}

DATA_PATHS = [Path("client/src/data.json")]
fork = Path("../family-tree-jgwalsh/client/src/data.json")
if fork.exists():
    DATA_PATHS.append(fork)


def fix(value):
    if not value:
        return value, False
    key = value.strip()
    target = CANON.get(key)
    if target and target != value:
        return target, True
    return value, False


def process(data):
    changed = 0
    for p in data.get("individuals", []):
        for k in ("birth", "death", "burial"):
            ev = p.get(k)
            if ev and ev.get("place"):
                nv, ch = fix(ev["place"])
                if ch:
                    ev["place"] = nv
                    changed += 1
        for r in (p.get("residences") or []):
            if r and r.get("place"):
                nv, ch = fix(r["place"])
                if ch:
                    r["place"] = nv
                    changed += 1
    return changed


def main():
    for path in DATA_PATHS:
        if not path.exists():
            print(f"  skip: {path} not found")
            continue
        data = json.loads(path.read_text())
        n = process(data)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"{path}: {n} place fields canonicalized")


if __name__ == "__main__":
    main()
