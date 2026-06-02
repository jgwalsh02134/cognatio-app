import { cn } from "@/lib/utils";
import crest from "@/assets/brand/crest.png";

/**
 * The family crest — a transparent-background heraldic shield (oak tree, sun,
 * crescent). Rendered as an <img> with object-contain so the portrait shield
 * fits whatever square/rect box the caller sizes it to, in both themes.
 */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <img
      src={crest}
      alt="Cognatio family crest"
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
