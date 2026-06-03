import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeroStat {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "good" | "primary";
}

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  backHref?: string;
  backLabel?: string;
  stats?: PageHeroStat[];
  children?: React.ReactNode;
}

/**
 * Editorial-style hero for top-level pages. Matches the visual language used
 * across Research / Finder / Roots / Anomalies — eyebrow, large display title,
 * lede paragraph, and an optional stats strip beneath.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  backHref = "/",
  backLabel = "Back home",
  stats,
  children,
}: PageHeroProps) {
  return (
    <header className="relative mb-6 sm:mb-8 fade-up">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 -mx-2 min-h-10 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
      >
        <ArrowLeft className="h-3 w-3" />
        {backLabel}
      </Link>
      <div className="mt-4 flex items-start gap-3 sm:gap-4">
        {Icon ? (
          <div className="hidden sm:flex shrink-0 mt-1 h-10 w-10 items-center justify-center rounded-md bg-foreground/[0.04] border border-border/60 text-foreground/70">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </div>
          <h1 className="mt-1 font-display font-semibold text-3xl sm:text-4xl leading-[1.1] tracking-tight break-words">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm sm:text-[15px] text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      {stats && stats.length > 0 ? (
        <div
          className={cn(
            "mt-6 grid gap-2.5 sm:gap-3",
            stats.length === 2 && "grid-cols-2",
            stats.length === 3 && "grid-cols-3",
            stats.length === 4 && "grid-cols-2 lg:grid-cols-4",
            stats.length >= 5 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
          )}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-md border border-card-border bg-card px-3 py-2.5 sm:px-4 sm:py-3"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </div>
              <div
                className={cn(
                  "mt-1 font-display text-xl sm:text-2xl tabular-nums leading-none",
                  s.tone === "warn" && "text-amber-500 dark:text-amber-400",
                  s.tone === "good" && "text-emerald-600 dark:text-emerald-400",
                  s.tone === "primary" && "text-primary",
                )}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </header>
  );
}
