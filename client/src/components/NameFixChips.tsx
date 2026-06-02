import { Sparkles, Wand2 } from "lucide-react";
import { useEdit, type PersonPatch } from "@/components/EditContext";
import { detectNameFixes } from "@/lib/nameClean";
import type { Person } from "@/lib/family";

/**
 * Proactive, one-click name cleanup. When the editor is unlocked and a
 * person's given/surname/suffix has a fixable problem (ALL-CAPS, lowercase,
 * "Wm." abbreviations, stray punctuation), this surfaces a chip per fix plus a
 * "Clean up all" action. Each click stages a normal field edit — nothing is
 * mutated until the user reviews/saves on the Changes page.
 *
 * Renders nothing when locked or when the name is already clean, so it's safe
 * to drop next to any name.
 */
export function NameFixChips({ person }: { person: Person }) {
  const { unlocked, setPatch, pending } = useEdit();
  if (!unlocked) return null;

  // Reflect any pending edits so applied fixes disappear immediately.
  const patch = pending[person.id] ?? {};
  const given = (patch.given ?? person.given) || "";
  const surname = (patch.surname ?? person.surname) || "";
  const suffix = (patch.suffix ?? person.suffix) || "";

  const fixes = detectNameFixes({ given, surname, suffix });
  if (fixes.length === 0) return null;

  function apply(p: PersonPatch) {
    setPatch(person.id, { ...(pending[person.id] || {}), ...p });
  }

  function applyAll() {
    const merged: PersonPatch = { ...(pending[person.id] || {}) };
    for (const f of fixes) merged[f.field] = f.suggested;
    setPatch(person.id, merged);
  }

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      data-testid={`name-fixes-${person.id}`}
    >
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
        <Sparkles className="h-3 w-3" />
        Name cleanup
      </span>
      {fixes.map((f, i) => (
        <button
          key={`${f.field}-${i}`}
          type="button"
          onClick={() => apply({ [f.field]: f.suggested } as PersonPatch)}
          title={`${f.issue}: "${f.current}" → "${f.suggested}"`}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 min-h-9 text-[11px] text-foreground hover-elevate active-elevate-2"
          data-testid={`name-fix-${f.field}-${i}`}
        >
          <span className="text-muted-foreground line-through">{f.current}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">{f.suggested}</span>
        </button>
      ))}
      {fixes.length > 1 && (
        <button
          type="button"
          onClick={applyAll}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 min-h-9 text-[11px] font-medium text-primary-foreground hover-elevate active-elevate-2"
          data-testid={`name-fix-all-${person.id}`}
        >
          <Wand2 className="h-3 w-3" />
          Clean up all
        </button>
      )}
    </div>
  );
}
