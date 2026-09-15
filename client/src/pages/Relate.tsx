import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  Search,
  X,
  Users,
  ArrowDown,
} from "lucide-react";
import {
  people,
  searchPeople,
  fullDisplayName,
  lifespan,
  peopleById,
  findRelationship,
  relationshipChain,
  isAnchorlessPlaceholder,
  type Person,
  type ChainStep,
} from "@/lib/family";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PickerProps {
  label: string;
  testId: string;
  value: Person | null;
  onChange: (p: Person | null) => void;
}

function PersonPicker({ label, testId, value, onChange }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchPeople(query, 8).filter((p) => !isAnchorlessPlaceholder(p));
  }, [query]);

  return (
    <div ref={ref} className="relative">
      <label className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {label}
      </label>
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(true);
            setTimeout(() => {
              ref.current?.querySelector<HTMLInputElement>("input")?.focus();
            }, 30);
          }}
          className="w-full flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-left hover-elevate active-elevate-2"
          data-testid={`picker-selected-${testId}`}
        >
          <PersonAvatar person={value} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{fullDisplayName(value)}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums truncate">
              {lifespan(value)}
              {value.birth?.place ? ` · ${value.birth.place}` : ""}
            </div>
          </div>
          <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              placeholder="Type a name…"
              className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-background text-sm outline-none focus:border-primary"
              data-testid={`picker-input-${testId}`}
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-md border bg-card shadow-lg max-h-72 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 min-h-10 text-left border-b last:border-b-0 hover-elevate"
                  data-testid={`picker-option-${testId}-${p.id}`}
                >
                  <PersonAvatar person={p} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{fullDisplayName(p)}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums truncate">
                      {lifespan(p)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {open && query.trim() && results.length === 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-md border bg-card shadow-lg p-3 text-xs text-muted-foreground">
              No matches.
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ChainViewProps {
  chain: ChainStep[];
}

const EDGE_LABEL: Record<NonNullable<ChainStep["toNext"]>, string> = {
  parent: "parent of",
  child: "child of",
  spouse: "spouse of",
};

function ChainView({ chain }: ChainViewProps) {
  return (
    <ol className="grid gap-0">
      {chain.map((step, i) => (
        <li key={`${step.person.id}-${i}`} className="grid gap-0">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-card-border bg-card/40 px-3 py-2.5">
            <Link
              href={`/person/${encodeURIComponent(step.person.id)}`}
              className="shrink-0"
            >
              <PersonAvatar person={step.person} size="sm" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/person/${encodeURIComponent(step.person.id)}`}
                className="block text-sm font-medium truncate hover:text-primary"
              >
                {fullDisplayName(step.person)}
              </Link>
              <div className="text-[11px] text-muted-foreground tabular-nums truncate">
                {lifespan(step.person)}
              </div>
            </div>
            {i === 0 && (
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Person A
              </span>
            )}
            {i === chain.length - 1 && (
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Person B
              </span>
            )}
          </div>
          {step.toNext && (
            <div className="flex items-center justify-center gap-1.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <ArrowDown className="h-3 w-3" />
              <span>{EDGE_LABEL[step.toNext]}</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function Relate() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [a, setA] = useState<Person | null>(null);
  const [b, setB] = useState<Person | null>(null);

  // Read ?a= and ?b= from the hash for shareable deep links.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const aId = params.get("a");
    const bId = params.get("b");
    if (aId && peopleById[aId]) setA(peopleById[aId]);
    if (bId && peopleById[bId]) setB(peopleById[bId]);
    // Only initial read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const relationship = useMemo(() => {
    if (!a || !b) return null;
    return findRelationship(a.id, b.id);
  }, [a, b]);

  const chain = useMemo(() => {
    if (!a || !b) return null;
    return relationshipChain(a.id, b.id);
  }, [a, b]);

  const ancestorIdx = useMemo(() => {
    if (!chain) return -1;
    // Find the highest step that is reached only by walking up — common ancestor heuristic.
    // First index i where chain[i-1].toNext === "parent" and chain[i].toNext !== "parent".
    let lastUpRun = -1;
    for (let i = 0; i < chain.length - 1; i++) {
      if (chain[i].toNext === "parent") lastUpRun = i + 1;
      else break;
    }
    return lastUpRun;
  }, [chain]);

  function swap() {
    const tmp = a;
    setA(b);
    setB(tmp);
  }

  function reset() {
    setA(null);
    setB(null);
    navigate("/relate");
  }

  function pickRandom() {
    const pool = people.filter((p) => !isAnchorlessPlaceholder(p));
    if (pool.length < 2) return;
    const pa = pool[Math.floor(Math.random() * pool.length)];
    let pb = pool[Math.floor(Math.random() * pool.length)];
    while (pb.id === pa.id) {
      pb = pool[Math.floor(Math.random() * pool.length)];
    }
    setA(pa);
    setB(pb);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-5 py-5 sm:py-8 fade-up">
      <div className="mb-5 sm:mb-7">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-2 -mx-1.5 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
          data-testid="link-back-home"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back home
        </Link>
      </div>

      <header className="pb-6 sm:pb-8 border-b">
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Relationship calculator
        </p>
        <h1 className="font-display text-lg sm:text-xl font-semibold leading-[1.15] tracking-tight">
          How are they related?
        </h1>
        <p className="text-sm text-muted-foreground mt-2.5 max-w-2xl">
          Pick any two people in the archive and see the shortest connection between them — third
          cousins twice removed, in-laws by marriage, or strangers with no common branch.
        </p>
      </header>

      <section className="mt-6 sm:mt-8 grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-end">
        <PersonPicker label="Person A" testId="a" value={a} onChange={setA} />
        <div className="flex md:flex-col items-center justify-center gap-2 md:gap-1.5 pb-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={swap}
            className="h-10 w-10"
            aria-label="Swap people"
            data-testid="button-swap"
            disabled={!a && !b}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
        </div>
        <PersonPicker label="Person B" testId="b" value={b} onChange={setB} />
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pickRandom}
          className="min-h-10"
          data-testid="button-random-pair"
        >
          <Users className="h-3.5 w-3.5 mr-1.5" />
          Pick a random pair
        </Button>
        {(a || b) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            className="min-h-10"
            data-testid="button-reset"
          >
            Reset
          </Button>
        )}
      </div>

      <section className="mt-7 sm:mt-9">
        {!a || !b ? (
          <Card className="border-card-border border-dashed">
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Pick {!a && !b ? "two people" : !a ? "Person A" : "Person B"} above to see the
                relationship.
              </p>
            </CardContent>
          </Card>
        ) : a.id === b.id ? (
          <Card className="border-card-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              That's the same person.
            </CardContent>
          </Card>
        ) : !relationship || !chain ? (
          <Card className="border-card-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No connection found in the archive — they may belong to different branches that
              aren't linked, or one of them is a placeholder reference.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5">
            <Card className="border-card-border bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-5 sm:p-6">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                  Result
                </p>
                <p className="text-base sm:text-lg leading-snug">
                  <span className="font-medium">{fullDisplayName(a)}</span> is the{" "}
                  <span className="font-display font-semibold text-primary">
                    {relationship.label}
                  </span>{" "}
                  of <span className="font-medium">{fullDisplayName(b)}</span>.
                </p>
                {chain.length > 2 && (
                  <p className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 break-words">
                    <ArrowRight className="h-3 w-3" />
                    Shortest chain through{" "}
                    <span className="tabular-nums font-medium text-foreground">
                      {chain.length - 2}
                    </span>{" "}
                    intermediate{chain.length - 2 === 1 ? " person" : " people"}
                    {ancestorIdx > 0 && ancestorIdx < chain.length - 1 && (
                      <>
                        {" "}
                        · common ancestor:{" "}
                        <Link
                          href={`/person/${encodeURIComponent(chain[ancestorIdx].person.id)}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {fullDisplayName(chain[ancestorIdx].person)}
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>

            <div>
              <h2 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2.5">
                The connection
              </h2>
              <div
                className={cn(
                  "rounded-lg border border-card-border p-3 sm:p-4 bg-card/30",
                )}
                data-testid="chain-view"
              >
                <ChainView chain={chain} />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
