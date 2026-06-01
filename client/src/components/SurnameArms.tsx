import maloyArms from "@/assets/arms/maloy.png";
import walshArms from "@/assets/arms/walsh.png";
import duganArms from "@/assets/arms/dugan.png";
import cranwellArms from "@/assets/arms/cranwell.png";
import riordanArms from "@/assets/arms/riordan.png";
import flavinArms from "@/assets/arms/flavin.png";
import crummeyArms from "@/assets/arms/crummey.png";
import reillyArms from "@/assets/arms/reilly.png";
import gaynorArms from "@/assets/arms/gaynor.png";
import galbraithArms from "@/assets/arms/galbraith.png";
import fadenArms from "@/assets/arms/faden.png";
import keoughArms from "@/assets/arms/keough.png";
import kesslerArms from "@/assets/arms/kessler.png";
import quandtArms from "@/assets/arms/quandt.png";
import leahyArms from "@/assets/arms/leahy.png";
import maierArms from "@/assets/arms/maier.png";
import caldwellArms from "@/assets/arms/caldwell.png";

// Map of surname → coat of arms image.
// Match is case-insensitive on the surname itself; family-name strings may
// include particles ("O'Reilly", etc.) so we strip common prefixes before lookup.
const ARMS_MAP: Record<string, string> = {
  maloy: maloyArms,
  malloy: maloyArms,
  walsh: walshArms,
  walshe: walshArms,
  welsh: walshArms,
  dugan: duganArms,
  duggan: duganArms,
  cranwell: cranwellArms,
  riordan: riordanArms,
  reardon: riordanArms,
  "o'riordan": riordanArms,
  flavin: flavinArms,
  flavin_: flavinArms,
  crummey: crummeyArms,
  crummy: crummeyArms,
  crummie: crummeyArms,
  reilly: reillyArms,
  riley: reillyArms,
  "o'reilly": reillyArms,
  gaynor: gaynorArms,
  gainor: gaynorArms,
  gainer: gaynorArms,
  galbraith: galbraithArms,
  galbreath: galbraithArms,
  faden: fadenArms,
  fadden: fadenArms,
  keough: keoughArms,
  keogh: keoughArms,
  kehoe: keoughArms,
  keoghoe: keoughArms,
  kessler: kesslerArms,
  kesler: kesslerArms,
  kässler: kesslerArms,
  quandt: quandtArms,
  quant: quandtArms,
  leahy: leahyArms,
  lahey: leahyArms,
  leehy: leahyArms,
  "o'leahy": leahyArms,
  maier: maierArms,
  mayer: maierArms,
  meyer: maierArms,
  meier: maierArms,
  mayr: maierArms,
  caldwell: caldwellArms,
  cauldwell: caldwellArms,
  coldwell: caldwellArms,
  caudill: caldwellArms,
};

export const ARMS_SURNAMES: { surname: string; src: string }[] = [
  { surname: "Maloy", src: maloyArms },
  { surname: "Walsh", src: walshArms },
  { surname: "Dugan", src: duganArms },
  { surname: "Cranwell", src: cranwellArms },
  { surname: "Riordan", src: riordanArms },
  { surname: "Flavin", src: flavinArms },
  { surname: "Crummey", src: crummeyArms },
  { surname: "Reilly", src: reillyArms },
  { surname: "Gaynor", src: gaynorArms },
  { surname: "Galbraith", src: galbraithArms },
  { surname: "Faden", src: fadenArms },
  { surname: "Keough", src: keoughArms },
  { surname: "Kessler", src: kesslerArms },
  { surname: "Quandt", src: quandtArms },
  { surname: "Leahy", src: leahyArms },
  { surname: "Maier", src: maierArms },
  { surname: "Caldwell", src: caldwellArms },
];

export function getArmsForSurname(surname: string | null | undefined): string | null {
  if (!surname) return null;
  const key = surname.trim().toLowerCase();
  if (ARMS_MAP[key]) return ARMS_MAP[key];
  // strip leading "o'" or "mc" or "mac"
  const stripped = key.replace(/^o['’]?|^mc|^mac/, "");
  if (stripped && ARMS_MAP[stripped]) return ARMS_MAP[stripped];
  return null;
}

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<Size, string> = {
  xs: "h-5 w-auto",
  sm: "h-7 w-auto",
  md: "h-10 w-auto",
  lg: "h-16 w-auto",
  xl: "h-24 w-auto",
};

export function SurnameArms({
  surname,
  size = "md",
  className = "",
  title,
}: {
  surname: string | null | undefined;
  size?: Size;
  className?: string;
  title?: string;
}) {
  const src = getArmsForSurname(surname);
  if (!src) return null;
  const altSurname = surname || "family";
  return (
    <img
      src={src}
      alt={`${altSurname} coat of arms`}
      title={title ?? `${altSurname} coat of arms`}
      className={`${SIZE_CLASS[size]} shrink-0 object-contain select-none drop-shadow-sm ${className}`}
      draggable={false}
      data-testid={`arms-${altSurname.toLowerCase()}`}
    />
  );
}
