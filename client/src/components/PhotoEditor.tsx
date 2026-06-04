import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw, Sparkles, Upload, Wand2 } from "lucide-react";
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, OUT, OUT);
    if (!img) return;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const cover = Math.max(OUT / natW, OUT / natH) * zoom;
    const w = natW * cover;
    const h = natH * cover;
    const dx = clamp((OUT - w) / 2 + pan.x, OUT - w, 0);
    const dy = clamp((OUT - h) / 2 + pan.y, OUT - h, 0);
    ctx.filter = filterString(adjust);
    ctx.drawImage(img, dx, dy, w, h);
    ctx.filter = "none";
  }, [zoom, pan, adjust]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Load an existing portrait when re-editing.
  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setAdjust(DEFAULT_ADJUST);
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
    const reader = new FileReader();
    reader.onload = () => loadSrc(reader.result as string);
    reader.readAsDataURL(file);
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
    const canvas = canvasRef.current;
    if (!canvas || !hasImage) return;
    draw();
    onSave(canvas.toDataURL("image/jpeg", 0.85));
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
