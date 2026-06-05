import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ImagePlus,
  KeyRound,
  Loader2,
  Palette,
  RotateCcw,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAI } from "@/components/AIContext";
import { enhancePhoto, type EnhanceMode } from "@/lib/photoAI";

/** Square output resolution for the stored portrait — large enough for a crisp
 *  profile photo, small enough to live in the JSON edit overlay (~40–70 KB). */
const OUT = 384;

interface Adjust {
  brightness: number; // %
  contrast: number; // %
  saturate: number; // %
  grayscale: number; // 0..1
  sepia: number; // 0..1
}

const DEFAULT_ADJUST: Adjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
};

const PRESETS: { key: string; label: string; adjust: Adjust }[] = [
  { key: "auto", label: "Auto-enhance", adjust: { brightness: 104, contrast: 112, saturate: 112, grayscale: 0, sepia: 0 } },
  { key: "restore", label: "Restore (faded)", adjust: { brightness: 103, contrast: 126, saturate: 122, grayscale: 0, sepia: 0 } },
  { key: "bw", label: "Black & white", adjust: { brightness: 104, contrast: 116, saturate: 100, grayscale: 1, sepia: 0 } },
  { key: "sepia", label: "Sepia", adjust: { brightness: 104, contrast: 106, saturate: 100, grayscale: 0, sepia: 0.6 } },
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function filterString(a: Adjust): string {
  return `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) grayscale(${a.grayscale}) sepia(${a.sepia})`;
}

export function PhotoEditor({
  open,
  initial,
  name,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: string | null;
  name: string;
  onClose: () => void;
  onSave: (dataUri: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasImage, setHasImage] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [adjust, setAdjust] = useState<Adjust>(DEFAULT_ADJUST);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const { getAuth, aiReady, aiMode, openKeyDialog } = useAI();
  const [aiBusy, setAiBusy] = useState<EnhanceMode | null>(null);
  const [aiBefore, setAiBefore] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  function clearAi() {
    setAiBusy(null);
    setAiBefore(null);
    setAiResult(null);
    setAiError(null);
  }

  // Render the current crop + adjustments at an arbitrary square size. Pan is
  // tracked in OUT-canvas pixels, so scale it by size/OUT for other sizes.
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, size: number) => {
      const img = imgRef.current;
      ctx.clearRect(0, 0, size, size);
      if (!img) return;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      const cover = Math.max(size / natW, size / natH) * zoom;
      const w = natW * cover;
      const h = natH * cover;
      const k = size / OUT;
      const dx = clamp((size - w) / 2 + pan.x * k, size - w, 0);
      const dy = clamp((size - h) / 2 + pan.y * k, size - h, 0);
      ctx.filter = filterString(adjust);
      ctx.drawImage(img, dx, dy, w, h);
      ctx.filter = "none";
    },
    [zoom, pan, adjust],
  );

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paint(ctx, OUT);
  }, [paint]);

  /** Render the current crop to a detached canvas and return a data-URL. */
  const exportDataUrl = useCallback(
    (size: number, type = "image/jpeg", quality = 0.85): string | null => {
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const ctx = off.getContext("2d");
      if (!ctx) return null;
      paint(ctx, size);
      return off.toDataURL(type, quality);
    },
    [paint],
  );

  useEffect(() => {
    draw();
  }, [draw]);

  // Load an existing portrait when re-editing.
  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setAdjust(DEFAULT_ADJUST);
    clearAi();
    if (initial) {
      loadSrc(initial);
    } else {
      imgRef.current = null;
      setHasImage(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function loadSrc(src: string) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setHasImage(true);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      draw();
    };
    img.src = src;
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    clearAi();
    setAdjust(DEFAULT_ADJUST);
    const reader = new FileReader();
    reader.onload = () => loadSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function runEnhance(mode: EnhanceMode) {
    const auth = getAuth();
    if (!auth) {
      openKeyDialog();
      return;
    }
    const before = exportDataUrl(OUT, "image/jpeg", 0.92);
    const input = exportDataUrl(1024, "image/png", 1);
    if (!before || !input) return;
    setAiError(null);
    setAiResult(null);
    setAiBefore(before);
    setAiBusy(mode);
    try {
      const out = await enhancePhoto({ auth, dataUrl: input, mode });
      setAiResult(out);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Enhancement failed.");
    } finally {
      setAiBusy(null);
    }
  }

  function acceptAi() {
    if (aiResult) {
      // The enhanced image becomes the working image; the crop resets so the
      // family can re-position before saving. The ORIGINAL upload is gone from
      // the editor, but nothing is persisted until they press Save.
      loadSrc(aiResult);
      setAdjust(DEFAULT_ADJUST);
    }
    setAiResult(null);
    setAiBefore(null);
  }

  function ratio(): number {
    const c = canvasRef.current;
    if (!c) return 1;
    const rect = c.getBoundingClientRect();
    return rect.width ? OUT / rect.width : 1;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!hasImage) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const r = ratio();
    setPan((p) => ({
      x: p.x + (e.clientX - drag.current!.x) * r,
      y: p.y + (e.clientY - drag.current!.y) * r,
    }));
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    drag.current = null;
  }

  function save() {
    if (!hasImage) return;
    const url = exportDataUrl(OUT, "image/jpeg", 0.85);
    if (url) onSave(url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Profile photo — {name}</DialogTitle>
          <DialogDescription className="text-xs">
            Upload a photo, drag to position and zoom, then touch up or restore an
            older photo. It's cropped to a circle for the profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* AI before/after review — mandatory, identity-safety gate */}
          {aiResult && aiBefore && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Compare carefully
              </div>
              <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                Look closely at {name}'s face. If the likeness looks even slightly
                different, keep the original — we never want to change how a
                relative truly looked.
              </p>
              <div className="flex items-start justify-center gap-4">
                <figure className="text-center">
                  <img
                    src={aiBefore}
                    alt="Original"
                    className="h-28 w-28 rounded-full object-cover border border-border"
                  />
                  <figcaption className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Original
                  </figcaption>
                </figure>
                <figure className="text-center">
                  <img
                    src={aiResult}
                    alt="AI version"
                    className="h-28 w-28 rounded-full object-cover border border-primary/50"
                  />
                  <figcaption className="mt-1 text-[10px] uppercase tracking-wider text-primary">
                    AI version
                  </figcaption>
                </figure>
              </div>
              <div className="mt-3 flex justify-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAiResult(null);
                    setAiBefore(null);
                  }}
                  data-testid="photo-ai-discard"
                >
                  <X className="h-4 w-4 mr-1" /> Keep original
                </Button>
                <Button type="button" size="sm" onClick={acceptAi} data-testid="photo-ai-accept">
                  <Check className="h-4 w-4 mr-1" /> Use AI version
                </Button>
              </div>
            </div>
          )}

          {/* Canvas / dropzone */}
          <div className="flex justify-center">
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={OUT}
                height={OUT}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className={cn(
                  "h-64 w-64 rounded-full border border-border bg-muted touch-none",
                  hasImage ? "cursor-grab active:cursor-grabbing" : "opacity-0",
                )}
              />
              {!hasImage && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-full border border-dashed border-border bg-muted/40 text-sm text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="photo-dropzone"
                >
                  <ImagePlus className="h-7 w-7" />
                  Choose a photo
                </button>
              )}
              {/* circular crop guide */}
              {hasImage && (
                <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary/40" />
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFile}
            className="hidden"
            data-testid="photo-file-input"
          />

          {hasImage && (
            <>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" /> Replace
                </Button>
                <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="flex-1 accent-primary"
                    data-testid="photo-zoom"
                  />
                </label>
              </div>

              {/* Touch-up presets */}
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground mr-1">
                  <Wand2 className="h-3 w-3" /> Touch up
                </span>
                {PRESETS.map((pr) => (
                  <button
                    key={pr.key}
                    type="button"
                    onClick={() => setAdjust(pr.adjust)}
                    className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-2.5 py-1 min-h-8 text-[11px] hover-elevate active-elevate-2"
                    data-testid={`photo-preset-${pr.key}`}
                  >
                    {pr.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAdjust(DEFAULT_ADJUST)}
                  className="inline-flex items-center gap-1 rounded-full border border-card-border bg-background px-2.5 py-1 min-h-8 text-[11px] text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="photo-preset-reset"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              </div>

              {/* Fine adjustments */}
              <div className="space-y-1.5">
                <Slider label="Brightness" min={50} max={150} value={adjust.brightness} onChange={(v) => setAdjust((a) => ({ ...a, brightness: v }))} />
                <Slider label="Contrast" min={50} max={150} value={adjust.contrast} onChange={(v) => setAdjust((a) => ({ ...a, contrast: v }))} />
                <Slider label="Saturation" min={0} max={200} value={adjust.saturate} onChange={(v) => setAdjust((a) => ({ ...a, saturate: v }))} />
              </div>

              {/* AI restore & colorize (OpenAI, identity-locked) */}
              <div className="rounded-md border border-card-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
                  <Sparkles className="h-3 w-3 text-primary" /> AI restore &amp; colorize
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {aiReady ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={!!aiBusy}
                        onClick={() => runEnhance("restore")}
                        data-testid="photo-ai-restore"
                      >
                        {aiBusy === "restore" ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        Restore
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={!!aiBusy}
                        onClick={() => runEnhance("colorize")}
                        data-testid="photo-ai-colorize"
                      >
                        {aiBusy === "colorize" ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Palette className="h-3.5 w-3.5 mr-1" />
                        )}
                        Restore + colorize
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={openKeyDialog}
                      data-testid="photo-ai-connect"
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-1" />
                      {aiMode === "proxy" ? "Enter passphrase for AI" : "Connect OpenAI for AI"}
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  AI can subtly alter a face. You'll review before/after and must
                  approve it — the original is never changed automatically.
                </p>
                {aiBusy && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Working… this can take 10–30 seconds.
                  </p>
                )}
                {aiError && (
                  <p className="mt-1 text-[11px] text-destructive break-words">{aiError}</p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="photo-cancel">
            Cancel
          </Button>
          <Button onClick={save} disabled={!hasImage} data-testid="photo-save">
            <Sparkles className="h-4 w-4 mr-1" /> Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-1 accent-primary"
      />
      <span className="w-9 shrink-0 text-right tabular-nums">{value}</span>
    </label>
  );
}
