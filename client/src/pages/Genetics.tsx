import { useMemo } from "react";
import { Link } from "wouter";
import { Dna, Droplet, Lock, Microscope } from "lucide-react";
import {
  people,
  fullDisplayName,
  lifespan,
  type GeneticInfo,
  type Person,
} from "@/lib/family";
import { PageHero } from "@/components/PageHero";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { useEdit } from "@/components/EditContext";

function hasGenetics(g?: GeneticInfo | null): boolean {
  if (!g) return false;
  return Boolean(
    g.tested ||
      g.companies?.length ||
      g.yDnaHaplogroup ||
      g.mtDnaHaplogroup ||
      g.ethnicity ||
      g.bloodType ||
      g.traits ||
      g.health ||
      g.kitRefs?.length ||
      g.notes,
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-card-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

export default function Genetics() {
  const { merge, unlocked } = useEdit();

  const withDna = useMemo(
    () => people.map((p) => merge(p)).filter((p) => hasGenetics(p.genetics)),
    [merge],
  );

  const stats = useMemo(() => {
    const tested = withDna.filter((p) => p.genetics?.tested).length;
    const y = new Set<string>();
    const mt = new Set<string>();
    for (const p of withDna) {
      if (p.genetics?.yDnaHaplogroup) y.add(p.genetics.yDnaHaplogroup.trim());
      if (p.genetics?.mtDnaHaplogroup) mt.add(p.genetics.mtDnaHaplogroup.trim());
    }
    return { tested, y: y.size, mt: mt.size };
  }, [withDna]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-5 py-5 sm:py-8">
      <PageHero
        eyebrow="Heritable record"
        title="Genetics & DNA"
        description="DNA tests, haplogroups, inherited traits, and health history preserved across the family — so future generations can pick up the thread. Recorded per person on each profile (behind the family passphrase)."
        icon={Dna}
        stats={[
          { label: "People with DNA info", value: withDna.length },
          { label: "DNA tested", value: stats.tested, tone: "primary" },
          { label: "Y-DNA lines", value: stats.y },
          { label: "mtDNA lines", value: stats.mt },
        ]}
      />

      {withDna.length === 0 ? (
        <Card className="border-card-border border-dashed">
          <CardContent className="p-8 text-center">
            <Dna className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <h2 className="font-display text-base font-semibold mt-3">
              No genetic information recorded yet
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
              {unlocked ? (
                <>
                  Open any person's profile and use the{" "}
                  <span className="text-foreground font-medium">Genetics &amp; DNA</span>{" "}
                  section to record DNA tests, Y-DNA / mtDNA haplogroups, ethnicity,
                  blood type, inherited traits, and hereditary health notes.
                </>
              ) : (
                <>
                  Unlock the editor with the family passphrase, then add DNA details
                  from the <span className="text-foreground font-medium">Genetics &amp; DNA</span>{" "}
                  section on any person's profile. Everyone can read what's recorded.
                </>
              )}
            </p>
            <Link
              href="/people"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm hover-elevate active-elevate-2"
              data-testid="genetics-browse-people"
            >
              <Microscope className="h-4 w-4" /> Browse people
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {withDna.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link
                href={`/person/${encodeURIComponent(p.id)}`}
                className="flex items-start gap-3 rounded-lg border border-card-border bg-card p-3.5 hover-elevate active-elevate-2 min-w-0"
                data-testid={`genetics-row-${p.id}`}
              >
                <PersonAvatar person={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{fullDisplayName(p)}</div>
                  <div className="text-xs text-muted-foreground truncate">{lifespan(p)}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.genetics?.tested && <Chip label="DNA tested" />}
                    {p.genetics?.yDnaHaplogroup && (
                      <Chip label={`Y · ${p.genetics.yDnaHaplogroup}`} />
                    )}
                    {p.genetics?.mtDnaHaplogroup && (
                      <Chip label={`mt · ${p.genetics.mtDnaHaplogroup}`} />
                    )}
                    {p.genetics?.bloodType && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-700 dark:text-rose-300">
                        <Droplet className="h-2.5 w-2.5" />
                        {p.genetics.bloodType}
                      </span>
                    )}
                    {(p.genetics?.companies ?? []).map((c) => (
                      <Chip key={c} label={c} />
                    ))}
                  </div>
                  {p.genetics?.ethnicity && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2">
                      {p.genetics.ethnicity}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
        <Lock className="h-3 w-3 mt-0.5 shrink-0" />
        Genetic and health details are sensitive. They're editable only with the
        family passphrase, and the archive ships as a private download for family.
      </p>
    </div>
  );
}
