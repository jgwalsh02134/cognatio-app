import { Link, useLocation } from "wouter";
import { Download, FileEdit, X } from "lucide-react";
import { useEdit } from "./EditContext";

/**
 * Sticky bottom-of-viewport bar that appears whenever the user is in edit
 * mode AND has at least one pending change. Provides a single, unmistakable
 * path from "I made an edit" to "I have a downloadable, saveable file".
 *
 * - Hidden when edit mode is locked.
 * - Hidden when there are no pending edits.
 * - Hidden when the user is already on the /changes page (avoid duplication).
 * - Sits above the mobile bottom nav (md:hidden) via bottom-[3.5rem].
 * - Sits clear of the AI chat launcher on desktop.
 */
export function EditSaveBar() {
  const { unlocked, hasChanges, count, discardAll } = useEdit();
  const [location] = useLocation();

  if (!unlocked) return null;
  if (!hasChanges) return null;
  if (location === "/changes") return null;

  return (
    <div
      className="fixed inset-x-0 z-30 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-4 px-3 sm:px-5 pointer-events-none print:hidden"
      data-testid="edit-save-bar"
      data-edit-save-bar
    >
      <div className="mx-auto max-w-3xl pointer-events-auto">
        <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-primary/40 bg-primary text-primary-foreground shadow-xl px-3 sm:px-4 py-2.5 sm:py-3">
          <FileEdit className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">
              {count} unsaved {count === 1 ? "edit" : "edits"}
            </div>
            <div className="hidden sm:block text-[11px] opacity-85 leading-tight mt-0.5 truncate">
              Edits stay in this session only — review and download to make them permanent.
            </div>
          </div>
          <Link
            href="/changes"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-foreground text-primary text-xs sm:text-sm font-semibold px-3 sm:px-3.5 hover-elevate active-elevate-2 shrink-0 whitespace-nowrap"
            data-testid="save-bar-review"
          >
            <Download className="h-4 w-4" />
            Review &amp; save
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Discard all ${count} pending ${count === 1 ? "edit" : "edits"}?`)) {
                discardAll();
              }
            }}
            aria-label="Discard all pending edits"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-primary-foreground/80 hover:text-primary-foreground hover-elevate active-elevate-2 shrink-0"
            data-testid="save-bar-discard"
            title="Discard all pending edits"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditSaveBar;
