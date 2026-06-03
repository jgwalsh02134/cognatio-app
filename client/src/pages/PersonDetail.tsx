import { Link, useParams } from "wouter";
import {
  buildPedigree,
  familiesById,
  findRelationship,
  fullDisplayName,
  getPerson,
  getRootPerson,
  getSiblings,
  isLiving,
  lifespan,
  relationshipChain,
  type ChainStep,
  type EventInfo,
  type Person,
  type PedigreeNode,
  type Relationship,
  type Affiliation,
} from "@/lib/family";
import { PersonAvatar } from "@/components/PersonAvatar";
import { SurnameArms, getArmsForSurname } from "@/components/SurnameArms";
import { MilitaryServiceCard, MilitaryBadge } from "@/components/MilitaryService";
import { AffiliationsCard } from "@/components/Affiliations";
import { Card, CardContent } from "@/components/ui/card";
import { useEdit, type EditableSource, type PersonPatch } from "@/components/EditContext";
import { CountryFlag } from "@/components/CountryFlag";
import { linksFor } from "@/lib/researchLinks";
import { censusCoverage, fanClubFor, recordsToObtain } from "@/lib/research";
import { cn } from "@/lib/utils";
import { EditableText, EventEditorPopover } from "@/components/Editable";
import { NameFixChips } from "@/components/NameFixChips";
import { CommunityNotes } from "@/components/CommunityNotes";
import { FindMissingInfo } from "@/components/FindMissingInfo";
import {
  ArrowDown,
  ArrowLeft,
  BookOpen,
  Briefcase,
  Calendar,
  GitBranch,
  GraduationCap,
  Heart,
  Home,
  Info,
  Link2,
  MapPin,
  Plus,
  Printer,
  GitMerge,
  MessageSquare,
  Route,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  Compass,
  ExternalLink,
  ListChecks,
  Check,
} from "lucide-react";
import { useState } from "react";

const SEX_OPTIONS: { value: string; label: string }[] = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "U", label: "Unknown" },
];

const AFFILIATION_PRESETS: { key: string; name: string }[] = [
  { key: "harvard", name: "Harvard University" },
  { key: "cornell", name: "Cornell University" },
  { key: "siena_college", name: "Siena College" },
  { key: "rpi", name: "Rensselaer Polytechnic Institute" },
  { key: "providence_college", name: "Providence College" },
  { key: "fordham", name: "Fordham University" },
  { key: "manhattan_college", name: "Manhattan College" },
  { key: "manhattanville", name: "Manhattanville University" },
  { key: "westminster_college", name: "Westminster College" },
  { key: "southern_pacific", name: "Southern Pacific Railroad" },
  { key: "nys_public_service_commission", name: "NYS Public Service Commission" },
  { key: "us_house", name: "U.S. House of Representatives" },
  { key: "smom", name: "Sovereign Military Order of Malta" },
];

interface PersonWithSources extends Person {
  sources?: EditableSource[];
}

