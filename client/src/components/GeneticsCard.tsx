import { Dna, Lock, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { GeneticInfo, GeneticKitRef } from "@/lib/family";
import type { PersonPatch } from "@/components/EditContext";

const EMPTY: GeneticInfo = {};

function hasAny(g: GeneticInfo): boolean {
  return Boolean(
    g.tested ||
      (g.companies && g.companies.length) ||
      g.yDnaHaplogroup ||
      g.mtDnaHaplogroup ||
      g.ethnicity ||
      g.bloodType ||
      g.traits ||
      g.health ||
      (g.kitRefs && g.kitRefs.length) ||
      g.notes,
  );
}

export function GeneticsCard({
  genetics,
  update,
  unlocked,
}: {
  genetics: GeneticInfo | null | undefined;
  update: (patch: PersonPatch) => void;
  unlocked: boolean;
}) {
  const g = genetics ?? EMPTY;
  const present = hasAny(g);
  if (!present && !unlocked) return null;

  function set(patch: Partial<GeneticInfo>) {
    update({ genetics: { ...g, ...patch } });
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Dna className="h-4 w-4 text-primary" /> Genetics &amp; DNA
          </h2>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-4 leading-relaxed">
          <Lock className="h-3 w-3 mt-0.5 shrink-0" />
          Heritable information preserved for future generations — DNA tests,
          haplogroups, traits, and health history. Sensitive; editable only with
          the family passphrase.
        </p>

        {unlocked ? (
          <GeneticsEditor g={g} set={set} />
        ) : (
          <GeneticsRead g={g} />
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 border-b border-border/40 last:border-0">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

function GeneticsRead({ g }: { g: GeneticInfo }) {
  if (!hasAny(g)) {
    return <p className="text-sm text-muted-foreground italic">No genetic information recorded.</p>;
  }
  return (
    <dl>
      <Row label="DNA tested" value={g.tested ? "Yes" : undefined} />
      <Row label="Tested with" value={g.companies?.join(", ") || undefined} />
      <Row label="Y-DNA haplogroup" value={g.yDnaHaplogroup} />
      <Row label="mtDNA haplogroup" value={g.mtDnaHaplogroup} />
      <Row label="Ethnicity" value={g.ethnicity} />
      <Row label="Blood type" value={g.bloodType} />
      <Row label="Inherited traits" value={g.traits} />
      <Row label="Health history" value={g.health} />
      {(g.kitRefs ?? []).length > 0 && (
        <div className="py-1.5">
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">
            Match references
          </dt>
          <dd>
            <ul className="space-y-0.5">
              {g.kitRefs!.map((k, i) => (
                <li key={i} className="text-sm">
                  <span className="text-muted-foreground">{k.service}:</span> {k.ref}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
      <Row label="Notes" value={g.notes} />
    </dl>
  );
}

const fieldCls =
  "block w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`${fieldCls} mt-1 resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${fieldCls} mt-1`}
        />
      )}
    </label>
  );
}

function GeneticsEditor({
  g,
  set,
}: {
  g: GeneticInfo;
  set: (patch: Partial<GeneticInfo>) => void;
}) {
  const kits = g.kitRefs ?? [];
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={!!g.tested}
          onChange={(e) => set({ tested: e.target.checked })}
          className="h-4 w-4 accent-primary"
          data-testid="genetics-tested"
        />
        Has taken a DNA test
      </label>
      <Field
        label="Tested with (comma-separated)"
        value={(g.companies ?? []).join(", ")}
        onChange={(v) =>
          set({ companies: v.split(",").map((s) => s.trim()).filter(Boolean) })
        }
        placeholder="AncestryDNA, 23andMe, FamilyTreeDNA"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Y-DNA haplogroup" value={g.yDnaHaplogroup ?? ""} onChange={(v) => set({ yDnaHaplogroup: v })} placeholder="R-M269" />
        <Field label="mtDNA haplogroup" value={g.mtDnaHaplogroup ?? ""} onChange={(v) => set({ mtDnaHaplogroup: v })} placeholder="H1" />
      </div>
      <Field label="Ethnicity / admixture" value={g.ethnicity ?? ""} onChange={(v) => set({ ethnicity: v })} placeholder="e.g. 62% Irish, 20% German…" textarea />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Blood type" value={g.bloodType ?? ""} onChange={(v) => set({ bloodType: v })} placeholder="O+" />
        <Field label="Inherited traits" value={g.traits ?? ""} onChange={(v) => set({ traits: v })} placeholder="blue eyes, red hair" />
      </div>
      <Field label="Hereditary health notes" value={g.health ?? ""} onChange={(v) => set({ health: v })} placeholder="Conditions known to run in the family" textarea />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Match references
          </span>
          <button
            type="button"
            onClick={() => set({ kitRefs: [...kits, { service: "", ref: "" }] })}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 min-h-8 text-xs hover-elevate active-elevate-2"
            data-testid="genetics-add-kit"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {kits.length > 0 && (
          <ul className="space-y-1.5">
            {kits.map((k: GeneticKitRef, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <input
                  value={k.service}
                  onChange={(e) => {
                    const next = [...kits];
                    next[i] = { ...k, service: e.target.value };
                    set({ kitRefs: next });
                  }}
                  placeholder="GEDmatch"
                  className={`${fieldCls} w-28 shrink-0`}
                />
                <input
                  value={k.ref}
                  onChange={(e) => {
                    const next = [...kits];
                    next[i] = { ...k, ref: e.target.value };
                    set({ kitRefs: next });
                  }}
                  placeholder="Kit / ID"
                  className={fieldCls}
                />
                <button
                  type="button"
                  onClick={() => set({ kitRefs: kits.filter((_, j) => j !== i) })}
                  className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded text-muted-foreground/70 hover:text-destructive hover-elevate active-elevate-2"
                  aria-label="Remove reference"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field label="Notes" value={g.notes ?? ""} onChange={(v) => set({ notes: v })} placeholder="Anything else worth preserving" textarea />
    </div>
  );
}
