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
  Combine,
  Map as MapIcon,
  Lock,
  Unlock,
  Pencil,
  FileEdit,
  LayoutGrid,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEdit } from "./EditContext";
import { useToast } from "@/hooks/use-toast";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { AIChat } from "./AIChat";
import { EditSaveBar } from "./EditSaveBar";
import { CommandPalette } from "./CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Curated primary destinations — shown directly in the header and as the
// mobile bottom tabs. Everything else lives under "More" (grouped), keeping the
// bar uncluttered at every breakpoint. The ⌘K palette covers jump-to-anything.
const PRIMARY: NavItem[] = [
  { href: "/", icon: HomeIcon, label: "Home" },
  { href: "/people", icon: Users, label: "People" },
  { href: "/tree", icon: GitBranch, label: "Tree" },
  { href: "/timeline", icon: Clock, label: "Timeline" },
];

const GROUPS: NavGroup[] = [
  {
    title: "Explore",
    items: [
      { href: "/surnames", icon: ScrollText, label: "Surnames" },
      { href: "/places", icon: MapPin, label: "Places" },
      { href: "/map", icon: MapIcon, label: "Map" },
      { href: "/roots", icon: Crown, label: "Roots" },
      { href: "/insights", icon: BarChart3, label: "Insights" },
    ],
  },
  {
    title: "Research",
    items: [
      { href: "/research", icon: Compass, label: "Research" },
      { href: "/relate", icon: GitMerge, label: "Relate" },
      { href: "/finder", icon: Telescope, label: "Finder" },
      { href: "/gaps", icon: Sparkles, label: "Gaps" },
      { href: "/anomalies", icon: ShieldAlert, label: "Anomalies" },
      { href: "/duplicates", icon: Combine, label: "Duplicates" },
    ],
  },
  {
    title: "Data",
    items: [{ href: "/export", icon: Download, label: "Export" }],
  },
];

const MORE_ITEMS: NavItem[] = GROUPS.flatMap((g) => g.items);

function isActivePath(location: string, href: string): boolean {
  return href === "/"
    ? location === "/"
    : location === href || location.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isTreePage = location === "/tree";
  const { theme, toggle } = useTheme();
  const { unlocked, unlock, lock, count, hasChanges, archiveEnabled, commitToArchive } = useEdit();
  const { toast } = useToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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

  // ⌘S / Ctrl+S saves pending edits straight to the archive (server mode only).
  // We only intercept the browser's Save dialog when there is actually
  // something to persist, so the shortcut stays unsurprising otherwise.
  useEffect(() => {
    async function onSaveKey(e: KeyboardEvent) {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s")) return;
      if (!(unlocked && hasChanges && archiveEnabled)) return;
      e.preventDefault();
      const n = count;
      const res = await commitToArchive();
      if (res.ok) {
        toast({
          title: "Saved to the archive",
          description: `${n} ${n === 1 ? "edit is" : "edits are"} now live — no reload needed.`,
        });
      } else {
        toast({
          title: "Save failed",
          description: res.error ?? "Could not reach the server.",
          variant: "destructive",
        });
      }
    }
    window.addEventListener("keydown", onSaveKey);
    return () => window.removeEventListener("keydown", onSaveKey);
  }, [unlocked, hasChanges, archiveEnabled, count, commitToArchive, toast]);

  // Close the mobile "More" sheet after navigating.
  useEffect(() => {
    setMoreOpen(false);
  }, [location]);

  const moreActive = MORE_ITEMS.some((item) => isActivePath(location, item.href));

  // When the floating EditSaveBar is showing, reserve extra space at the bottom
  // so the last of the page content isn't hidden behind it (mobile especially).
  const editBarVisible = unlocked && hasChanges && location !== "/changes";

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
            {PRIMARY.map(({ href, icon: Icon, label }) => {
              const active = isActivePath(location, href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 lg:px-3 py-1.5 text-sm font-medium hover-elevate active-elevate-2",
                    active ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="More"
                  aria-label="More sections"
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 lg:px-3 py-1.5 text-sm font-medium hover-elevate active-elevate-2",
                    moreActive ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                  data-testid="nav-more"
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">More</span>
                  <ChevronDown className="hidden lg:inline h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {GROUPS.map((group, gi) => (
                  <div key={group.title}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {group.title}
                    </DropdownMenuLabel>
                    {group.items.map(({ href, icon: Icon, label }) => {
                      const active = isActivePath(location, href);
                      return (
                        <DropdownMenuItem key={href} asChild>
                          <Link
                            href={href}
                            className={cn(
                              "flex items-center gap-2.5 cursor-pointer",
                              active && "bg-muted text-foreground font-medium",
                            )}
                            data-testid={`nav-more-${label.toLowerCase()}`}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            {label}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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

      <main
        className={cn(
          // Page roots use `mx-auto`, and auto margins on a flex item disable
          // align-items:stretch — so the item sized to its content (max-content),
          // pushing the page wider than the phone viewport and clipping the right
          // edge. Forcing w-full pins each page root to the container width while
          // its own max-w-* still caps the line length on desktop.
          "flex-1 min-w-0 min-h-0 overflow-x-hidden flex flex-col [&>*]:w-full [&>*]:min-w-0",
          editBarVisible
            ? "pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:pb-24"
            : "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0",
        )}
      >
        {children}
      </main>

      {/* Mobile bottom nav: 4 primary tabs + a "More" tab opening a grouped sheet.
          Five equal thumb-zone targets — no horizontal scrolling. */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="flex">
          {PRIMARY.map(({ href, icon: Icon, label }) => {
            const active = isActivePath(location, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "basis-1/5 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.5rem] text-[10.5px] font-medium leading-none hover-elevate active-elevate-2",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                data-testid={`nav-mobile-${label.toLowerCase()}`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More sections"
            aria-expanded={moreOpen}
            className={cn(
              "basis-1/5 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.5rem] text-[10.5px] font-medium leading-none hover-elevate active-elevate-2",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
            data-testid="nav-mobile-more"
          >
            <LayoutGrid className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {/* Mobile "More" sheet — all secondary destinations, grouped. */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-2xl max-h-[80dvh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          data-testid="sheet-more"
        >
          <SheetHeader className="mb-3 text-left">
            <SheetTitle className="font-display text-base">Browse</SheetTitle>
          </SheetHeader>
          <div className="space-y-5">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map(({ href, icon: Icon, label }) => {
                    const active = isActivePath(location, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm hover-elevate active-elevate-2",
                          active
                            ? "border-primary/40 bg-primary/5 text-foreground font-medium"
                            : "border-card-border text-muted-foreground",
                        )}
                        data-testid={`nav-sheet-${label.toLowerCase()}`}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <footer className={cn("border-t py-6 px-4 sm:px-5 pb-24 md:pb-6", isTreePage ? "hidden" : "mt-12")}>
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
