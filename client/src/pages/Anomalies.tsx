import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Download,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import { fullDisplayName, lifespan } from "@/lib/family";
import {
  anomalyLabel,
  findAnomalies,
  type Anomaly,
  type AnomalyKind,
} from "@/lib/discoveries";
import { PageHero } from "@/components/PageHero";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SeverityFilter = "all" | "high" | "medium" | "low";

const SEVERITY_TONE: Record<Anomaly["severity"], { bg: string; text: string; ring: string }> = {
  high: {
    bg: "bg-rose-500/10 dark:bg-rose-500/15",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/20",
  },
  medium: {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/20",
  },
  low: {
    bg: "bg-foreground/[0.05]",
    text: "text-muted-foreground",
    ring: "ring-foreground/[0.08]",
  },
};

export default function Anomalies() {
  const all = useMemo(() => findAnomalies(), []);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [kindFilter, setKindFilter] = useState<AnomalyKind | "all">("all");

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const a of all) c[a.severity] += 1;
    return c;
  }, [all]);

  const byKind = useMemo(() => {
    const map = new Map<AnomalyKind, number>();
    for (const a of all) map.set(a.kind, (map.get(a.kind) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((a) => {
      if (severity !== "all" && a.severity !== severity) return false;
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      return true;
    });
  }, [all, severity, kindFilter]);

  // Group filtered list by kind for the table-of-issues view.
  const grouped = useMemo(() => {
    const map = new Map<AnomalyKind, Anomaly[]>();
    for (const a of filtered) {
      if (!map.has(a.kind)) map.set(a.kind, []);
      map.get(a.kind)!.push(a);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-5 py-5 sm:py-8">
      <PageHero
        eyebrow="Data quality"
        title="Find what's missing or doesn't add up"
        description="Every check the archive can do without a backend — implausible dates, parents who died before a child was born, single-parent records, missing places, and same-name duplicates. Click into anyone to start fixing the source."
        icon={ShieldAlert}
        stats={[
          { label: "Total issues", value: all.length },
          { label: "High", value: counts.high, tone: "warn" },
          { label: "Medium", value: counts.medium },
          { label: "Low", value: counts.low },
        ]}
      />

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mt-1 mb-5">
        <div
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none snap-x"
          role="tablist"
        >
          {(["all", "high", "medium", "low"] as SeverityFilter[]).map((s) => {
            const active = severity === s;
            return (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={cn(
                  "snap-start inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-2.5 text-xs font-medium transition-colors hover-elevate active-elevate-2",
                  active
                    ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                    : "border-border/70 bg-background/40 text-muted-foreground",
                )}
                data-testid={`anomaly-sev-${s}`}
              >
                {s === "all" ? (
                  <ListChecks className="h-3.5 w-3.5" />
                ) : s === "high" ? (
                  <AlertOctagon className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                <span className="capitalize">{s}</span>
                <span className="tabular-nums opacity-60">
                  {s === "all" ? all.length : counts[s]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:ml-auto md:shrink-0">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as AnomalyKind | "all")}
            className="rounded-md border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs min-h-10 w-full sm:w-auto max-w-full sm:max-w-[12rem] min-w-0"
            data-testid="anomaly-kind"
          >
            <option value="all">All issue types</option>
            {byKind.map(([kind, n]) => (
              <option key={kind} value={kind}>
                {anomalyLabel(kind)} ({n})
              </option>
            ))}
          </select>
          <ExportButton anomalies={filtered} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Check className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            <div className="font-display text-base font-semibold">No issues match these filters</div>
            <div className="text-sm text-muted-foreground mt-1">
              Loosen the filter or check a different severity level.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([kind, items]) => (
            <Card key={kind}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-md ring-1",
                      SEVERITY_TONE[items[0].severity].bg,
                      SEVERITY_TONE[items[0].severity].text,
                      SEVERITY_TONE[items[0].severity].ring,
                    )}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </div>
                  <h2 className="font-display text-sm sm:text-base font-semibold leading-snug">
                    {anomalyLabel(kind)}
                  </h2>
                  <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
                    {items.length}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {items.map((a, idx) => (
                    <AnomalyRow key={a.person.id + idx} anomaly={a} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const p = anomaly.person;
  return (
    <li>
      <Link
        href={`/person/${encodeURIComponent(p.id)}`}
        className="group flex items-center gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2 hover-elevate active-elevate-2"
      >
        <PersonAvatar person={p} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{fullDisplayName(p)}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {lifespan(p)} · {anomaly.detail}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 hidden sm:inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em]",
            SEVERITY_TONE[anomaly.severity].text,
            "border-border/60",
          )}
        >
          {anomaly.severity}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
      </Link>
    </li>
  );
}

function ExportButton({ anomalies }: { anomalies: Anomaly[] }) {
  const [done, setDone] = useState<"copy" | "download" | null>(null);
  const exportPayload = useMemo(() => {
    return JSON.stringify(
      anomalies.map((a) => ({
        kind: a.kind,
        severity: a.severity,
        personId: a.person.id,
        person: fullDisplayName(a.person),
        lifespan: lifespan(a.person),
        detail: a.detail,
      })),
      null,
      2,
    );
  }, [anomalies]);

  function handleCopy() {
    void navigator.clipboard.writeText(exportPayload).then(() => {
      setDone("copy");
      window.setTimeout(() => setDone(null), 1600);
    });
  }
  function handleDownload() {
    const blob = new Blob([exportPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cognatio-anomalies-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDone("download");
    window.setTimeout(() => setDone(null), 1600);
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1.5 text-[11px] hover-elevate active-elevate-2 min-h-10 min-w-10"
        title="Copy as JSON"
        aria-label="Copy anomalies as JSON"
      >
        {done === "copy" ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        <span className="hidden sm:inline">{done === "copy" ? "Copied" : "Copy"}</span>
      </button>
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-2 py-1.5 text-[11px] hover-elevate active-elevate-2 min-h-10 min-w-10"
        title="Download as JSON"
        aria-label="Download anomalies as JSON"
      >
        {done === "download" ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        <span className="hidden sm:inline">JSON</span>
      </button>
    </div>
  );
}
