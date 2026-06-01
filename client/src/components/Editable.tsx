import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEdit } from "./EditContext";

/**
 * Small inline pencil affordance. Visible only when edit mode is unlocked.
 * Clicking it swaps the display for an editor; Save commits via onSave.
 */
function EditAffordance({
  hasValue,
  onClick,
  testId,
}: {
  hasValue: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover-elevate active-elevate-2 align-middle",
      )}
      aria-label={hasValue ? "Edit field" : "Add value"}
    >
      <Pencil className="h-3 w-3" />
    </button>
  );
}

interface EditableTextProps {
  value: string | null | undefined;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /** Render the display itself; if omitted falls back to plain text */
  children?: ReactNode;
  testId?: string;
  /** Optional class on the editor input */
  inputClass?: string;
  /** Class wrapper around display + affordance */
  className?: string;
  /** Empty-state label when value is falsy (and we're in edit mode) */
  emptyLabel?: string;
}

export function EditableText({
  value,
  onSave,
  placeholder,
  multiline,
  children,
  testId,
  inputClass,
  className,
  emptyLabel = "Add value",
}: EditableTextProps) {
  const { unlocked } = useEdit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) setDraft(value ?? "");
  }, [editing, value]);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 10);
  }, [editing]);

  function commit() {
    onSave(draft.trim());
    setEditing(false);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (!unlocked) {
    return <>{children ?? value ?? null}</>;
  }

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <span className={cn("inline-flex items-start gap-1.5 align-baseline", className)}>
        <Tag
          ref={inputRef as never}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (!multiline && e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          rows={multiline ? 3 : undefined}
          className={cn(
            "rounded border border-input bg-background px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
            multiline && "block w-full font-sans leading-relaxed",
            inputClass,
          )}
          data-testid={testId ? `${testId}-input` : undefined}
        />
        <span className="inline-flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={commit}
            aria-label="Save"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-primary hover-elevate active-elevate-2"
            data-testid={testId ? `${testId}-save` : undefined}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancel"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover-elevate active-elevate-2"
            data-testid={testId ? `${testId}-cancel` : undefined}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </span>
    );
  }

  // Display mode (unlocked but not currently editing)
  const display = children ?? value ?? null;
  const hasValue = !!(value && String(value).trim());
  return (
    <span className={cn("inline-flex items-center gap-0 align-baseline", className)}>
      {hasValue ? (
        display
      ) : (
        <span className="italic text-muted-foreground/70 text-xs">{emptyLabel}</span>
      )}
      <EditAffordance
        hasValue={hasValue}
        onClick={() => setEditing(true)}
        testId={testId ? `${testId}-edit` : undefined}
      />
    </span>
  );
}

interface EventEditorProps {
  label: string;
  date: string | null | undefined;
  place: string | null | undefined;
  onSave: (next: { date: string | null; place: string | null }) => void;
  testId?: string;
  /** Hide the place field (for fields that only carry a date) */
  placeOnly?: boolean;
}

/**
 * Stacked editor for a date + place combo (used by birth/death/burial).
 * In display mode renders nothing — the parent renders its own visual. The
 * "edit" button is rendered next to the parent label.
 */
export function EventEditorPopover({
  label,
  date,
  place,
  onSave,
  testId,
  placeOnly,
}: EventEditorProps) {
  const { unlocked } = useEdit();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(date ?? "");
  const [p, setP] = useState(place ?? "");

  useEffect(() => {
    if (open) {
      setD(date ?? "");
      setP(place ?? "");
    }
  }, [open, date, place]);

  if (!unlocked) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label={`Edit ${label}`}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover-elevate active-elevate-2 align-middle"
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        <Pencil className="h-3 w-3" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-start justify-center pt-[20vh] px-4"
          onClick={() => setOpen(false)}
          data-testid={testId ? `${testId}-overlay` : undefined}
        >
          <div
            className="w-full max-w-sm rounded-md border bg-popover p-4 shadow-md text-sm"
            onClick={(e) => e.stopPropagation()}
            data-testid={testId ? `${testId}-popover` : undefined}
          >
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground mb-2">
            Edit {label}
          </div>
          <label className="block text-[11px] text-muted-foreground mb-1">Date</label>
          <input
            value={d}
            onChange={(e) => setD(e.target.value)}
            placeholder="e.g. 12 Apr 1923 or 1923"
            className="mb-2 w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            data-testid={testId ? `${testId}-date` : undefined}
          />
          {!placeOnly && (
            <>
              <label className="block text-[11px] text-muted-foreground mb-1">Place</label>
              <input
                value={p}
                onChange={(e) => setP(e.target.value)}
                placeholder="City, County, Country"
                className="mb-2 w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                data-testid={testId ? `${testId}-place` : undefined}
              />
            </>
          )}
          <div className="flex items-center justify-end gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover-elevate active-elevate-2"
              data-testid={testId ? `${testId}-cancel` : undefined}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave({
                  date: d.trim() || null,
                  place: placeOnly ? (place ?? null) : (p.trim() || null),
                });
                setOpen(false);
              }}
              className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover-elevate active-elevate-2"
              data-testid={testId ? `${testId}-save` : undefined}
            >
              Save
            </button>
          </div>
          </div>
        </div>
      )}
    </>
  );
}
