// GEDCOM 5.5.1 exporter for the family archive.
// Produces a standards-compliant .ged file from the in-memory dataset.
// Spec reference: https://www.familysearch.org/developers/docs/gedcom/

import { people as individuals, families, type Person, type EventInfo, type Family } from "./family";

const APP_NAME = "CognatioFamilyArchive";
const APP_VERSION = "1.0";

// ---------- helpers ----------

function tagFromId(prefix: "I" | "F", id: string): string {
  // GEDCOM xref_ids must match @[A-Za-z0-9!"$%&'()*+,\-./:;<=>?[\]\\^_`{|}~ ]{1,20}@
  // Source IDs look like "t0:I18635645027" or "t1:F11". Preserve the t0/t1
  // namespace prefix so cross-namespace IDs (e.g. t0:F11 vs t1:F11) don't collide.
  const m = /^(t\d+):(.+)$/.exec(id || "");
  if (m) {
    const ns = m[1].toUpperCase(); // T0, T1, ...
    let body = m[2].replace(/[^A-Za-z0-9]/g, "");
    if (!body.startsWith(prefix)) body = `${prefix}${body}`;
    return `@${ns}${body}@`;
  }
  let body = (id || "").replace(/[^A-Za-z0-9]/g, "");
  if (!body.startsWith(prefix)) body = `${prefix}${body}`;
  return `@${body}@`;
}

function escapeText(s: string): string {
  // GEDCOM 5.5.1 has very few escapes; @ must be doubled inside line values.
  return s.replace(/@/g, "@@");
}

// Emit a long value with CONC (continuation) and CONT (new line) split across <=200 char lines.
function emitText(lines: string[], level: number, tag: string, value: string): void {
  const cleaned = escapeText(value).replace(/\r\n?/g, "\n");
  const paragraphs = cleaned.split("\n");
  paragraphs.forEach((para, paraIdx) => {
    const useTag = paraIdx === 0 ? tag : "CONT";
    const baseLevel = paraIdx === 0 ? level : level + 1;
    if (para.length === 0) {
      lines.push(`${baseLevel} ${useTag}`);
      return;
    }
    let remaining = para;
    let first = true;
    const MAX = 200;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, MAX);
      remaining = remaining.slice(MAX);
      if (first) {
        lines.push(`${baseLevel} ${useTag} ${chunk}`);
        first = false;
      } else {
        lines.push(`${level + 1} CONC ${chunk}`);
      }
    }
  });
}

function emitSimple(lines: string[], level: number, tag: string, value?: string | null): void {
  if (value == null || value === "") {
    lines.push(`${level} ${tag}`);
    return;
  }
  emitText(lines, level, tag, value);
}

function formatGedcomDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // Already roughly GEDCOM-shaped? Pass through normalized to uppercase month abbrevs.
  // Examples we see: "1 Feb 1922", "1922", "abt 1924", "June 22. 1889", "March 4, 1899", "May 2008"
  const months: Record<string, string> = {
    jan: "JAN", january: "JAN",
    feb: "FEB", february: "FEB",
    mar: "MAR", march: "MAR",
    apr: "APR", april: "APR",
    may: "MAY",
    jun: "JUN", june: "JUN",
    jul: "JUL", july: "JUL",
    aug: "AUG", august: "AUG",
    sep: "SEP", sept: "SEP", september: "SEP",
    oct: "OCT", october: "OCT",
    nov: "NOV", november: "NOV",
    dec: "DEC", december: "DEC",
  };
  // Approximate qualifiers
  const qualMap: Array<[RegExp, string]> = [
    [/^abt\.?\s+/i, "ABT "],
    [/^about\s+/i, "ABT "],
    [/^circa\s+/i, "ABT "],
    [/^c\.?\s+/i, "ABT "],
    [/^bef\.?\s+/i, "BEF "],
    [/^before\s+/i, "BEF "],
    [/^aft\.?\s+/i, "AFT "],
    [/^after\s+/i, "AFT "],
    [/^est\.?\s+/i, "EST "],
  ];
  let prefix = "";
  let body = s;
  for (const [re, repl] of qualMap) {
    if (re.test(body)) {
      prefix = repl;
      body = body.replace(re, "");
      break;
    }
  }
  // Strip stray punctuation like trailing periods or commas in "June 22. 1889" -> "22 JUN 1889"
  body = body.replace(/\./g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const yearOnly = /^\d{4}$/.exec(body);
  if (yearOnly) return `${prefix}${yearOnly[0]}`;
  // "1 Feb 1922" or "Feb 1 1922"
  const tokens = body.split(/\s+/);
  let day = "", mon = "", year = "";
  for (const t of tokens) {
    if (/^\d{4}$/.test(t)) year = t;
    else if (/^\d{1,2}$/.test(t)) day = t;
    else {
      const m = months[t.toLowerCase()];
      if (m) mon = m;
    }
  }
  if (year && mon && day) return `${prefix}${day} ${mon} ${year}`;
  if (year && mon) return `${prefix}${mon} ${year}`;
  if (year) return `${prefix}${year}`;
  // Fallback: pass cleaned body through; GEDCOM 5.5.1 allows phrase dates via INT or freeform.
  return `${prefix}${body.toUpperCase()}`;
}

