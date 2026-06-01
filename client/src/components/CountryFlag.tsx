import { countryCode } from "@/lib/family";
import { cn } from "@/lib/utils";

import flagUS from "@/assets/flags/us.jpg";
import flagIE from "@/assets/flags/ie.jpg";
import flagDE from "@/assets/flags/de.jpg";
import flagDK from "@/assets/flags/dk.jpg";
import flagCA from "@/assets/flags/ca.png";
import flagGBENG from "@/assets/flags/gb-eng.jpg";
import flagGBSCT from "@/assets/flags/gb-sct.svg";

const FLAG_BY_CODE: Record<string, string> = {
  US: flagUS,
  IE: flagIE,
  DE: flagDE,
  DK: flagDK,
  CA: flagCA,
  "GB-ENG": flagGBENG,
  "GB-SCT": flagGBSCT,
};

const SIZE_CLASSES = {
  xs: "h-3 w-[18px]",
  sm: "h-4 w-6",
  md: "h-5 w-7",
} as const;

/**
 * Renders a country flag as a small bordered image. Resolved from a country
 * name (e.g. "United States") via the ISO 3166 mapping in family.ts.
 * Falls back to nothing if the country has no associated flag asset.
 */
export function CountryFlag({
  country,
  size = "sm",
  className,
}: {
  country: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const code = countryCode(country);
  const src = code ? FLAG_BY_CODE[code] : undefined;
  if (!src) return null;
  return (
    <img
      src={src}
      alt={`${country} flag`}
      title={country}
      data-testid={`flag-${code}`}
      className={cn(
        "shrink-0 rounded-[2px] object-cover ring-1 ring-border/60 shadow-sm",
        SIZE_CLASSES[size],
        className
      )}
      loading="lazy"
      decoding="async"
    />
  );
}
