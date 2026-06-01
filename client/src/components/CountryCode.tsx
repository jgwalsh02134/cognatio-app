import { countryCode } from "@/lib/family";
import { cn } from "@/lib/utils";

/**
 * Displays an ISO 3166-1 alpha-2 country code as a typographic badge.
 * Used instead of emoji flags so the visual is crisp, accessible, and
 * renders identically across platforms.
 */
export function CountryCode({
  country,
  className,
}: {
  country: string;
  className?: string;
}) {
  const code = countryCode(country);
  if (!code) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 rounded-sm px-1.5 h-5 min-w-[2rem]",
        "font-mono text-[10px] font-bold tracking-[0.08em] tabular-nums leading-none",
        "bg-foreground text-background",
        "dark:bg-foreground dark:text-background",
        className
      )}
      aria-label={`Country: ${country}`}
      title={country}
      data-testid={`country-code-${code}`}
    >
      {code}
    </span>
  );
}
