import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEdit } from "@/components/EditContext";
import { cn } from "@/lib/utils";

/**
 * Family access screens. There is no public account database — sign up and
 * log in both unlock the existing editor with the shared family passphrase.
 * A display name is kept in session memory for notes (never persisted).
 *
 * Layout follows production auth cards (Elicit, WorkOS, Relume, Aboard):
 * centered mark, labelled fields, full-width primary action, cross-link.
 */

interface AuthPageProps {
  mode: "login" | "signup";
}

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === "signup";
  const [, setLocation] = useLocation();
  const { unlocked, unlock } = useEdit();

  const [name, setName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unlocked) setLocation("/");
  }, [unlocked, setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (isSignup && trimmedName.length < 2) {
      setError("Please enter the name you’ll appear as.");
      return;
    }
    if (isSignup && passphrase !== confirm) {
      setError("Passphrases don’t match.");
      return;
    }
    if (!passphrase.trim()) {
      setError("Enter the family passphrase.");
      return;
    }

    setBusy(true);
    const ok = await unlock(passphrase, trimmedName || null);
    setBusy(false);
    if (!ok) {
      setError(
        isSignup
          ? "This passphrase isn’t recognized. Ask a family member for access."
          : "Incorrect passphrase.",
      );
      return;
    }
    setLocation("/");
  }

  return (
    <div
      className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:py-16 fade-up"
      data-testid={isSignup ? "page-signup" : "page-login"}
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" className="mb-5" data-testid="auth-logo">
          <Logo className="h-10 w-10 text-primary" />
        </Link>
        <h1 className="font-display text-xl font-semibold tracking-tight">
          {isSignup ? "Sign up" : "Log in"}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
          {isSignup
            ? "Join with the family passphrase you were given. This is a private archive — not a public account."
            : "Welcome back. Enter the family passphrase to edit the archive."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-card-border bg-card p-5 sm:p-6 shadow-md space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="auth-name" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Your name {isSignup ? "" : <span className="normal-case tracking-normal opacity-70">(optional)</span>}
          </Label>
          <Input
            id="auth-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="How you’ll appear on notes"
            autoComplete="name"
            autoFocus={isSignup}
            className="h-10"
            data-testid="input-auth-name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="auth-pass" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Family passphrase
          </Label>
          <div className="relative">
            <Input
              id="auth-pass"
              type={showPass ? "text" : "password"}
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError(null);
              }}
              placeholder="Passphrase"
              autoComplete={isSignup ? "new-password" : "current-password"}
              autoFocus={!isSignup}
              className="h-10 pr-10"
              data-testid="input-auth-passphrase"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label={showPass ? "Hide passphrase" : "Show passphrase"}
              data-testid="button-toggle-passphrase"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {isSignup && (
          <div className="space-y-2">
            <Label htmlFor="auth-confirm" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Confirm passphrase
            </Label>
            <Input
              id="auth-confirm"
              type={showPass ? "text" : "password"}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              placeholder="Repeat passphrase"
              autoComplete="new-password"
              className="h-10"
              data-testid="input-auth-confirm"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" data-testid="text-auth-error">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full h-10"
          disabled={busy}
          data-testid="button-auth-submit"
        >
          <Lock className="h-4 w-4" />
          {busy ? "Please wait…" : isSignup ? "Create access" : "Log in"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {isSignup ? (
            <>
              Already have access?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline" data-testid="link-auth-login">
                Log in
              </Link>
            </>
          ) : (
            <>
              New to the archive?{" "}
              <Link href="/signup" className="text-primary font-medium hover:underline" data-testid="link-auth-signup">
                Sign up
              </Link>
            </>
          )}
        </p>
      </form>

      <p className={cn("mt-6 text-center text-[11px] text-muted-foreground leading-relaxed")}>
        Editing stays in this session. Reload locks the archive again.
      </p>
    </div>
  );
}
