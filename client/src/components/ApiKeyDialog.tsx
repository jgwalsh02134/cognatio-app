import { useState } from "react";
import { Bot, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { useAI } from "@/components/AIContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Modal for entering an OpenAI API key. Lives only in React state (the key
 * is never stored to localStorage/cookies — sandbox blocks them anyway, and
 * not persisting is the safer default for a personal-use key).
 */
export function ApiKeyDialog() {
  const { apiKey, setApiKey, keyDialogOpen, closeKeyDialog } = useAI();
  const [draft, setDraft] = useState("");

  function onSave() {
    if (!draft.trim()) return;
    setApiKey(draft.trim());
    setDraft("");
    closeKeyDialog();
  }

  function onClear() {
    setApiKey(null);
    setDraft("");
  }

  return (
    <Dialog open={keyDialogOpen} onOpenChange={(o) => { if (!o) closeKeyDialog(); }}>
      <DialogContent className="sm:max-w-md" data-testid="api-key-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" />
            Connect OpenAI for AI research &amp; chat
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            Paste an OpenAI API key to enable per-person web research and the
            archive chat. The key is held only in this browser tab and is
            cleared when you refresh or close it — it's never sent anywhere
            except OpenAI.
          </p>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              OpenAI API key
            </label>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
              data-testid="api-key-input"
            />
          </div>
          {apiKey && (
            <div className="flex items-center justify-between rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Key set for this session
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
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Get a key at platform.openai.com
            </a>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeKeyDialog} data-testid="api-key-cancel">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!draft.trim()} data-testid="api-key-save">
            Save for this session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
