#!/usr/bin/env python3
"""Expand abbreviated given names when the full form is already on that person.

Only records that attest both the short form and the full form are changed.
A relative who merely shares a first name (father "Edward Joseph", son
"Edward J") is left alone.

Usage:
    python3 fix_expand_given_names.py
"""
import json
from pathlib import Path

DATA = Path("client/src/data.json")
SUGGESTIONS = Path("client/src/research_suggestions.json")

# id -> (new given, new display name)
# Each full form is quoted on that person's own record:
#   Walter James — Troy Record obituary, Dec 2013, on t0:I19739345719
#   Joseph Warren — WWII service record on t0:I19741461388
#   William John — enlistment index "William J Faden" plus given "Wm. John"
REPLACEMENTS = {
    "t0:I19739345719": ("Walter James", "Walter James Dugan"),
    "t0:I19741461388": ("Joseph Warren", "Joseph Warren Faden"),
    "t0:I18669423251": ("William John", "William John Faden"),
}


def apply_people(data):
    changed = []
    by_id = {p["id"]: p for p in data["individuals"]}
    for pid, (given, name) in REPLACEMENTS.items():
        person = by_id.get(pid)
        if person is None:
            raise SystemExit(f"missing person {pid}")
        before = (person.get("given"), person.get("name"))
        person["given"] = given
        person["name"] = name
        if before != (given, name):
            changed.append((pid, before, (given, name)))
    return changed


def refresh_suggestion_labels(node, names_by_id):
    """Keep cached labels next to person ids in step with the archive."""
    if isinstance(node, dict):
        if "id" in node and "name" in node and node["id"] in names_by_id:
            node["name"] = names_by_id[node["id"]]
        if "a_id" in node and "a_name" in node and node["a_id"] in names_by_id:
            node["a_name"] = names_by_id[node["a_id"]]
        if "b_id" in node and "b_name" in node and node["b_id"] in names_by_id:
            node["b_name"] = names_by_id[node["b_id"]]
        for value in node.values():
            refresh_suggestion_labels(value, names_by_id)
    elif isinstance(node, list):
        for value in node:
            refresh_suggestion_labels(value, names_by_id)


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    changed = apply_people(data)
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    names_by_id = {pid: name for pid, (_given, name) in REPLACEMENTS.items()}
    if SUGGESTIONS.exists():
        suggestions = json.loads(SUGGESTIONS.read_text(encoding="utf-8"))
        refresh_suggestion_labels(suggestions, names_by_id)
        SUGGESTIONS.write_text(
            json.dumps(suggestions, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    if not changed:
        print("already up to date")
        return
    for pid, before, after in changed:
        print(f"{pid}: {before[1]!r} -> {after[1]!r}")


if __name__ == "__main__":
    main()
