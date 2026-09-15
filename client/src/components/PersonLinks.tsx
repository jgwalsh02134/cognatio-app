import {
  Award,
  BookText,
  ExternalLink,
  FileText,
  Flower2,
  HeartHandshake,
  Image as ImageIcon,
  Link2,
  Newspaper,
  Plus,
  Share2,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PersonLink, PersonLinkKind } from "@/lib/family";
import type { PersonPatch } from "@/components/EditContext";

interface KindMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the category chip. */
  chip: string;
}

/** Ordered so the most narrative/engaging links sort to the top of a profile. */
export const LINK_KINDS: PersonLinkKind[] = [
  "obituary",
  "press",
  "wedding",
  "accomplishment",
  "biography",
  "photo",
  "social",
  "record",
  "other",
];

export const LINK_KIND_META: Record<PersonLinkKind, KindMeta> = {
  obituary: {
    label: "Obituary",
    icon: Flower2,
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  },
  press: {
    label: "Press",
    icon: Newspaper,
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  wedding: {
    label: "Wedding",
    icon: HeartHandshake,
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  accomplishment: {
    label: "Accomplishment",
    icon: Award,
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  biography: {
    label: "Biography",
    icon: BookText,
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  },
  photo: {
    label: "Photo",
    icon: ImageIcon,
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  social: {
    label: "Social",
    icon: Share2,
    chip: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  },
  record: {
    label: "Record",
    icon: FileText,
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  },
  other: {
    label: "Link",
    icon: Link2,
    chip: "bg-primary/15 text-primary border-primary/30",
  },
};

/** Make a user-typed URL safe to use as an href (prepend https:// if missing). */
function normalizeUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(u)) return `https://${u}`;
  return u;
}

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function PersonLinksCard({
  links,
  update,
  unlocked,
}: {
  links: PersonLink[];
  update: (patch: PersonPatch) => void;
  unlocked: boolean;
}) {
  if (links.length === 0 && !unlocked) return null;

  function setLinks(next: PersonLink[]) {
    update({ links: next });
  }

  function addLink(kind: PersonLinkKind) {
    setLinks([...links, { kind, title: "", url: "", date: "", note: "" }]);
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Links
          </h2>
          {unlocked && (
            <button
              type="button"
              onClick={() => addLink("obituary")}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 min-h-9 text-xs hover-elevate active-elevate-2"
              data-testid="button-add-link"
            >
              <Plus className="h-3.5 w-3.5" /> Add link
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Obituaries, press, wedding announcements, accomplishments, biographies,
          photos, and other pages about this person.
        </p>

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No links yet.</p>
        ) : unlocked ? (
          <ul className="space-y-2.5">
            {links.map((l, i) => (
              <LinkEditorRow
                key={i}
                link={l}
                onChange={(next) => {
                  const copy = [...links];
                  copy[i] = next;
                  setLinks(copy);
                }}
                onDelete={() => setLinks(links.filter((_, j) => j !== i))}
                index={i}
              />
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {links.map((l, i) => (
              <LinkReadRow key={i} link={l} index={i} />
            ))}
          </ul>
        )}

        {unlocked && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mr-1">
              Quick add
            </span>
            {LINK_KINDS.map((k) => {
              const meta = LINK_KIND_META[k];
              const Icon = meta.icon;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => addLink(k)}
                  className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-2.5 py-1 min-h-8 text-[11px] hover-elevate active-elevate-2"
                  data-testid={`quick-add-link-${k}`}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinkReadRow({ link, index }: { link: PersonLink; index: number }) {
  const meta = LINK_KIND_META[link.kind] ?? LINK_KIND_META.other;
  const Icon = meta.icon;
  const href = normalizeUrl(link.url);
  const host = hostOf(link.url);
  return (
    <li
      className="flex items-start gap-3 rounded-md border border-card-border bg-card p-2.5"
      data-testid={`link-${index}`}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
          meta.chip,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
              meta.chip,
            )}
          >
            {meta.label}
          </span>
          {link.date && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {link.date}
            </span>
          )}
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline break-words"
            data-testid={`link-${index}-anchor`}
          >
            <span className="break-words">{link.title || host || href}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <div className="mt-0.5 text-sm font-medium break-words">
            {link.title || "Untitled link"}
          </div>
        )}
        {host && link.title && (
          <div className="text-[11px] text-muted-foreground truncate">{host}</div>
        )}
        {link.note && (
          <div className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed break-words">
            {link.note}
          </div>
        )}
      </div>
    </li>
  );
}

function LinkEditorRow({
  link,
  onChange,
  onDelete,
  index,
}: {
  link: PersonLink;
  onChange: (next: PersonLink) => void;
  onDelete: () => void;
  index: number;
}) {
  const inputCls =
    "block w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  return (
    <li
      className="rounded-md border border-card-border bg-card p-2.5"
      data-testid={`link-edit-${index}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <select
          value={link.kind}
          onChange={(e) => onChange({ ...link, kind: e.target.value as PersonLink["kind"] })}
          className="rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          data-testid={`link-${index}-kind`}
        >
          {LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {LINK_KIND_META[k].label}
            </option>
          ))}
        </select>
        <input
          value={link.date ?? ""}
          onChange={(e) => onChange({ ...link, date: e.target.value })}
          placeholder="Date (e.g. 1972)"
          className="w-28 rounded border border-input bg-background px-2 py-1.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
          data-testid={`link-${index}-date`}
        />
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto shrink-0 inline-flex h-9 w-9 items-center justify-center rounded text-muted-foreground/70 hover:text-destructive hover-elevate active-elevate-2"
          aria-label="Delete link"
          data-testid={`link-${index}-delete`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        <input
          value={link.title}
          onChange={(e) => onChange({ ...link, title: e.target.value })}
          placeholder="Title (e.g. Albany Times Union obituary)"
          className={inputCls}
          data-testid={`link-${index}-title`}
        />
        <input
          value={link.url}
          onChange={(e) => onChange({ ...link, url: e.target.value })}
          placeholder="https://…"
          className="block w-full rounded border border-input bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
          data-testid={`link-${index}-url`}
        />
        <input
          value={link.note ?? ""}
          onChange={(e) => onChange({ ...link, note: e.target.value })}
          placeholder="Short note (optional)"
          className="block w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          data-testid={`link-${index}-note`}
        />
      </div>
    </li>
  );
}
