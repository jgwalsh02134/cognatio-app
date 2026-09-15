#!/usr/bin/env python3
"""
Generate a GEDCOM 5.5.1 file from the family archive's data.json.

Usage:
    python3 export_gedcom.py [--app main|jgwalsh|both] [--out PATH]

Defaults to both apps, writing alongside each project's data.json.
"""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

PROJECTS = {
    "main": {
        "data": "client/src/data.json",
        "out":  "walsh_maloy_dugan_archive.ged",
        "name": "Walsh Maloy Dugan Family Archive",
        "sour": "WalshMaloyDuganFamilyArchive",
    },
    "jgwalsh": {
        "data": "client/src/data.json",
        "out":  "walsh_cranwell_archive.ged",
        "name": "Walsh Cranwell Family Archive",
        "sour": "WalshCranwellFamilyArchive",
    },
}

MONTHS = {
    "jan": "JAN", "january": "JAN",
    "feb": "FEB", "february": "FEB",
    "mar": "MAR", "march": "MAR",
    "apr": "APR", "april": "APR",
    "may": "MAY",
    "jun": "JUN", "june": "JUN",
    "jul": "JUL", "july": "JUL",
    "aug": "AUG", "august": "AUG",
    "sep": "SEP", "sept": "SEP", "september": "SEP",
    "oct": "OCT", "october": "OCT",
    "nov": "NOV", "november": "NOV",
    "dec": "DEC", "december": "DEC",
}


def xref(prefix, ident):
    # Preserve the namespace prefix (t0:, t1:, ...) so we don't collide
    # cross-namespace IDs like t0:F11 and t1:F11.
    raw = ident or ""
    m = re.match(r"^(t\d+):(.+)$", raw)
    if m:
        ns = m.group(1).upper()  # T0, T1, ...
        body = re.sub(r"[^A-Za-z0-9]", "", m.group(2))
        if not body.startswith(prefix):
            body = prefix + body
        return f"@{ns}{body}@"
    body = re.sub(r"[^A-Za-z0-9]", "", raw)
    if not body.startswith(prefix):
        body = prefix + body
    return f"@{body}@"


def esc(s):
    return (s or "").replace("@", "@@")


def format_date(raw):
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    quals = [
        (r"^abt\.?\s+", "ABT "),
        (r"^about\s+", "ABT "),
        (r"^circa\s+", "ABT "),
        (r"^c\.?\s+", "ABT "),
        (r"^bef\.?\s+", "BEF "),
        (r"^before\s+", "BEF "),
        (r"^aft\.?\s+", "AFT "),
        (r"^after\s+", "AFT "),
        (r"^est\.?\s+", "EST "),
    ]
    prefix = ""
    body = s
    for pat, repl in quals:
        if re.match(pat, body, re.I):
            prefix = repl
            body = re.sub(pat, "", body, flags=re.I)
            break
    body = body.replace(".", "").replace(",", " ")
    body = re.sub(r"\s+", " ", body).strip()
    if re.fullmatch(r"\d{4}", body):
        return prefix + body
    day = mon = year = ""
    for tok in body.split():
        if re.fullmatch(r"\d{4}", tok):
            year = tok
        elif re.fullmatch(r"\d{1,2}", tok):
            day = tok
        else:
            m = MONTHS.get(tok.lower())
            if m:
                mon = m
    if year and mon and day:
        return f"{prefix}{day} {mon} {year}"
    if year and mon:
        return f"{prefix}{mon} {year}"
    if year:
        return f"{prefix}{year}"
    return prefix + body.upper()


def emit_text(lines, level, tag, value):
    val = esc(value).replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = val.split("\n")
    for idx, para in enumerate(paragraphs):
        use_tag = tag if idx == 0 else "CONT"
        base = level if idx == 0 else level + 1
        if not para:
            lines.append(f"{base} {use_tag}")
            continue
        first = True
        rem = para
        while rem:
            chunk = rem[:200]
            rem = rem[200:]
            if first:
                lines.append(f"{base} {use_tag} {chunk}")
                first = False
            else:
                lines.append(f"{level + 1} CONC {chunk}")


def emit_event(lines, level, tag, ev):
    if not ev:
        return
    if not (ev.get("date") or ev.get("place") or ev.get("note")):
        return
    lines.append(f"{level} {tag}")
    if ev.get("date"):
        d = format_date(ev["date"])
        if d:
            lines.append(f"{level + 1} DATE {d}")
    if ev.get("place"):
        emit_text(lines, level + 1, "PLAC", ev["place"])
    if ev.get("note"):
        emit_text(lines, level + 1, "NOTE", ev["note"])


def name_tag(p):
    given = (p.get("given") or "").strip()
    surname = (p.get("surname") or "").strip()
    suffix = (p.get("suffix") or "").strip()
    parts = []
    if given:
        parts.append(given)
    if surname:
        parts.append(f"/{surname}/")
    elif given:
        parts.append("//")
    if suffix:
        parts.append(suffix)
    return " ".join(parts).strip() or p.get("name") or "Unknown"


