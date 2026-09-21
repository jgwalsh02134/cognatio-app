import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const MIN_PASSWORD = 8;

/**
 * Login / Create account dialog. Any signed-in user can view, edit, save, and
 * use AI — there are no roles. Signup is open to anyone.
 *
 * Auth relies on an httpOnly session cookie set by the server. Inside a
 * cookie-blocked sandbox the request simply won't persist a session; the dialog
 * still renders and never throws.
 */
export function AuthDialog() {
  const { authDialogOpen, closeAuthDialog, login, register, user } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset to a consistent state whenever the dialog opens (default to the Log in
  // tab); close automatically once signed in. Resetting the tab here prevents a
  // stale last-used tab from desyncing the highlighted trigger and the form.
  useEffect(() => {
    if (authDialogOpen) {
      setTab("login");
      setError(null);
      setPassword("");
      setShowPassword(false);
      setSubmitting(false);
    }
  }, [authDialogOpen]);

  useEffect(() => {
    if (user && authDialogOpen) closeAuthDialog();
  }, [user, authDialogOpen, closeAuthDialog]);

  async function submit() {
    const u = username.trim();
    const p = password;
    if (!u || !p || submitting) return;
    setSubmitting(true);
    setError(null);
    const res =
      tab === "login" ? await login(u, p) : await register(u, p);
    setSubmitting(false);
    if (res.ok) {
      setUsername("");
      setPassword("");
      closeAuthDialog();
    } else {
      setError(res.error ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <Dialog open={authDialogOpen} onOpenChange={(o) => { if (!o) closeAuthDialog(); }}>
      <DialogContent className="sm:max-w-md" data-testid="auth-dialog">
        <DialogHeader className="items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border bg-muted/40">
            <Logo className="h-6 w-6 text-primary" />
          </span>
          <DialogTitle className="text-base font-display">
            Sign in to Cognatio
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            The family archive is open to browse — sign in to contribute.
          </p>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "login" | "register");
            setError(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" data-testid="tab-login">
              Log in
            </TabsTrigger>
            <TabsTrigger value="register" data-testid="tab-register">
              Create account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Log in to edit the archive, save changes, and use the AI research
              tools. Viewing is open to everyone.
            </p>
          </TabsContent>
          <TabsContent value="register" className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Create a free account — anyone can sign up. Signed-in members can
              edit, save, and use the AI tools.
            </p>
          </TabsContent>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label
                htmlFor="auth-username"
                className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Username
              </Label>
              <Input
                id="auth-username"
                autoFocus
                autoComplete="username"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="your-username"
                data-testid="input-username"
              />
              {tab === "register" && (
                <p className="text-[11px] text-muted-foreground">
                  3–40 characters: letters, numbers, and _ . -
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="auth-password"
                className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Password
              </Label>
              <div className="relative">
                <Input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  placeholder="••••••••"
                  className="pr-10"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {tab === "register" && (
                <p
                  className={cn(
                    "flex items-center gap-1 text-[11px]",
                    password.length >= MIN_PASSWORD
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                  data-testid="hint-password-length"
                >
                  <Check
                    className={cn(
                      "h-3 w-3 shrink-0 transition-opacity",
                      password.length >= MIN_PASSWORD ? "opacity-100" : "opacity-30",
                    )}
                  />
                  At least {MIN_PASSWORD} characters.
                </p>
              )}
            </div>

            {error && (
              <p
                className="text-xs text-destructive break-words"
                data-testid="auth-error"
              >
                {error}
              </p>
            )}

            <Button
              className="w-full"
              onClick={submit}
              disabled={submitting || !username.trim() || !password}
              data-testid={tab === "login" ? "button-login" : "button-register"}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  {tab === "login" ? "Logging in…" : "Creating account…"}
                </>
              ) : tab === "login" ? (
                <>
                  <LogIn className="h-4 w-4 mr-1.5" /> Log in
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1.5" /> Create account
                </>
              )}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
