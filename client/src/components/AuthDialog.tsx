import { useEffect, useState } from "react";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/components/AuthContext";
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
        <DialogHeader>
          <DialogTitle className="text-base font-display">
            Sign in to Cognatio
          </DialogTitle>
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
              <Input
                id="auth-password"
                type="password"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="••••••••"
                data-testid="input-password"
              />
              {tab === "register" && (
                <p className="text-[11px] text-muted-foreground">
                  At least 8 characters.
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