export default function PersonDetail() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id || "");
  const original = getPerson(id);
  const { unlocked, merge, setPatch, pending } = useEdit();
  const person = original ? (merge(original) as PersonWithSources) : null;

  function update(patch: PersonPatch) {
    if (!original) return;
    setPatch(original.id, { ...(pending[original.id] || {}), ...patch });
  }

  if (!person) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">Person not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          The id <code className="font-mono text-xs">{id}</code> isn't in this archive.
        </p>
        <Link href="/people" className="text-primary text-sm mt-4 inline-block">
          ← Back to all people
        </Link>
      </div>
    );
  }

  const sources: EditableSource[] = person.sources ?? [];

  const parents = person.parent_ids.map(getPerson).filter(Boolean) as Person[];
  const siblings = getSiblings(person);
  const pedigree = buildPedigree(person.id, 4);
  const root = getRootPerson();
  const isRoot = person.id === root.id;
  const relationship = isRoot ? null : findRelationship(person.id, root.id);
  const chain = isRoot ? null : relationshipChain(person.id, root.id);

  // Build in-page anchor list based on what content actually exists
  const jumpTargets: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: "section-life", label: "Life", icon: <Calendar className="h-3.5 w-3.5" /> },
  ];
  if (person.military) jumpTargets.unshift({ id: "section-military", label: "Service", icon: <Sparkles className="h-3.5 w-3.5" /> });
  if ((person.affiliations || []).length > 0 || unlocked)
    jumpTargets.push({ id: "section-affiliations", label: "Affiliations", icon: <Link2 className="h-3.5 w-3.5" /> });
  if ((person.notes || []).length > 0 || unlocked)
    jumpTargets.push({ id: "section-notes", label: "Notes", icon: <StickyNote className="h-3.5 w-3.5" /> });
  if (sources.length > 0 || unlocked)
    jumpTargets.push({ id: "section-sources", label: "Sources", icon: <BookOpen className="h-3.5 w-3.5" /> });
  jumpTargets.push({ id: "section-community", label: "Stickies", icon: <MessageSquare className="h-3.5 w-3.5" /> });
  jumpTargets.push({ id: "section-research", label: "Research", icon: <Compass className="h-3.5 w-3.5" /> });
  jumpTargets.push({ id: "section-pedigree", label: "Ancestors", icon: <GitBranch className="h-3.5 w-3.5" /> });
  if (person.family_spouse_ids.length > 0)
    jumpTargets.push({ id: "section-family", label: "Family", icon: <Heart className="h-3.5 w-3.5" /> });

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-5 py-5 sm:py-8 fade-up">
      <div className="flex items-center justify-between mb-5 sm:mb-7 print:hidden">
        <Link
          href="/people"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 -mx-2 min-h-10 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
          data-testid="link-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to people
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href={`/relate?a=${encodeURIComponent(person.id)}`}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 -mx-2 min-h-10 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
            data-testid="link-relate"
          >
            <GitMerge className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Find relation…</span>
            <span className="sm:hidden">Relate</span>
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 -mx-2 min-h-10 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
            data-testid="button-print"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Print profile</span>
            <span className="sm:hidden">Print</span>
          </button>
        </div>
      </div>

      {/* Hero */}
      <header className="grid gap-5 sm:gap-7 sm:grid-cols-[auto_1fr_auto] sm:items-center pb-7 sm:pb-9 border-b">
        <PersonAvatar person={person} size="lg" className="h-20 w-20 sm:h-24 sm:w-24 text-xl sm:text-2xl" />
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2.5">
            <span>{person.surname || "Unknown"} family</span>
            {isLiving(person) && (
              <span className="ml-3 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 normal-case tracking-normal">
                <span className="h-1.5 w-1.5 rounded-full bg-current" /> Living
              </span>
            )}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-[1.15] tracking-tight break-words">
            {unlocked ? (
              <span className="inline-flex flex-wrap items-baseline gap-2">
                <EditableText
                  value={person.given}
                  onSave={(v) => update({ given: v })}
                  placeholder="Given name"
                  emptyLabel="Given"
                  testId="edit-given"
                >
                  <span>{person.given || ""}</span>
                </EditableText>
                <EditableText
                  value={person.surname}
                  onSave={(v) => update({ surname: v })}
                  placeholder="Surname"
                  emptyLabel="Surname"
                  testId="edit-surname"
                >
                  <span>{person.surname || ""}</span>
                </EditableText>
              </span>
            ) : (
              fullDisplayName(person)
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-2.5 break-words">
            <span className="tabular-nums">{lifespan(person)}</span>
            {person.birth?.place ? (
              <>
                <span className="mx-2 text-muted-foreground/50">·</span>
                <span>Born in {person.birth.place}</span>
              </>
            ) : null}
          </p>
          <NameFixChips person={person} />
          {unlocked && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-[0.16em]">Sex</span>
              <select
                value={person.sex ?? ""}
                onChange={(e) => update({ sex: e.target.value || null })}
                className="rounded border border-input bg-background px-2 py-0.5 text-xs"
                data-testid="edit-sex"
              >
                <option value="">—</option>
                {SEX_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isRoot ? (
            <div
              className="inline-flex items-center gap-1.5 mt-3 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              data-testid="badge-root"
            >
              <Sparkles className="h-3 w-3" />
              Reference person for this archive
            </div>
          ) : relationship ? (
            (() => {
              const isOrphan = relationship.label.startsWith("in the ");
              return (
                <Link
                  href={`/person/${encodeURIComponent(root.id)}`}
                  className="inline-flex items-center gap-2 mt-3 max-w-full rounded-full border border-card-border bg-card pl-1 pr-3 py-1.5 min-h-10 hover-elevate active-elevate-2"
                  data-testid="badge-relationship"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <GitBranch className="h-3 w-3" />
                  </span>
                  <span className="text-xs min-w-0 break-words">
                    {!isOrphan && (
                      <span className="text-muted-foreground">
                        {relationship.bySpouse ? "By marriage · " : ""}
                      </span>
                    )}
                    <span className="font-medium">{relationship.label}</span>
                    {!isOrphan && (
                      <span className="text-muted-foreground"> of {root.given}</span>
                    )}
                  </span>
                </Link>
              );
            })()
          ) : (
            <div
              className="inline-flex items-center gap-1.5 mt-3 rounded-full border border-dashed border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground"
              data-testid="badge-relationship-unknown"
            >
              No tracked relationship to {root.given}
            </div>
          )}
          {person.military && (
            <div className="mt-3">
              <MilitaryBadge person={person} />
            </div>
          )}
        </div>
        {getArmsForSurname(person.surname) && (
          <Link
            href={`/people?surname=${encodeURIComponent(person.surname || "")}`}
            className="hidden sm:flex flex-col items-center gap-2 self-center rounded-md px-2 py-1.5 hover-elevate active-elevate-2"
            data-testid="hero-arms-link"
            title={`See all ${person.surname} family members`}
          >
            <SurnameArms surname={person.surname} size="lg" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Family arms
            </span>
          </Link>
        )}
      </header>

      {!isRoot && chain && chain.length > 1 && (
        <RelationshipChainCard chain={chain} root={root} relationship={relationship} />
      )}

      <div className="mt-6 sm:mt-8 print:hidden">
        <FindMissingInfo person={person} />
      </div>

      {/* In-page jump nav */}
      {jumpTargets.length > 1 && (
        <nav
          aria-label="On this page"
          className="mt-7 sm:mt-9 -mx-4 sm:mx-0 print:hidden"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-4 sm:px-0 py-1">
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 mr-1 shrink-0">
              On this page
            </span>
            {jumpTargets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => scrollToSection(t.id)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-card-border bg-card px-3 py-2.5 min-h-10 text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2"
                data-testid={`jump-${t.id}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Sticky notes — kept near the top of the profile so they're seen and
          easy to add, above the two-column facts/relationships grid. */}
      <section id="section-community" className="scroll-mt-24 mt-6 sm:mt-8 print:hidden">
        <CommunityNotes person={person} />
      </section>

      <div className="grid gap-6 md:gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] mt-6 sm:mt-8">
        {/* Left: facts & life */}
        <div className="space-y-6 min-w-0">
          {person.military && (
            <section id="section-military" className="scroll-mt-24">
              <MilitaryServiceCard person={person} />
            </section>
          )}
          <section id="section-life" className="scroll-mt-24 space-y-6">
            <FactsCard person={person} update={update} unlocked={unlocked} />
            {unlocked && (
              <>
                <OccupationsEditor person={person} update={update} />
                <ResidencesEditor person={person} update={update} />
                <EducationsEditor person={person} update={update} />
              </>
            )}
          </section>
          <section id="section-affiliations" className="scroll-mt-24">
            <AffiliationsEditor person={person} update={update} unlocked={unlocked} />
          </section>
          <section id="section-notes" className="scroll-mt-24">
            <NotesEditor person={person} update={update} unlocked={unlocked} />
          </section>
          <section id="section-sources" className="scroll-mt-24">
            <SourcesEditor sources={sources} update={update} unlocked={unlocked} />
          </section>
          <section id="section-research" className="scroll-mt-24">
            <ResearchCard person={person} />
          </section>
          <section id="section-pedigree" className="scroll-mt-24">
            <PedigreeCard pedigree={pedigree} />
          </section>
        </div>

        {/* Right: relationships */}
        <div className="space-y-6 min-w-0" id="section-family">
          {parents.length > 0 && (
            <RelationGroup label="Parents" icon={<GitBranch className="h-4 w-4" />}>
              {parents.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))}
            </RelationGroup>
          )}

          <SpousesGroup person={person} unlocked={unlocked} />

          {siblings.length > 0 && (
            <RelationGroup label="Siblings" icon={<Users className="h-4 w-4" />}>
              {siblings.map((p) => (
                <PersonRow key={p.id} person={p} />
              ))}
            </RelationGroup>
          )}
        </div>
      </div>
    </div>
  );
}

function FactsCard({
  person,
  update,
  unlocked,
}: {
  person: Person;
  update: (patch: PersonPatch) => void;
  unlocked: boolean;
}) {
  const facts: { icon: React.ReactNode; label: string; date?: string | null; place?: string | null; note?: string | null }[] = [];
  if (person.birth) {
    facts.push({
      icon: <Calendar className="h-4 w-4" />,
      label: "Born",
      date: person.birth.date,
      place: person.birth.place,
      note: person.birth.note,
    });
  }
  for (const ed of person.educations) {
    facts.push({
      icon: <GraduationCap className="h-4 w-4" />,
      label: "Education",
      date: ed.date,
      place: ed.place,
      note: ed.note,
    });
  }
  for (const occ of person.occupations) {
    facts.push({
      icon: <StickyNote className="h-4 w-4" />,
      label: "Occupation",
      note: occ,
    });
  }
  for (const r of person.residences.slice(0, 8)) {
    facts.push({
      icon: <Home className="h-4 w-4" />,
      label: "Lived",
      date: r.date,
      place: r.place,
      note: r.note,
    });
  }
  if (person.death) {
    facts.push({
      icon: <Calendar className="h-4 w-4" />,
      label: "Died",
      date: person.death.date,
      place: person.death.place,
      note: person.death.note,
    });
  }
  if (person.burial) {
    facts.push({
      icon: <MapPin className="h-4 w-4" />,
      label: "Buried",
      date: person.burial.date,
      place: person.burial.place,
      note: person.burial.note,
    });
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 sm:mb-4 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display text-base font-semibold">Life</h2>
          {unlocked && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="flex items-center gap-1">
                Born
                <EventEditorPopover
                  label="Birth"
                  date={person.birth?.date}
                  place={person.birth?.place}
                  onSave={(v) =>
                    update({
                      birth: {
                        date: v.date,
                        place: v.place,
                        note: person.birth?.note ?? null,
                      },
                    })
                  }
                  testId="edit-birth"
                />
              </span>
              <span className="flex items-center gap-1">
                Died
                <EventEditorPopover
                  label="Death"
                  date={person.death?.date}
                  place={person.death?.place}
                  onSave={(v) =>
                    update({
                      death: {
                        date: v.date,
                        place: v.place,
                        note: person.death?.note ?? null,
                      },
                    })
                  }
                  testId="edit-death"
                />
              </span>
              <span className="flex items-center gap-1">
                Buried
                <EventEditorPopover
                  label="Burial"
                  date={person.burial?.date}
                  place={person.burial?.place}
                  onSave={(v) =>
                    update({
                      burial: {
                        date: v.date,
                        place: v.place,
                        note: person.burial?.note ?? null,
                      },
                    })
                  }
                  testId="edit-burial"
                />
              </span>
            </div>
          )}
        </div>
        {facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded life events.</p>
        ) : (
          <ol className="space-y-4 relative">
            {facts.map((f, i) => (
              <li key={i} className="grid grid-cols-[auto_1fr] gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-primary mt-0.5">
                  {f.icon}
                </div>
                <div className="text-sm">
                  <div className="font-medium">
                    {f.label}
                    {f.date && <span className="text-muted-foreground font-normal ml-2">{f.date}</span>}
                  </div>
                  {f.place && <div className="text-muted-foreground break-words">{f.place}</div>}
                  {f.note && <div className="text-xs text-muted-foreground/85 mt-0.5 break-words">{f.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function NotesEditor({
  person,
  update,
  unlocked,
}: {
  person: Person;
  update: (patch: PersonPatch) => void;
  unlocked: boolean;
}) {
  const notes = person.notes;

  if (notes.length === 0 && !unlocked) return null;

  function setNotes(next: string[]) {
    update({ notes: next });
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" /> Notes
          </h2>
          {unlocked && (
            <button
              type="button"
              onClick={() => setNotes([...notes, ""])}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover-elevate active-elevate-2"
              data-testid="button-add-note"
            >
              <Plus className="h-3 w-3" /> Add note
            </button>
          )}
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No notes yet.</p>
        ) : (
          <div className="space-y-3 text-sm leading-relaxed text-foreground/85">
            {notes.map((n, i) => (
              <NoteRow
                key={i}
                index={i}
                note={n}
                unlocked={unlocked}
                onChange={(v) => {
                  const next = [...notes];
                  next[i] = v;
                  setNotes(next);
                }}
                onDelete={() => setNotes(notes.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoteRow({
  note,
  index,
  unlocked,
  onChange,
  onDelete,
}: {
  note: string;
  index: number;
  unlocked: boolean;
  onChange: (v: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  if (!unlocked) {
    return (
      <p className="whitespace-pre-line break-words" data-testid={`note-${index}`}>
        {note}
      </p>
    );
  }

  if (editing) {
    return (
      <div className="rounded border border-input p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="block w-full rounded bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 font-sans leading-relaxed"
          data-testid={`note-${index}-input`}
        />
        <div className="flex items-center justify-end gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => {
              setDraft(note);
              setEditing(false);
            }}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover-elevate active-elevate-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(draft);
              setEditing(false);
            }}
            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover-elevate active-elevate-2"
            data-testid={`note-${index}-save`}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <p
        className="whitespace-pre-line flex-1 cursor-pointer hover:bg-accent/30 rounded px-1 -mx-1"
        onClick={() => {
          setDraft(note);
          setEditing(true);
        }}
        data-testid={`note-${index}`}
      >
        {note || <span className="italic text-muted-foreground/70">Empty note — click to edit</span>}
      </p>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 hover:text-destructive hover-elevate active-elevate-2"
        aria-label="Delete note"
        data-testid={`note-${index}-delete`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SourcesEditor({
  sources,
  update,
  unlocked,
}: {
  sources: EditableSource[];
  update: (patch: PersonPatch) => void;
  unlocked: boolean;
}) {
  if (sources.length === 0 && !unlocked) return null;

  function setSources(next: EditableSource[]) {
    update({ sources: next });
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Sources
          </h2>
          {unlocked && (
            <button
              type="button"
              onClick={() => setSources([...sources, { title: "", url: "" }])}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover-elevate active-elevate-2"
              data-testid="button-add-source"
            >
              <Plus className="h-3 w-3" /> Add source
            </button>
          )}
        </div>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No sources yet.</p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded border border-card-border bg-card p-2"
                data-testid={`source-${i}`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  {unlocked ? (
                    <>
                      <input
                        value={s.title}
                        onChange={(e) => {
                          const next = [...sources];
                          next[i] = { ...s, title: e.target.value };
                          setSources(next);
                        }}
                        placeholder="Title (e.g. 1900 Federal Census)"
                        className="block w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        data-testid={`source-${i}-title`}
                      />
                      <input
                        value={s.url}
                        onChange={(e) => {
                          const next = [...sources];
                          next[i] = { ...s, url: e.target.value };
                          setSources(next);
                        }}
                        placeholder="URL"
                        className="block w-full rounded border border-input bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                        data-testid={`source-${i}-url`}
                      />
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium truncate">{s.title || "Untitled source"}</div>
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary break-all hover:underline"
                        >
                          {s.url}
                        </a>
                      )}
                    </>
                  )}
                </div>
                {unlocked && (
                  <button
                    type="button"
                    onClick={() => setSources(sources.filter((_, j) => j !== i))}
                    className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 hover:text-destructive hover-elevate active-elevate-2"
                    aria-label="Delete source"
                    data-testid={`source-${i}-delete`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AffiliationsEditor({
  person,
  update,
  unlocked,
}: {
  person: Person;
  update: (patch: PersonPatch) => void;
  unlocked: boolean;
}) {
  const list: Affiliation[] = person.affiliations ?? [];

  if (!unlocked) {
    // Use the existing read-only card when not editing
    return <AffiliationsCard person={person} />;
  }

  function setList(next: Affiliation[]) {
    update({ affiliations: next });
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Affiliations
          </h2>
          <button
            type="button"
            onClick={() => setList([...list, { key: "", name: "" }])}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover-elevate active-elevate-2"
            data-testid="button-add-affiliation"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No affiliations yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((a, i) => (
              <li
                key={i}
                className="rounded border border-card-border bg-card p-2 space-y-1.5"
                data-testid={`affiliation-edit-${i}`}
              >
                <div className="flex items-center gap-2">
                  <select
                    value={a.key}
                    onChange={(e) => {
                      const preset = AFFILIATION_PRESETS.find((p) => p.key === e.target.value);
                      const next = [...list];
                      next[i] = preset
                        ? { ...a, key: preset.key, name: preset.name }
                        : { ...a, key: e.target.value };
                      setList(next);
                    }}
                    className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                    data-testid={`affiliation-${i}-key`}
                  >
                    <option value="">— Select logo —</option>
                    {AFFILIATION_PRESETS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}
                      </option>
                    ))}
                    {a.key && !AFFILIATION_PRESETS.find((p) => p.key === a.key) && (
                      <option value={a.key}>{a.key} (custom)</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => setList(list.filter((_, j) => j !== i))}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 hover:text-destructive hover-elevate active-elevate-2"
                    aria-label="Delete affiliation"
                    data-testid={`affiliation-${i}-delete`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={a.name}
                  onChange={(e) => {
                    const next = [...list];
                    next[i] = { ...a, name: e.target.value };
                    setList(next);
                  }}
                  placeholder="Display name"
                  className="block w-full rounded border border-input bg-background px-2 py-1 text-sm"
                  data-testid={`affiliation-${i}-name`}
                />
                <input
                  value={a.role ?? ""}
                  onChange={(e) => {
                    const next = [...list];
                    next[i] = { ...a, role: e.target.value || null };
                    setList(next);
                  }}
                  placeholder="Role (e.g. Alumna, Commissioner)"
                  className="block w-full rounded border border-input bg-background px-2 py-1 text-sm"
                  data-testid={`affiliation-${i}-role`}
                />
                <input
                  value={a.dates ?? ""}
                  onChange={(e) => {
                    const next = [...list];
                    next[i] = { ...a, dates: e.target.value || null };
                    setList(next);
                  }}
                  placeholder="Dates (e.g. 1948–1952)"
                  className="block w-full rounded border border-input bg-background px-2 py-1 text-sm"
                  data-testid={`affiliation-${i}-dates`}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OccupationsEditor({
  person,
  update,
}: {
  person: Person;
  update: (patch: PersonPatch) => void;
}) {
  const list = person.occupations ?? [];
  function setList(next: string[]) {
    update({ occupations: next });
  }
  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Occupations
          </h2>
          <button
            type="button"
            onClick={() => setList([...list, ""])}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover-elevate active-elevate-2"
            data-testid="button-add-occupation"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          One occupation per row (e.g. "Schoolteacher", "U.S. Representative", "Carpenter").
        </p>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No occupations recorded.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((occ, i) => (
              <li key={i} className="flex items-center gap-2" data-testid={`occupation-edit-${i}`}>
                <input
                  value={occ}
                  onChange={(e) => {
                    const next = [...list];
                    next[i] = e.target.value;
                    setList(next);
                  }}
                  placeholder="Occupation"
                  className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  data-testid={`occupation-${i}-input`}
                />
                <button
                  type="button"
                  onClick={() => setList(list.filter((_, j) => j !== i))}
                  className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 hover:text-destructive hover-elevate active-elevate-2"
                  aria-label="Remove occupation"
                  data-testid={`occupation-${i}-delete`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EventListEditor({
  title,
  icon,
  testIdPrefix,
  hint,
  list,
  setList,
}: {
  title: string;
  icon: React.ReactNode;
  testIdPrefix: string;
  hint: string;
  list: EventInfo[];
  setList: (next: EventInfo[]) => void;
}) {
  function blank(): EventInfo {
    return { date: null, place: null, note: null };
  }
  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            {icon} {title}
          </h2>
          <button
            type="button"
            onClick={() => setList([...list, blank()])}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover-elevate active-elevate-2"
            data-testid={`button-add-${testIdPrefix}`}
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{hint}</p>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nothing recorded.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((ev, i) => (
              <li
                key={i}
                className="rounded border border-card-border bg-card p-2 space-y-1.5"
                data-testid={`${testIdPrefix}-edit-${i}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    value={ev.date ?? ""}
                    onChange={(e) => {
                      const next = [...list];
                      next[i] = { ...ev, date: e.target.value || null };
                      setList(next);
                    }}
                    placeholder="Date (e.g. 1900, June 1899, 1880–1885)"
                    className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    data-testid={`${testIdPrefix}-${i}-date`}
                  />
                  <button
                    type="button"
                    onClick={() => setList(list.filter((_, j) => j !== i))}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 hover:text-destructive hover-elevate active-elevate-2"
                    aria-label="Remove entry"
                    data-testid={`${testIdPrefix}-${i}-delete`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={ev.place ?? ""}
                  onChange={(e) => {
                    const next = [...list];
                    next[i] = { ...ev, place: e.target.value || null };
                    setList(next);
                  }}
                  placeholder="Place (e.g. Albany, NY)"
                  className="block w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  data-testid={`${testIdPrefix}-${i}-place`}
                />
                <input
                  value={ev.note ?? ""}
                  onChange={(e) => {
                    const next = [...list];
                    next[i] = { ...ev, note: e.target.value || null };
                    setList(next);
                  }}
                  placeholder="Note (optional)"
                  className="block w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  data-testid={`${testIdPrefix}-${i}-note`}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ResidencesEditor({
  person,
  update,
}: {
  person: Person;
  update: (patch: PersonPatch) => void;
}) {
  return (
    <EventListEditor
      title="Residences"
      icon={<Home className="h-4 w-4 text-primary" />}
      testIdPrefix="residence"
      hint="Where the person lived, with optional year or year-range."
      list={person.residences ?? []}
      setList={(next) => update({ residences: next })}
    />
  );
}

function EducationsEditor({
  person,
  update,
}: {
  person: Person;
  update: (patch: PersonPatch) => void;
}) {
  return (
    <EventListEditor
      title="Education"
      icon={<GraduationCap className="h-4 w-4 text-primary" />}
      testIdPrefix="education"
      hint="Schools, degrees, or training (use Affiliations for ongoing institutional ties)."
      list={person.educations ?? []}
      setList={(next) => update({ educations: next })}
    />
  );
}

function SpousesGroup({ person, unlocked }: { person: Person; unlocked: boolean }) {
  if (person.family_spouse_ids.length === 0) return null;
  return (
    <Card className="border-card-border">
      <CardContent className="p-5">
        <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" /> Marriages & children
        </h2>
        {unlocked && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Marriage dates live on family records. Edit them directly in the source GEDCOM or
              <code className="font-mono"> data.json</code> for now — in-app marriage editing is on the
              roadmap.
            </span>
          </div>
        )}
        <div className="space-y-5">
          {person.family_spouse_ids.map((fid) => {
            const fam = familiesById[fid];
            if (!fam) return null;
            const spouseId = fam.husband_id === person.id ? fam.wife_id : fam.husband_id;
            const spouse = spouseId ? getPerson(spouseId) : null;
            const children = fam.children_ids.map(getPerson).filter(Boolean) as Person[];
            return (
              <div key={fid} className="space-y-2">
                {spouse && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                      Spouse
                    </div>
                    <PersonRow person={spouse} />
                    {fam.marriage?.date && (
                      <div className="text-xs text-muted-foreground mt-1 ml-12">
                        Married {fam.marriage.date}
                        {fam.marriage.place ? ` in ${fam.marriage.place}` : ""}
                      </div>
                    )}
                  </div>
                )}
                {children.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1 mt-3">
                      Children
                    </div>
                    <div className="space-y-1">
                      {children.map((c) => (
                        <PersonRow key={c.id} person={c} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RelationGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-card-border">
      <CardContent className="p-5">
        <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="text-primary">{icon}</span> {label}
        </h2>
        <div className="space-y-1">{children}</div>
      </CardContent>
    </Card>
  );
}

function PersonRow({ person }: { person: Person }) {
  return (
    <Link
      href={`/person/${encodeURIComponent(person.id)}`}
      className="flex items-center gap-3 rounded-md p-2 hover-elevate active-elevate-2"
      data-testid={`person-row-${person.id}`}
    >
      <PersonAvatar person={person} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{fullDisplayName(person)}</div>
        <div className="text-xs text-muted-foreground truncate">{lifespan(person)}</div>
      </div>
    </Link>
  );
}

function ResearchCard({ person }: { person: Person }) {
  const links = linksFor(person);
  const census = censusCoverage(person);
  const records = recordsToObtain(person);
  const fan = fanClubFor(person, 6);

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            Research
          </h2>
          <Link
            href="/research"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            data-testid="link-research-workbench"
          >
            Open workbench
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>

        {/* External record searches */}
        <section className="mb-5">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Pre-filled record searches
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={l.hint}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] hover-elevate active-elevate-2",
                  l.group === "tree" && "bg-sky-500/10 border-sky-500/30",
                  l.group === "records" && "bg-emerald-500/10 border-emerald-500/30",
                  l.group === "graves" && "bg-stone-500/10 border-stone-500/30",
                  l.group === "newspapers" && "bg-amber-500/10 border-amber-500/30",
                  l.group === "country" && "bg-violet-500/10 border-violet-500/30",
                )}
                data-testid={`research-link-${l.id}`}
              >
                {l.countryName && <CountryFlag country={l.countryName} className="h-2.5 w-3.5 rounded-sm" />}
                {l.label}
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </section>

        {/* Census coverage */}
        {census.length > 0 && (
          <section className="mb-5">
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Census coverage ({census.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {census.map((c) => (
                <a
                  key={`${c.country}-${c.year}`}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${c.country} ${c.year} census — age ${c.age ?? "?"}${c.placeHint ? " in " + c.placeHint : ""}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background/40 px-2.5 py-1.5 text-[11px] hover-elevate active-elevate-2"
                  data-testid={`census-${c.year}`}
                >
                  <CountryFlag country={c.country} className="h-2.5 w-3.5 rounded-sm" />
                  <span className="font-mono tabular-nums">{c.year}</span>
                  {c.age !== null && <span className="text-muted-foreground">age {c.age}</span>}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Records checklist (compact) */}
        {records.length > 0 && (
          <section className="mb-5">
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2 flex items-center gap-1.5">
              <ListChecks className="h-3 w-3" />
              Records to obtain ({records.filter((r) => !r.likelyHave).length} open)
            </h3>
            <ul className="space-y-1.5">
              {records.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
                    t.likelyHave ? "bg-emerald-500/[0.04] border-emerald-500/20" : "bg-background/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-sm border",
                      t.likelyHave ? "bg-emerald-500/30 border-emerald-500/40" : "border-border",
                    )}
                    aria-hidden
                  >
                    {t.likelyHave && <Check className="h-2 w-2 text-emerald-700 dark:text-emerald-300" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium flex items-center gap-1.5">
                      {t.label}
                      {t.countryName && <CountryFlag country={t.countryName} className="h-2 w-3 rounded-sm" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{t.why}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* FAN club */}
        {fan.length > 0 && (
          <section>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2 flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              FAN club — possible associates
            </h3>
            <ul className="divide-y">
              {fan.map((n) => (
                <li key={n.person.id}>
                  <Link
                    href={`/person/${n.person.id}`}
                    className="flex items-center gap-2.5 py-1.5 rounded-md px-1.5 -mx-1.5 hover-elevate active-elevate-2"
                    data-testid={`fan-${n.person.id}`}
                  >
                    <PersonAvatar person={n.person} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{fullDisplayName(n.person)}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {lifespan(n.person)} · {n.reasons[0]}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function PedigreeCard({ pedigree }: { pedigree: PedigreeNode }) {
  // Render a 4-column pedigree chart (self → great-grandparents)
  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <h2 className="font-display text-base font-semibold mb-3 sm:mb-4">Direct ancestry</h2>
        <PedigreeColumns root={pedigree} />
      </CardContent>
    </Card>
  );
}

function PedigreeColumns({ root }: { root: PedigreeNode }) {
  // Flatten generations: gen 0 = [root], gen 1 = [father, mother], gen 2 = 4, gen 3 = 8
  const cols: PedigreeNode[][] = [[root]];
  for (let g = 0; g < 3; g++) {
    const next: PedigreeNode[] = [];
    for (const node of cols[g]) {
      next.push(node.father || { person: null, father: null, mother: null });
      next.push(node.mother || { person: null, father: null, mother: null });
    }
    cols.push(next);
  }
  const labels = ["Self", "Parents", "Grandparents", "Great-grandparents"];

  return (
    <>
      {/* Stacked layout (mobile + tablet + narrow desktop columns) */}
      <div className="lg:hidden space-y-3.5">
        {cols.map((col, ci) => {
          const filled = col.filter((n) => n.person).length;
          return (
            <div key={ci}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 flex items-baseline gap-2">
                <span>{labels[ci]}</span>
                <span className="text-muted-foreground/60 normal-case tracking-normal">
                  {filled} of {col.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 [&>*]:min-w-0">
                {col.map((node, ni) => (
                  <PedigreeCell key={`${ci}-${ni}`} node={node} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Wide desktop: 4-column pedigree */}
      <div className="hidden lg:block">
        <div className="flex gap-2.5">
          {cols.map((col, ci) => (
            <div key={ci} className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1 text-center truncate">
                {labels[ci]}
              </div>
              {col.map((node, ni) => (
                <PedigreeCell key={`${ci}-${ni}`} node={node} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RelationshipChainCard({
  chain,
  root,
  relationship,
}: {
  chain: ChainStep[];
  root: Person;
  relationship: Relationship | null;
}) {
  // chain goes from target person → … → root.
  const labelFor = (kind: ChainStep["toNext"]): string => {
    if (kind === "parent") return "parent";
    if (kind === "child") return "child";
    if (kind === "spouse") return "spouse";
    return "";
  };
  const summary = relationship
    ? relationship.label.startsWith("in the ")
      ? relationship.label
      : `${relationship.bySpouse ? "By marriage \u00b7 " : ""}${relationship.label} of ${root.given}`
    : null;
  return (
    <Card className="border-card-border mt-6 sm:mt-8">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-4 sm:mb-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
            <Route className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-tight">
              Path to {root.given}
            </h2>
            {summary && (
              <p className="text-xs text-muted-foreground mt-1 break-words">
                {summary} · {chain.length - 1} step{chain.length - 1 === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        {/* Mobile + tablet: vertical chain */}
        <ol className="sm:hidden space-y-1.5" data-testid="chain-mobile">
          {chain.map((step, i) => (
            <li key={`${step.person.id}-${i}`} className="space-y-1.5">
              <ChainNode
                step={step}
                isFirst={i === 0}
                isLast={i === chain.length - 1}
              />
              {step.toNext && (
                <div className="flex items-center gap-1.5 pl-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <ArrowDown className="h-3 w-3" />
                  <span>{labelFor(step.toNext)}</span>
                </div>
              )}
            </li>
          ))}
        </ol>

        {/* Desktop / wide: horizontal chain that wraps */}
        <ol
          className="hidden sm:flex flex-wrap items-stretch gap-x-1.5 gap-y-3"
          data-testid="chain-desktop"
        >
          {chain.map((step, i) => (
            <li
              key={`${step.person.id}-${i}`}
              className="flex items-stretch gap-1.5"
            >
              <ChainNode
                step={step}
                isFirst={i === 0}
                isLast={i === chain.length - 1}
              />
              {step.toNext && (
                <div className="flex flex-col items-center justify-center px-1.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/80">
                  <span className="text-primary/70 text-sm leading-none">→</span>
                  <span className="mt-1">{labelFor(step.toNext)}</span>
                </div>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ChainNode({
  step,
  isFirst,
  isLast,
}: {
  step: ChainStep;
  isFirst: boolean;
  isLast: boolean;
}) {
  const ringClass = isFirst
    ? "ring-2 ring-primary/40"
    : isLast
      ? "ring-2 ring-primary"
      : "";
  return (
    <Link
      href={`/person/${encodeURIComponent(step.person.id)}`}
      className={`flex items-center gap-2.5 rounded-md border border-card-border bg-card pl-1.5 pr-3 py-2 hover-elevate active-elevate-2 min-w-0 ${ringClass}`}
      data-testid={`chain-${step.person.id}`}
    >
      <PersonAvatar person={step.person} size="sm" />
      <div className="min-w-0">
        <div className="text-xs font-medium leading-tight truncate max-w-[10rem] sm:max-w-[12rem]">
          {fullDisplayName(step.person)}
        </div>
        <div className="text-[10px] text-muted-foreground truncate mt-0.5 tabular-nums">
          {isFirst ? "This person" : isLast ? "You" : lifespan(step.person)}
        </div>
      </div>
    </Link>
  );
}

function PedigreeCell({ node }: { node: PedigreeNode }) {
  if (!node.person) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-2 py-2 min-h-[2.75rem] sm:min-h-[3.25rem] flex items-center justify-center text-[10px] text-muted-foreground/60">
        unknown
      </div>
    );
  }
  return (
    <Link
      href={`/person/${encodeURIComponent(node.person.id)}`}
      className="block rounded-md border border-card-border bg-card px-2 py-1.5 sm:py-2 hover-elevate active-elevate-2 min-w-0"
      data-testid={`pedigree-${node.person.id}`}
    >
      <div className="text-[11px] sm:text-xs font-medium truncate">{fullDisplayName(node.person)}</div>
      <div className="text-[10px] text-muted-foreground truncate">{lifespan(node.person)}</div>
    </Link>
  );
}