def build_gedcom(data, archive_name, sour):
    lines = []
    now = datetime.now(timezone.utc)
    stamp = f"{now.day} {['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][now.month-1]} {now.year}"

    lines += [
        "0 HEAD",
        f"1 SOUR {sour}",
        "2 VERS 1.0",
        f"2 NAME {archive_name}",
        "1 DEST ANY",
        f"1 DATE {stamp}",
        "1 CHAR UTF-8",
        "1 GEDC",
        "2 VERS 5.5.1",
        "2 FORM LINEAGE-LINKED",
        "1 SUBM @SUBM1@",
        "0 @SUBM1@ SUBM",
        f"1 NAME {archive_name}",
    ]

    for p in data["individuals"]:
        ind_xref = xref("I", p["id"])
        lines.append(f"0 {ind_xref} INDI")
        lines.append(f"1 NAME {name_tag(p)}")
        if p.get("given"):
            lines.append(f"2 GIVN {esc(p['given'])}")
        if p.get("surname"):
            lines.append(f"2 SURN {esc(p['surname'])}")
        if p.get("suffix"):
            lines.append(f"2 NSFX {esc(p['suffix'])}")
        sex = p.get("sex")
        if sex in ("M", "F"):
            lines.append(f"1 SEX {sex}")

        emit_event(lines, 1, "BIRT", p.get("birth"))
        emit_event(lines, 1, "DEAT", p.get("death"))
        emit_event(lines, 1, "BURI", p.get("burial"))

        for r in p.get("residences") or []:
            emit_event(lines, 1, "RESI", r)

        for ed in p.get("educations") or []:
            lines.append("1 EVEN")
            lines.append("2 TYPE Education")
            if ed.get("date"):
                d = format_date(ed["date"])
                if d:
                    lines.append(f"2 DATE {d}")
            if ed.get("place"):
                emit_text(lines, 2, "PLAC", ed["place"])
            if ed.get("note"):
                emit_text(lines, 2, "NOTE", ed["note"])

        for occ in p.get("occupations") or []:
            if isinstance(occ, str) and occ:
                emit_text(lines, 1, "OCCU", occ)

        mil = p.get("military")
        if mil:
            lines.append("1 EVEN")
            lines.append("2 TYPE Military Service")
            parts = []
            if mil.get("branch"):
                parts.append(f"Branch: {str(mil['branch']).upper()}")
            for k, label in [
                ("country", "Country"), ("conflict", "Conflict"),
                ("rank", "Rank"), ("unit", "Unit"),
                ("service_number", "Service #"), ("dates", "Dates"),
            ]:
                if mil.get(k):
                    parts.append(f"{label}: {mil[k]}")
            if mil.get("kia"):
                parts.append("Killed in Action")
            awards = mil.get("awards")
            if isinstance(awards, list) and awards:
                parts.append("Awards: " + ", ".join(awards))
            if parts:
                emit_text(lines, 2, "NOTE", "\n".join(parts))
            if mil.get("notes"):
                emit_text(lines, 2, "NOTE", mil["notes"])
            for ev in (mil.get("evidence") or []):
                emit_text(lines, 2, "SOUR", ev)

        for a in p.get("affiliations") or []:
            lines.append("1 EVEN")
            lines.append("2 TYPE Affiliation")
            headline = " — ".join(x for x in [a.get("name"), a.get("role")] if x)
            if headline:
                emit_text(lines, 2, "NOTE", headline)
            if a.get("dates"):
                d = format_date(a["dates"]) or a["dates"]
                lines.append(f"2 DATE {d}")
            if a.get("note"):
                emit_text(lines, 2, "NOTE", a["note"])

        for n in p.get("notes") or []:
            if isinstance(n, str) and n.strip():
                emit_text(lines, 1, "NOTE", n)

        for fc in p.get("family_child_ids") or []:
            lines.append(f"1 FAMC {xref('F', fc)}")
        for fs in p.get("family_spouse_ids") or []:
            lines.append(f"1 FAMS {xref('F', fs)}")

    for f in data["families"]:
        fam_xref = xref("F", f["id"])
        lines.append(f"0 {fam_xref} FAM")
        if f.get("husband_id"):
            lines.append(f"1 HUSB {xref('I', f['husband_id'])}")
        if f.get("wife_id"):
            lines.append(f"1 WIFE {xref('I', f['wife_id'])}")
        for c in f.get("children_ids") or []:
            lines.append(f"1 CHIL {xref('I', c)}")
        if f.get("marriage"):
            emit_event(lines, 1, "MARR", f["marriage"])
        if f.get("divorce"):
            emit_event(lines, 1, "DIV", f["divorce"])

    lines.append("0 TRLR")
    return "\r\n".join(lines) + "\r\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", choices=["main", "jgwalsh", "both"], default="both")
    ap.add_argument("--out", help="Override output path (single app only)")
    args = ap.parse_args()

    targets = [args.app] if args.app != "both" else ["main", "jgwalsh"]
    for key in targets:
        cfg = PROJECTS[key]
        data = json.loads(Path(cfg["data"]).read_text(encoding="utf-8"))
        text = build_gedcom(data, cfg["name"], cfg["sour"])
        out = Path(args.out) if (args.out and len(targets) == 1) else Path(cfg["out"])
        # Write bytes directly so the CRLF line endings in `text` are preserved
        # verbatim (Path.write_text's `newline=` kwarg needs Python 3.10+).
        out.write_bytes(text.encode("utf-8"))
        size = out.stat().st_size
        print(
            f"{key}: wrote {out} — {len(data['individuals'])} individuals, "
            f"{len(data['families'])} families, {size:,} bytes"
        )


if __name__ == "__main__":
    main()
