import { Link, useLocation } from "wouter";
import {
  Search as SearchIcon,
  Users,
  GitBranch,
  Home as HomeIcon,
  Moon,
  Sun,
  Sparkles,
  Download,
  BarChart3,
  MapPin,
  Clock,
  ScrollText,
  GitMerge,
  Compass,
  Crown,
  Telescope,
  ShieldAlert,
  Lock,
  Unlock,
  Pencil,
  FileEdit,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEdit } from "./EditContext";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { AIChat } from "./AIChat";
import { EditSaveBar } from "./EditSaveBar";
import { CommandPalette } from "./CommandPalette";

const NAV = [
  { href: "/", icon: HomeIcon, label: "Home" },
  { href: "/people", icon: Users, label: "People" },
  { href: "/tree", icon: GitBranch, label: "Tree" },
  { href: "/timeline", icon: Clock, label: "Timeline" },
  { href: "/surnames", icon: ScrollText, label: "Surnames" },
  { href: "/places", icon: MapPin, label: "Places" },
  { href: "/relate", icon: GitMerge, label: "Relate" },
  { href: "/research", icon: Compass, label: "Research" },
  { href: "/roots", icon: Crown, label: "Roots" },
  { href: "/finder", icon: Telescope, label: "Finder" },
  { href: "/anomalies", icon: ShieldAlert, label: "Anomalies" },
  { href: "/insights", icon: BarChart3, label: "Insights" },
  { href: "/gaps", icon: Sparkles, label: "Gaps" },
  { href: "/export", icon: Download, label: "Export" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const { unlocked, unlock, lock, count, hasChanges } = useEdit();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockDraft, setUnlockDraft] = useState("");
  const [unlockErr, setUnlockErr] = useState<string | null>(null);
  const unlockInputRef = useRef<HTMLInputElement>(null);

  // Global shortcuts: Cmd/Ctrl-K and "/" open palette; "e" toggles edit mode.
  useEffect(() => {
    function isTyping(el: EventTarget | null) {
      const n = el as HTMLElement | null;
      if (!n) return false;
      const tag = n.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        n.isContentEditable
      );
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (unlockOpen) {
      setUnlockDraft("");
      setUnlockErr(null);
      setTimeout(() => unlockInputRef.current?.focus(), 30);
    }
  }, [unlockOpen]);

  async function tryUnlock() {
    if (!unlockDraft.trim()) return;
    const ok = await unlock(unlockDraft);
    if (ok) {
      setUnlockOpen(false);
      setUnlockDraft("");
      setUnlockErr(null);
    } else {
      setUnlockErr("Incorrect passphrase");
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center gap-3 sm:gap-4 px-3 sm:px-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 sm:gap-3 text-foreground min-w-0 shrink-0"
            data-testid="link-home"
          >
            <Logo className="h-7 w-7 shrink-0 text-primary" />
            <div className="hidden sm:flex items-center gap-3 min-w-0">
              <span className="font-display text-base font-semibold tracking-tight leading-none">
                Cognatio
              </span>
              <span className="hidden xl:inline-block h-4 w-px bg-border" aria-hidden="true" />
              <span className="hidden xl:inline text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate leading-none">
                Walsh · Maloy · Cranwell · Dugan
              </span>
            </div>
          </Link>

          <nav className="ml-auto hidden md:flex items-center gap-0.5 lg:gap-1">
            {NAV.map(({ href, icon: Icon, label }) => {
              const active =
                href === "/"
                  ? location === "/"
                  : location === href || location.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 lg:px-3 py-1.5 text-sm font-medium hover-elevate active-elevate-2",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden xl:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto md:ml-0 gap-2 text-muted-foreground h-9 px-2 sm:px-3"
            data-testid="button-search"
          >
            <SearchIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Search or jump…</span>
            <kbd className="hidden md:inline ml-1 rounded border border-border/70 bg-muted px-1.5 text-[10px] font-mono">
              ⌘K
            </kbd>
          </Button>

          {unlocked && hasChanges && (
            <Link
              href="/changes"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover-elevate active-elevate-2"
              data-testid="badge-pending-changes"
            >
              <FileEdit className="h-3.5 w-3.5" />
              <span>{count}</span>
              <span className="hidden sm:inline">unsaved</span>
            </Link>
          )}

          {unlocked ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={lock}
              aria-label="Lock edit mode"
              data-testid="button-edit-lock"
              className="h-9 w-9 text-primary"
            >
              <Unlock className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setUnlockOpen(true)}
              aria-label="Unlock edit mode"
              data-testid="button-edit-unlock"
              className="h-9 w-9"
            >
              <Lock className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
            data-testid="button-theme"
            className="h-9 w-9"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        {unlocked && (
          <div className="border-t border-primary/20 bg-primary/5 px-3 sm:px-5 py-1.5 text-[11px] uppercase tracking-[0.16em] text-primary flex items-center gap-1.5">
            <Pencil className="h-3 w-3" />
            Edit mode — changes stay local until you download from
            <Link href="/changes" className="underline font-medium hover:opacity-80">
              Changes
            </Link>
          </div>
        )}
      </header>

      <main className="flex-1 min-w-0 overflow-x-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

      {/* Mobile bottom nav (thumb-zone, scroll-snap horizontally) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active =
              href === "/"
                ? location === "/"
                : location === href || location.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "snap-start shrink-0 basis-1/5 min-w-[20%] flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.5rem] text-[10.5px] font-medium leading-none hover-elevate active-elevate-2",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                data-testid={`nav-mobile-${label.toLowerCase()}`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background/95 to-transparent"
          aria-hidden="true"
        />
      </nav>

      <footer className="border-t mt-12 py-6 px-4 sm:px-5 pb-24 md:pb-6">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <Logo className="h-4 w-4 text-primary/70" />
            <span className="font-display font-semibold text-foreground tracking-tight">Cognatio</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span className="uppercase tracking-[0.18em]">Walsh · Maloy · Cranwell · Dugan</span>
          </div>
          <div className="text-center sm:text-right">
            Compiled from Ancestry.com GEDCOM exports · Built privately for family
          </div>
        </div>
      </footer>

      {/* Unlock overlay */}
      {unlockOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[20vh] px-4"
          onClick={() => setUnlockOpen(false)}
          data-testid="overlay-unlock"
        >
          <div
            className="w-full max-w-sm rounded-xl border bg-card shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-display text-base font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" /> Unlock Edit Mode
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Enter the family passphrase to enable inline editing.
              </p>
            </div>
            <div className="px-5 py-3">
              <Input
                ref={unlockInputRef}
                type="password"
                value={unlockDraft}
                onChange={(e) => {
                  setUnlockDraft(e.target.value);
                  setUnlockErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") tryUnlock();
                  if (e.key === "Escape") setUnlockOpen(false);
                }}
                placeholder="Passphrase"
                className="text-base"
                data-testid="input-unlock"
              />
              {unlockErr && (
                <p className="text-xs text-destructive mt-2" data-testid="text-unlock-error">
                  {unlockErr}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUnlockOpen(false)}
                data-testid="button-unlock-cancel"
              >
                Cancel
              </Button>
              <Button size="sm" onClick={tryUnlock} data-testid="button-unlock-submit">
                Unlock
              </Button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onRequestUnlock={() => setUnlockOpen(true)}
      />

      <ApiKeyDialog />
      <AIChat />
      <EditSaveBar />
    </div>
  );
}
