import { useState } from "react";
import { Bot, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { useAI } from "@/components/AIContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Modal for unlocking AI. In proxy mode (server holds the OpenAI key) it asks
 * for the shared access passphrase; in direct mode it asks for the user's own
 * OpenAI key. By default the secret lives only in React state (cleared on
 * refresh) — the safest posture, and the only one that works inside the
 * sandboxed iframe build. When "Remember on this device" is checked it is also
 * persisted via crash-safe storage so a standalone deployment doesn't prompt
 * on every reload.
 */
export function ApiKeyDialog() {
  const { aiMode, secret, setSecret, rememberSecret, keyDialogOpen, closeKeyDialog } = useAI();
  const [draft, setDraft] = useState("");
  const [remember, setRemember] = useState(rememberSecret);

  const proxy = aiMode === "proxy";

  function onSave() {
    if (!draft.trim()) return;
    setSecret(draft.trim(), remember);
    setDraft("");
    closeKeyDialog();
  }

  function onClear() {
    setSecret(null, false);
    setDraft("");
    setRemember(false);
  }

  return (
    <Dialog open={keyDialogOpen} onOpenChange={(o) => { if (!o) closeKeyDialog(); }}>
      <DialogContent className="sm:max-w-md" data-testid="api-key-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            {proxy ? "Unlock AI research \u0026 chat" : "Connect OpenAI for AI research \u0026 chat"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            {proxy ? (
              <>
                Enter the family access passphrase to enable per-person web
                research and the archive chat. The OpenAI key stays on the
                server — you never need your own. By default the passphrase is
                held only in this browser tab and cleared on refresh — tick the
                box below to keep it on this device instead.
              </>
            ) : (
              <>
                Paste an OpenAI API key to enable per-person web research and the
                archive chat. It's never sent anywhere except OpenAI. By default
                the key is held only in this browser tab and cleared on refresh —
                tick the box below to keep it on this device instead.
              </>
            )}
          </p>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              {proxy ? "Access passphrase" : "OpenAI API key"}
            </label>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={proxy ? "Family passphrase" : "sk-..."}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
              data-testid="api-key-input"
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <Checkbox
              checked={remember}
              onCheckedChange={(c) => setRemember(c === true)}
              className="mt-0.5"
              data-testid="api-key-remember"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              Remember on this device
              <span className="block text-[11px] opacity-80">
                Stores the key in this browser so you don't re-enter it. Use only
                on a private, trusted device.
              </span>
            </span>
          </label>
          {secret && (
            <div className="flex items-center justify-between rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {rememberSecret
                  ? `${proxy ? "Passphrase" : "Key"} saved on this device`
                  : `${proxy ? "Passphrase" : "Key"} set for this session`}
              </span>
              <button
                onClick={onClear}
                className="text-muted-foreground hover:text-foreground underline"
                data-testid="api-key-clear"
              >
                Clear
              </button>
            </div>
          )}
          <div className="rounded-md bg-muted/40 border border-card-border px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
            <div className="flex items-start gap-1.5">
              <Bot className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
              <div>
                Uses the OpenAI Responses API with the built-in web_search
                tool — model{" "}
                <code className="font-mono text-[10px] bg-background px-1 rounded">
                  gpt-5.4-mini
                </code>
                . Typical cost per person research is a few cents.
              </div>
            </div>
            {!proxy && (
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Get a key at platform.openai.com
              </a>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeKeyDialog} data-testid="api-key-cancel">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!draft.trim()} data-testid="api-key-save">
            {remember ? "Save on this device" : "Save for this session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
