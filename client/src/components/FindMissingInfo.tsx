import { useMemo, useState } from "react";
import { Loader2, Sparkles, KeyRound, RotateCw, AlertCircle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAI } from "@/components/AIContext";
import { useEdit } from "@/components/EditContext";
import { useToast } from "@/hooks/use-toast";
import {
  WebFindingsCard,
  buildFindingsPatch,
  correctionToFinding,
  type PersonWebFinding,
} from "@/components/WebFindingsCard";
import { researchPerson } from "@/lib/openai";
import {
  getGaps,
  GAP_LABELS,
  isAnchorlessPlaceholder,
  people,
  type Person,
} from "@/lib/family";
import researchSuggestionsRaw from "@/research_suggestions.json";
import { familySearchStatus, searchFamilySearch, type FsCandidate } from "@/lib/familysearch";

interface StaticResearch {
  web_findings?: Record<string, PersonWebFinding>;
}
const STATIC = researchSuggestionsRaw as StaticResearch;

/**
 * Per-profile "Find missing info" affordance. Surfaces:
 *   1. A status line of detected gaps,
 *   2. Either a previously researched WebFindingsCard or a button to run
 *      AI research now (web_search + structured JSON),
 *   3. Refresh / re-run controls.
 *
 * The button works for any signed-in OpenAI key; no key → opens ApiKeyDialog.
 */
export function FindMissingInfo({ person }: { person: Person }) {
  const { aiMode, aiReady, getAuth, openKeyDialog, researched, setResearched, researching, setResearching } = useAI();
  const { unlocked, passcode, setPatch, pending } = useEdit();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [autoApply, setAutoApply] = useState(false);

  const gaps = useMemo(() => getGaps(person), [person]);
  const placeholder = useMemo(() => isAnchorlessPlaceholder(person), [person]);
  const finding: PersonWebFinding | undefined =
    researched[person.id] ?? STATIC.web_findings?.[person.id];
  const isBusy = researching.has(person.id);

  async function run() {
    if (placeholder) return; // hard guard — nothing useful to send
    const auth = getAuth();
    if (!auth) {
      openKeyDialog();
      return;
    }
    setError(null);
    setResearching(person.id, true);
    try {
      // Compact id → name lookup so the model can reason about parents/spouses.
      const lookup = new Map<string, string>();
      for (const p of people) lookup.set(p.id, p.name);

      // Fetch FamilySearch candidates to ground the model in verified records.
      let fsCandidates: FsCandidate[] | undefined;
      try {
        const fsStatus = await familySearchStatus();
        if (fsStatus.connected && passcode) {
          const byMatch = (person.birth?.date || "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
          const dyMatch = (person.death?.date || "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
          const fsResult = await searchFamilySearch(
            {
              givenName: person.given ?? undefined,
              surname: person.surname ?? undefined,
              birthYear: byMatch ? parseInt(byMatch[0], 10) : undefined,
              birthPlace: person.birth?.place ?? undefined,
              deathYear: dyMatch ? parseInt(dyMatch[0], 10) : undefined,
              deathPlace: person.death?.place ?? undefined,
            },
            passcode,
          );
          if (fsResult.connected && fsResult.candidates.length > 0) {
            fsCandidates = fsResult.candidates;
          }
        }
      } catch {
        // Non-fatal — proceed without FS grounding.
      }

      const result = await researchPerson({ auth, person, nameById: lookup, allPeople: people, fsCandidates });
      setResearched(person.id, result);

      // AI makes the edits: when opted in (and the editor is unlocked), stage
      // every HIGH-confidence fill/correction automatically. They still land in
      // the pending queue for one-click review + save — nothing is permanent yet.
      if (autoApply && unlocked) {
        const highConf = [
          ...(result.findings ?? []).filter((f) => f.confidence === "high"),
          ...(result.corrections ?? [])
            .filter((c) => c.confidence === "high")
            .map(correctionToFinding),
        ];
        if (highConf.length > 0) {
          const base = pending[person.id] || {};
          setPatch(person.id, buildFindingsPatch(person, base, highConf));
          toast({
            title: "Auto-applied",
            description: `${highConf.length} high-confidence ${highConf.length === 1 ? "edit" : "edits"} staged for review.`,
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally {
      setResearching(person.id, false);
    }
  }

  if (gaps.length === 0 && !finding) {
    return null;
  }

  // Anchorless placeholder (e.g. "Unknown" mother of a known child): we have
  // nothing concrete to send OpenAI — surface the limitation honestly instead
  // of pretending the button will do something useful.
  if (placeholder && !finding) {
    return (
      <section
        className="rounded-lg border border-card-border bg-card p-4 sm:p-5"
        data-testid="find-missing-info-placeholder"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-tight">
              Not enough to research yet
            </h2>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              This person is a placeholder — their name, dates, and places are
              all blank, so there is nothing identifying for the web to match
              on. Add a known given name, surname, birth year, or place from a
              record you already have, then come back and run research.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-card-border bg-card p-4 sm:p-5"
      data-testid="find-missing-info"
    >
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            AI research
          </h2>
          {gaps.length > 0 ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {gaps.length} unfilled field{gaps.length > 1 ? "s" : ""}:{" "}
              <span className="text-foreground/80">
                {gaps.map((g) => GAP_LABELS[g]).join(", ")}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              No major gaps detected, but you can still re-run research.
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={run}
          disabled={isBusy || placeholder}
          data-testid={`research-${person.id}`}
        >
          {isBusy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Researching…
            </>
          ) : finding ? (
            <>
              <RotateCw className="h-3.5 w-3.5 mr-1.5" />
              Re-run research
            </>
          ) : aiReady ? (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Find missing info
            </>
          ) : (
            <>
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              {aiMode === "proxy" ? "Enter passphrase to research" : "Connect OpenAI to research"}
            </>
          )}
        </Button>
      </div>

      {aiReady && unlocked && (
        <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => setAutoApply(e.target.checked)}
            className="h-4 w-4 accent-primary"
            data-testid={`auto-apply-${person.id}`}
          />
          <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>
            Let AI apply high-confidence fixes automatically (still staged for your review).
          </span>
        </label>
      )}

      {error && (
        <div
          className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive break-words"
          data-testid="research-error"
        >
          {error}
        </div>
      )}

      {finding &&
      (finding.findings?.length ||
        finding.corrections?.length ||
        finding.connections?.length ||
        finding.narrative) ? (
        <WebFindingsCard
          person={person}
          finding={finding}
          title={
            researched[person.id]
              ? "Findings from this session"
              : "Seeded findings"
          }
        />
      ) : (
        !isBusy && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {aiReady
              ? "Runs three passes for this person: (1) searches the open web (FindAGrave, obituaries, census, parish records) for missing facts with source URLs, (2) checks the existing dates/places for errors and conflicts, and (3) scans the archive for likely duplicates and missing parent / spouse / sibling links — each one applyable or savable as a note."
              : aiMode === "proxy"
                ? "Enter the family access passphrase to enable AI research — it finds missing facts on the web, flags errors in existing data, and surfaces likely duplicates and missing relationships."
                : "Provide your OpenAI key once per session to enable AI research — it finds missing facts on the web, flags errors in existing data, and surfaces likely duplicates and missing relationships."}
          </p>
        )
      )}
    </section>
  );
}
