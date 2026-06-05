import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Search as SearchIcon,
  X,
  ArrowRight,
  Users,
  Home as HomeIcon,
  GitBranch,
  Sparkles,
  Download,
  BarChart3,
  Moon,
  Sun,
  Lock,
  Unlock,
  FileEdit,
  Printer,
  Shuffle,
  Clock,
  ScrollText,
  GitMerge,
  MapPin,
  Compass,
  Crown,
  Telescope,
  ShieldAlert,
  Combine,
  Map as MapIcon,
  Dna,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "./PersonAvatar";
import { useTheme } from "./ThemeProvider";
import { useEdit } from "./EditContext";
import {
  searchPeople,
  lifespan,
  fullDisplayName,
  people as ALL_PEOPLE,
  isAnchorlessPlaceholder,
  type Person,
} from "@/lib/family";
import { cn } from "@/lib/utils";

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string[];
  perform: () => void;
};

type Row =
  | { kind: "command"; item: CommandItem }
  | { kind: "person"; person: Person };

export function CommandPalette({
  open,
  onClose,
  onRequestUnlock,
}: {
  open: boolean;
  onClose: () => void;
  onRequestUnlock: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { theme, toggle } = useTheme();
  const { unlocked, lock, hasChanges } = useEdit();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const commands: CommandItem[] = useMemo(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    const base: CommandItem[] = [
      {
        id: "nav-home",
        label: "Go to Home",
        hint: "Cover & landing",
        icon: <HomeIcon className="h-4 w-4" />,
        keywords: ["home", "landing", "cover"],
        perform: go("/"),
      },
      {
        id: "nav-people",
        label: "Go to People",
        hint: "Browse everyone",
        icon: <Users className="h-4 w-4" />,
        keywords: ["people", "list", "browse", "directory"],
        perform: go("/people"),
      },
      {
        id: "nav-tree",
        label: "Go to Tree",
        hint: "Pedigree view",
        icon: <GitBranch className="h-4 w-4" />,
        keywords: ["tree", "pedigree", "chart"],
        perform: go("/tree"),
      },
      {
        id: "nav-timeline",
        label: "Go to Timeline",
        hint: "Chronological events",
        icon: <Clock className="h-4 w-4" />,
        keywords: ["timeline", "chronology", "events", "history", "dates"],
        perform: go("/timeline"),
      },
      {
        id: "nav-surnames",
        label: "Go to Surnames",
        hint: "Family name directory",
        icon: <ScrollText className="h-4 w-4" />,
        keywords: ["surnames", "families", "arms", "heraldry", "names"],
        perform: go("/surnames"),
      },
      {
        id: "nav-places",
        label: "Go to Places",
        hint: "Places browser",
        icon: <MapPin className="h-4 w-4" />,
        keywords: ["places", "geography", "cities", "locations", "towns"],
        perform: go("/places"),
      },
      {
        id: "nav-map",
        label: "Go to Map",
        hint: "Origins, immigration & settlement",
        icon: <MapIcon className="h-4 w-4" />,
        keywords: ["map", "geography", "immigration", "origins", "settlement", "atlas", "leaflet"],
        perform: go("/map"),
      },
      {
        id: "nav-genetics",
        label: "Go to Genetics",
        hint: "DNA, haplogroups, heritable traits",
        icon: <Dna className="h-4 w-4" />,
        keywords: ["genetics", "dna", "haplogroup", "ancestry", "23andme", "blood type", "health", "heritable"],
        perform: go("/genetics"),
      },
      {
        id: "nav-relate",
        label: "Go to Relationship Calculator",
        hint: "How are two people related?",
        icon: <GitMerge className="h-4 w-4" />,
        keywords: ["relate", "relationship", "cousin", "calculator", "connection"],
        perform: go("/relate"),
      },
      {
        id: "nav-research",
        label: "Go to Research workbench",
        hint: "Brick walls, census, FAN club, records",
        icon: <Compass className="h-4 w-4" />,
        keywords: ["research", "brick wall", "census", "records", "fan club", "surname", "dna"],
        perform: go("/research"),
      },
      {
        id: "nav-roots",
        label: "Go to Deepest Roots",
        hint: "Direct lines, ahnentafel, depth by surname",
        icon: <Crown className="h-4 w-4" />,
        keywords: ["roots", "deepest", "ahnentafel", "sosa", "paternal", "maternal", "earliest", "apex"],
        perform: go("/roots"),
      },
      {
        id: "nav-finder",
        label: "Go to Finder",
        hint: "Advanced multi-criteria search",
        icon: <Telescope className="h-4 w-4" />,
        keywords: ["finder", "search", "filter", "advanced", "query", "find"],
        perform: go("/finder"),
      },
      {
        id: "nav-anomalies",
        label: "Go to Anomalies",
        hint: "Data quality and missing info",
        icon: <ShieldAlert className="h-4 w-4" />,
        keywords: ["anomalies", "data quality", "errors", "missing", "issues", "validate", "audit"],
        perform: go("/anomalies"),
      },
      {
        id: "nav-duplicates",
        label: "Go to Duplicates",
        hint: "Find & merge duplicate people",
        icon: <Combine className="h-4 w-4" />,
        keywords: ["duplicates", "merge", "dupes", "same person", "consolidate", "combine"],
        perform: go("/duplicates"),
      },
      {
        id: "nav-insights",
        label: "Go to Insights",
        hint: "Stats & geography",
        icon: <BarChart3 className="h-4 w-4" />,
        keywords: ["insights", "stats", "analytics", "decades", "places"],
        perform: go("/insights"),
      },
      {
        id: "nav-gaps",
        label: "Go to Gaps",
        hint: "Missing info",
        icon: <Sparkles className="h-4 w-4" />,
        keywords: ["gaps", "missing", "todo", "research"],
        perform: go("/gaps"),
      },
      {
        id: "nav-export",
        label: "Go to Export",
        hint: "GEDCOM & JSON",
        icon: <Download className="h-4 w-4" />,
        keywords: ["export", "download", "gedcom", "json"],
        perform: go("/export"),
      },
    ];
    if (hasChanges) {
      base.push({
        id: "nav-changes",
        label: "Review pending changes",
        hint: "Save or discard edits",
        icon: <FileEdit className="h-4 w-4" />,
        keywords: ["changes", "save", "review", "diff", "pending"],
        perform: go("/changes"),
      });
    }
    base.push({
      id: "toggle-theme",
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      hint: "Toggle appearance",
      icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      keywords: ["theme", "dark", "light", "mode"],
      perform: () => {
        toggle();
        onClose();
      },
    });
    base.push(
      unlocked
        ? {
            id: "lock-edit",
            label: "Lock edit mode",
            hint: "Stop editing",
            icon: <Unlock className="h-4 w-4" />,
            keywords: ["lock", "edit", "stop"],
            perform: () => {
              lock();
              onClose();
            },
          }
        : {
            id: "unlock-edit",
            label: "Unlock edit mode",
            hint: "Enter passphrase",
            icon: <Lock className="h-4 w-4" />,
            keywords: ["unlock", "edit", "passphrase"],
            perform: () => {
              onClose();
              onRequestUnlock();
            },
          },
    );
    base.push({
      id: "random-ancestor",
      label: "Open a random ancestor",
      hint: "Surprise me",
      icon: <Shuffle className="h-4 w-4" />,
      keywords: ["random", "surprise", "shuffle", "discover", "ancestor"],
      perform: () => {
        const pool = ALL_PEOPLE.filter((p) => !isAnchorlessPlaceholder(p));
        if (pool.length === 0) {
          onClose();
          return;
        }
        const pick = pool[Math.floor(Math.random() * pool.length)];
        navigate(`/person/${encodeURIComponent(pick.id)}`);
        onClose();
      },
    });
    base.push({
      id: "print",
      label: "Print this page",
      hint: "Browser print dialog",
      icon: <Printer className="h-4 w-4" />,
      keywords: ["print", "pdf", "export"],
      perform: () => {
        onClose();
        setTimeout(() => window.print(), 50);
      },
    });
    return base;
  }, [navigate, onClose, theme, toggle, unlocked, lock, hasChanges, onRequestUnlock]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cmdMatches = !q
      ? commands
      : commands.filter((c) => {
          const hay = [c.label, c.hint || "", ...(c.keywords || [])]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });
    const people = q ? searchPeople(query, 12) : [];
    const out: Row[] = [];
    for (const c of cmdMatches) out.push({ kind: "command", item: c });
    for (const p of people) out.push({ kind: "person", person: p });
    return out;
  }, [query, commands]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Keep active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-row-idx="${activeIdx}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function activate(row: Row) {
    if (row.kind === "command") row.item.perform();
    else {
      navigate(`/person/${encodeURIComponent(row.person.id)}`);
      onClose();
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[activeIdx];
      if (row) activate(row);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  // Group split — count commands so we know where the divider falls
  const commandCount = rows.findIndex((r) => r.kind !== "command");
  const peopleStart = commandCount === -1 ? rows.length : commandCount;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
      data-testid="overlay-command"
    >
      <div
        className="w-full max-w-xl max-h-[85dvh] flex flex-col rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search people or commands…"
            className="border-0 shadow-none focus-visible:ring-0 px-0 text-base"
            data-testid="input-command"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close command palette"
            className="h-9 w-9 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
        >
          {rows.length === 0 && (
            <div className="px-6 py-10 text-sm text-muted-foreground text-center">
              No matches for "{query}".
            </div>
          )}

          {peopleStart > 0 && (
            <SectionLabel label="Commands & navigation" />
          )}
          {rows.slice(0, peopleStart).map((row, i) => {
            const active = i === activeIdx;
            if (row.kind !== "command") return null;
            return (
              <button
                key={row.item.id}
                type="button"
                data-row-idx={i}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => activate(row)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm border-b last:border-b-0 transition-colors",
                  active ? "bg-accent text-accent-foreground" : "hover-elevate",
                )}
                data-testid={`command-${row.item.id}`}
              >
                <span className="text-muted-foreground">{row.item.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{row.item.label}</span>
                  {row.item.hint && (
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {row.item.hint}
                    </span>
                  )}
                </span>
                {active && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            );
          })}

          {peopleStart < rows.length && (
            <SectionLabel label="People" />
          )}
          {rows.slice(peopleStart).map((row, i) => {
            const idx = peopleStart + i;
            const active = idx === activeIdx;
            if (row.kind !== "person") return null;
            const p = row.person;
            return (
              <button
                key={p.id}
                type="button"
                data-row-idx={idx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => activate(row)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left border-b last:border-b-0 transition-colors",
                  active ? "bg-accent text-accent-foreground" : "hover-elevate",
                )}
                data-testid={`command-person-${p.id}`}
              >
                <PersonAvatar person={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{fullDisplayName(p)}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {lifespan(p)}
                    {p.birth?.place ? ` · ${p.birth.place}` : ""}
                  </span>
                </span>
                {active && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <KeyHint k="↑↓" label="Navigate" />
            <KeyHint k="↵" label="Open" />
            <KeyHint k="Esc" label="Close" />
          </div>
          <div className="flex items-center gap-2">
            <KeyHint k="⌘K" label="Toggle" />
            <KeyHint k="/" label="Search" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 font-medium">
      {label}
    </div>
  );
}

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px]">
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  );
}