function emitEvent(lines: string[], level: number, tag: string, ev: EventInfo | null | undefined): void {
  if (!ev) return;
  const hasDate = !!ev.date;
  const hasPlace = !!ev.place;
  const hasNote = !!ev.note;
  if (!hasDate && !hasPlace && !hasNote) return;
  lines.push(`${level} ${tag}`);
  if (ev.date) {
    const d = formatGedcomDate(ev.date);
    if (d) lines.push(`${level + 1} DATE ${d}`);
  }
  if (ev.place) emitText(lines, level + 1, "PLAC", ev.place);
  if (ev.note) emitText(lines, level + 1, "NOTE", ev.note);
}

function buildNameTag(p: Person): string {
  const given = (p.given || "").trim();
  const surname = (p.surname || "").trim();
  const suffix = (p.suffix || "").trim();
  let nameLine = "";
  if (given) nameLine += given;
  if (surname) nameLine += ` /${surname}/`;
  else if (given) nameLine += " //";
  if (suffix) nameLine += ` ${suffix}`;
  return nameLine.trim() || (p.name || "Unknown");
}

// ---------- builder ----------

export function buildGedcom(): string {
  const lines: string[] = [];
  const now = new Date();
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const stamp = `${now.getUTCDate()} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  // HEAD
  lines.push("0 HEAD");
  lines.push("1 SOUR " + APP_NAME);
  lines.push("2 VERS " + APP_VERSION);
  lines.push("2 NAME Cognatio Family Archive");
  lines.push("1 DEST ANY");
  lines.push(`1 DATE ${stamp}`);
  lines.push("1 CHAR UTF-8");
  lines.push("1 GEDC");
  lines.push("2 VERS 5.5.1");
  lines.push("2 FORM LINEAGE-LINKED");
  lines.push("1 SUBM @SUBM1@");

  // SUBM record
  lines.push("0 @SUBM1@ SUBM");
  lines.push("1 NAME Cognatio Family Archive");

  // INDIs
  for (const p of individuals as Person[]) {
    const xref = tagFromId("I", p.id);
    lines.push(`0 ${xref} INDI`);
    lines.push(`1 NAME ${buildNameTag(p)}`);
    if (p.given) lines.push(`2 GIVN ${escapeText(p.given)}`);
    if (p.surname) lines.push(`2 SURN ${escapeText(p.surname)}`);
    if (p.suffix) lines.push(`2 NSFX ${escapeText(p.suffix)}`);
    if (p.sex === "M" || p.sex === "F") lines.push(`1 SEX ${p.sex}`);

    emitEvent(lines, 1, "BIRT", p.birth);
    emitEvent(lines, 1, "DEAT", p.death);
    emitEvent(lines, 1, "BURI", p.burial);

    for (const r of p.residences || []) emitEvent(lines, 1, "RESI", r);
    for (const ed of p.educations || []) {
      // GEDCOM uses EDUC (string) but our records carry place/date too. Encode as EVEN with TYPE.
      lines.push("1 EVEN");
      lines.push("2 TYPE Education");
      if (ed.date) {
        const d = formatGedcomDate(ed.date);
        if (d) lines.push(`2 DATE ${d}`);
      }
      if (ed.place) emitText(lines, 2, "PLAC", ed.place);
      if (ed.note) emitText(lines, 2, "NOTE", ed.note);
    }
    for (const occ of p.occupations || []) {
      if (typeof occ === "string") emitSimple(lines, 1, "OCCU", occ);
    }

    // Military service as a custom EVEN block
    const mil: any = (p as any).military;
    if (mil) {
      lines.push("1 EVEN");
      lines.push("2 TYPE Military Service");
      const parts = [
        mil.branch ? `Branch: ${String(mil.branch).toUpperCase()}` : null,
        mil.country ? `Country: ${mil.country}` : null,
        mil.conflict ? `Conflict: ${mil.conflict}` : null,
        mil.rank ? `Rank: ${mil.rank}` : null,
        mil.unit ? `Unit: ${mil.unit}` : null,
        mil.service_number ? `Service #: ${mil.service_number}` : null,
        mil.dates ? `Dates: ${mil.dates}` : null,
        mil.kia ? "Killed in Action" : null,
        Array.isArray(mil.awards) && mil.awards.length ? `Awards: ${mil.awards.join(", ")}` : null,
      ].filter(Boolean) as string[];
      if (parts.length) emitText(lines, 2, "NOTE", parts.join("\n"));
      if (mil.notes) emitText(lines, 2, "NOTE", mil.notes);
      if (Array.isArray(mil.evidence)) {
        for (const e of mil.evidence) emitText(lines, 2, "SOUR", e);
      }
    }

    // Affiliations as custom EVEN blocks
    const affs: any[] = (p as any).affiliations || [];
    for (const a of affs) {
      lines.push("1 EVEN");
      lines.push("2 TYPE Affiliation");
      const headline = [a.name, a.role].filter(Boolean).join(" — ");
      if (headline) emitText(lines, 2, "NOTE", headline);
      if (a.dates) lines.push(`2 DATE ${formatGedcomDate(a.dates) || a.dates}`);
      if (a.note) emitText(lines, 2, "NOTE", a.note);
    }

    for (const n of p.notes || []) {
      if (typeof n === "string" && n.trim()) emitText(lines, 1, "NOTE", n);
    }

    for (const fc of p.family_child_ids || []) lines.push(`1 FAMC ${tagFromId("F", fc)}`);
    for (const fs of p.family_spouse_ids || []) lines.push(`1 FAMS ${tagFromId("F", fs)}`);
  }

  // FAMs
  for (const f of families as Family[]) {
    const xref = tagFromId("F", f.id);
    lines.push(`0 ${xref} FAM`);
    if (f.husband_id) lines.push(`1 HUSB ${tagFromId("I", f.husband_id)}`);
    if (f.wife_id) lines.push(`1 WIFE ${tagFromId("I", f.wife_id)}`);
    for (const c of f.children_ids || []) lines.push(`1 CHIL ${tagFromId("I", c)}`);
    if (f.marriage) emitEvent(lines, 1, "MARR", f.marriage as EventInfo);
    if ((f as any).divorce) emitEvent(lines, 1, "DIV", (f as any).divorce);
  }

  // TRLR
  lines.push("0 TRLR");

  // GEDCOM 5.5.1 traditionally uses CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}

export function downloadGedcom(filename = "cognatio_archive.ged"): void {
  const text = buildGedcom();
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function gedcomStats(): { individuals: number; families: number; bytes: number } {
  const text = buildGedcom();
  return {
    individuals: individuals.length,
    families: families.length,
    bytes: new Blob([text]).size,
  };
}
