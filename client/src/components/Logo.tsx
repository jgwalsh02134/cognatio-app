import { cn } from "@/lib/utils";
import crest from "@/assets/brand/crest.png";

/**
 * The family crest — a transparent-background tree-in-shield mark. It's a solid
 * black mark, so `dark:invert` flips it to white in dark mode to stay legible
 * on the dark header/footer. Rendered as an <img> with object-contain so it
 * fits whatever box the caller sizes it to.
 */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <img
      src={crest}
      alt="Cognatio family crest"
      className={cn("object-contain dark:invert", className)}
      draggable={false}
    />
  );
}
