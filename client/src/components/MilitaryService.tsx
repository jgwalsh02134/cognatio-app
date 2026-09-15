import armySeal from "@/assets/military/army_mark.png";
import navySeal from "@/assets/military/navy.svg";
import airForceSeal from "@/assets/military/air_force.svg";
import marineCorpsSeal from "@/assets/military/marine_corps.svg";
import coastGuardSeal from "@/assets/military/coast_guard.svg";
import foldedFlag from "@/assets/military/folded_flag.png";
import usFlag from "@/assets/military/us_flag.png";

// Army rank chevrons (modern designs — chevrons are point-up, current spec).
// We use them as illustrative insignia; period-correct WWI/WWII chevrons were
// point-down but the rank ladder is the same.
import armyPFC from "@/assets/military/army_pfc.svg";
import armySergeant from "@/assets/military/army_sergeant.svg";
import armySSgt from "@/assets/military/army_ssgt.svg";
import armySFC from "@/assets/military/army_sfc.svg";

// Medals & badges (Wikimedia, public domain)
import purpleHeart from "@/assets/military/purple_heart.svg";
import bronzeStar from "@/assets/military/bronze_star_ribbon.svg";
import silverStar from "@/assets/military/silver_star_ribbon.svg";
import wwiiVictory from "@/assets/military/wwii_victory_ribbon.svg";
import wwiVictory from "@/assets/military/wwi_victory_ribbon.svg";
import asiaticPacific from "@/assets/military/asiatic_pacific_ribbon.svg";
import eame from "@/assets/military/eame_ribbon.svg";
import koreanService from "@/assets/military/korean_service_ribbon.svg";
import goodConduct from "@/assets/military/good_conduct_ribbon.svg";
import cib from "@/assets/military/cib.svg";
import americanCampaign from "@/assets/military/american_campaign_ribbon.svg";
import americanDefense from "@/assets/military/american_defense_ribbon.svg";
import nationalDefense from "@/assets/military/national_defense_ribbon.svg";
import presidentialUnitCitation from "@/assets/military/presidential_unit_citation_army_ribbon.svg";
import philippineLiberation from "@/assets/military/philippine_liberation_ribbon.svg";
import goldStarBanner from "@/assets/military/gold_star_banner.svg";

import { Card, CardContent } from "@/components/ui/card";
import { Shield, Star, ScrollText, Award } from "lucide-react";
import { parseYear, type MilitaryService as MilitaryServiceType, type Person } from "@/lib/family";

/**
 * Whether a veteran should receive the folded-flag memorial honor. Beyond an
 * explicit death/burial record (or KIA), we presume death once the birth year
 * is 90+ years in the past — historical family veterans without a recorded
 * death date (e.g. born in 1930) should still be memorialized rather than
 * shown as living. Living veterans (no death record, born within ~90 years)
 * get the plain US flag instead.
 */
function presumedDeceased(p: Person): boolean {
  if (p.death?.date || p.burial?.date) return true;
  if (p.military?.kia) return true;
  const by = parseYear(p.birth?.date);
  return by != null && new Date().getFullYear() - by >= 90;
}

const BRANCH_META: Record<
  MilitaryServiceType["branch"],
  { label: string; seal: string | null; accent: string; ring: string }
> = {
  army: {
    label: "U.S. Army",
    seal: armySeal,
    accent: "from-amber-500/20 to-amber-500/5",
    ring: "ring-amber-500/30",
  },
  navy: {
    label: "U.S. Navy",
    seal: navySeal,
    accent: "from-sky-500/20 to-sky-500/5",
    ring: "ring-sky-500/30",
  },
  air_force: {
    label: "U.S. Air Force",
    seal: airForceSeal,
    accent: "from-indigo-500/20 to-indigo-500/5",
    ring: "ring-indigo-500/30",
  },
  marine_corps: {
    label: "U.S. Marine Corps",
    seal: marineCorpsSeal,
    accent: "from-red-500/20 to-red-500/5",
    ring: "ring-red-500/30",
  },
  coast_guard: {
    label: "U.S. Coast Guard",
    seal: coastGuardSeal,
    accent: "from-blue-500/20 to-blue-500/5",
    ring: "ring-blue-500/30",
  },
  space_force: {
    label: "U.S. Space Force",
    seal: null,
    accent: "from-slate-500/20 to-slate-500/5",
    ring: "ring-slate-500/30",
  },
  other: {
    label: "Military service",
    seal: null,
    accent: "from-stone-500/20 to-stone-500/5",
    ring: "ring-stone-500/30",
  },
};

// Map rank_code → rank insignia SVG. Extend as more rank codes are documented
// (currently Army E-3 / E-5 / E-6 / E-7).
function rankInsignia(
  branch: MilitaryServiceType["branch"],
  rank_code?: string | null,
): string | null {
  if (!rank_code) return null;
  const key = `${branch}:${rank_code}`;
  switch (key) {
    case "army:E-3":
      return armyPFC;
    case "army:E-5":
      return armySergeant;
    case "army:E-6":
      return armySSgt;
    case "army:E-7":
      return armySFC;
    default:
      return null;
  }
}

// Map award name → medal/ribbon image. Match is case-insensitive on a
// normalized form (lowercase, trimmed). Add more as documented.
const AWARD_IMAGES: Record<string, string> = {
  "purple heart": purpleHeart,
  "bronze star": bronzeStar,
  "bronze star medal": bronzeStar,
  "silver star": silverStar,
  "silver star medal": silverStar,
  "wwii victory medal": wwiiVictory,
  "world war ii victory medal": wwiiVictory,
  "victory medal (wwii)": wwiiVictory,
  "wwi victory medal": wwiVictory,
  "world war i victory medal": wwiVictory,
  "victory medal (wwi)": wwiVictory,
  "asiatic-pacific campaign medal": asiaticPacific,
  "asiatic pacific campaign medal": asiaticPacific,
  "asiatic-pacific campaign": asiaticPacific,
  "european-african-middle eastern campaign medal": eame,
  "european african middle eastern campaign medal": eame,
  "eame campaign medal": eame,
  "korean service medal": koreanService,
  "good conduct medal": goodConduct,
  "army good conduct medal": goodConduct,
  "combat infantry badge": cib,
  "combat infantryman badge": cib,
  "cib": cib,
  "american campaign medal": americanCampaign,
  "american campaign": americanCampaign,
  "american defense service medal": americanDefense,
  "american defense medal": americanDefense,
  "national defense service medal": nationalDefense,
  "national defense medal": nationalDefense,
  "army presidential unit citation": presidentialUnitCitation,
  "presidential unit citation": presidentialUnitCitation,
  "distinguished unit citation": presidentialUnitCitation,
  "philippine liberation medal": philippineLiberation,
  "philippines liberation medal": philippineLiberation,
  "philippine liberation ribbon": philippineLiberation,
};

function awardImage(name: string): string | null {
  return AWARD_IMAGES[name.trim().toLowerCase()] ?? null;
}

export function MilitaryServiceCard({ person }: { person: Person }) {
  const m = person.military;
  if (!m) return null;
  const meta = BRANCH_META[m.branch] ?? BRANCH_META.other;
  const insignia = rankInsignia(m.branch, m.rank_code);
  const deceased = presumedDeceased(person);

  return (
    <Card className="border-card-border overflow-hidden" data-testid="military-card">
      <div
        className={`bg-gradient-to-br ${meta.accent} px-4 sm:px-6 pt-4 pb-3 border-b border-card-border`}
      >
        <div className="flex items-start gap-4">
          {meta.seal && (
            <img
              src={meta.seal}
              alt={`${meta.label} seal`}
              className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 object-contain drop-shadow-sm"
              draggable={false}
              data-testid={`military-seal-${m.branch}`}
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <Shield className="h-3 w-3 text-primary" />
              Military service
            </div>
            <h2
              className="font-display text-lg sm:text-xl font-semibold mt-1 leading-tight"
              data-testid="military-branch"
            >
              {meta.label}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {m.conflict && (
                <span
                  className="rounded-full border border-card-border bg-card px-2 py-0.5 text-[11px] font-medium"
                  data-testid="military-conflict"
                >
                  {m.conflict}
                </span>
              )}
              {m.country && m.country !== "United States" && (
                <span className="rounded-full border border-card-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                  {m.country}
                </span>
              )}
              {m.kia && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 px-2 py-0.5 text-[11px] font-semibold"
                  data-testid="military-kia"
                >
                  <img src={goldStarBanner} alt="" className="h-3.5 w-auto object-contain" draggable={false} />
                  Killed in Action
                </span>
              )}
              {deceased && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-card px-2 py-0.5 text-[11px] font-medium"
                  title="In honored memory of their service"
                  data-testid="military-memoriam"
                >
                  <img src={foldedFlag} alt="Folded United States flag" className="h-4 w-auto object-contain" draggable={false} />
                  In memoriam
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-3">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {m.rank && (
            <div>
              <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Rank
              </dt>
              <dd className="flex items-center gap-2 font-medium">
                {insignia && (
                  <img
                    src={insignia}
                    alt={`${m.rank} insignia`}
                    className="h-7 w-auto object-contain"
                    draggable={false}
                    data-testid="military-insignia"
                  />
                )}
                <span data-testid="military-rank">{m.rank}</span>
              </dd>
            </div>
          )}
          {m.unit && (
            <div>
              <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Unit
              </dt>
              <dd className="font-medium" data-testid="military-unit">
                {m.unit}
              </dd>
            </div>
          )}
          {m.service_number && (
            <div>
              <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Service number
              </dt>
              <dd className="font-mono text-xs" data-testid="military-asn">
                {m.service_number}
              </dd>
            </div>
          )}
          {m.dates && (
            <div>
              <dt className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Service dates
              </dt>
              <dd data-testid="military-dates">{m.dates}</dd>
            </div>
          )}
        </dl>

        {m.awards && m.awards.length > 0 && (
          <div className="border-t border-card-border pt-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              <Award className="h-3 w-3 text-primary" /> Awards & decorations
            </div>
            <div className="flex flex-wrap gap-3 sm:gap-4">
              {m.awards.map((a, i) => {
                const img = awardImage(a);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-md border border-card-border bg-card px-2.5 py-1.5"
                    data-testid={`military-award-${a.toLowerCase().replace(/\s+/g, "-")}`}
                    title={a}
                  >
                    {img ? (
                      <img
                        src={img}
                        alt={`${a} medal`}
                        className="h-9 w-auto object-contain"
                        draggable={false}
                      />
                    ) : (
                      <Award className="h-5 w-5 text-amber-500" />
                    )}
                    <span className="text-sm font-medium">{a}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {m.notes && (
          <p
            className="text-sm text-foreground/85 leading-relaxed border-t border-card-border pt-3"
            data-testid="military-notes"
          >
            {m.notes}
          </p>
        )}

        {m.evidence && m.evidence.length > 0 && (
          <div className="border-t border-card-border pt-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              <ScrollText className="h-3 w-3" /> Sources
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {m.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Star className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact badge for use in hero/lists.
// Renders as a pill containing branch + conflict, with optional KIA marker
// and a tight cluster of award ribbon thumbnails. The whole thing wraps if
// it runs out of horizontal space so it never overflows its container.
export function MilitaryBadge({ person }: { person: Person }) {
  const m = person.military;
  if (!m) return null;
  const meta = BRANCH_META[m.branch] ?? BRANCH_META.other;
  const deceased = presumedDeceased(person);
  const awardsWithImages = (m.awards ?? [])
    .map((a) => ({ name: a, img: awardImage(a) }))
    .filter((a) => a.img);
  const MAX_RIBBONS = 3;
  const visibleAwards = awardsWithImages.slice(0, MAX_RIBBONS);
  const extraCount = awardsWithImages.length - visibleAwards.length;
  const titleText = [
    meta.label,
    m.conflict,
    m.kia ? "KIA" : null,
    ...(m.awards ?? []),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-full border border-card-border bg-card px-2.5 py-1 text-[11px] leading-tight align-middle"
      title={titleText}
      data-testid="military-badge"
    >
      <img
        src={deceased ? foldedFlag : usFlag}
        alt={deceased ? "Folded United States flag — in memoriam" : "United States flag — veteran"}
        title={deceased ? "In honored memory of their service" : "Served"}
        className="h-3.5 w-auto shrink-0 object-contain"
        draggable={false}
        data-testid={deceased ? "veteran-folded-flag" : "veteran-flag"}
      />
      <span className="inline-flex items-center gap-1.5 min-w-0">
        {meta.seal ? (
          <img
            src={meta.seal}
            alt=""
            className="h-4 w-4 shrink-0 object-contain"
            draggable={false}
          />
        ) : (
          <Shield className="h-3 w-3 shrink-0 text-primary" />
        )}
        <span className="font-medium whitespace-nowrap">
          {meta.label.replace("U.S. ", "")}
        </span>
        {m.conflict && (
          <span className="text-muted-foreground whitespace-nowrap">
            · {m.conflict}
          </span>
        )}
      </span>
      {m.kia && (
        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
          <img
            src={goldStarBanner}
            alt=""
            className="h-3 w-auto shrink-0 object-contain"
            draggable={false}
          />
          KIA
        </span>
      )}
      {visibleAwards.length > 0 && (
        <span className="inline-flex items-center gap-0.5 shrink-0">
          {visibleAwards.map((a) => (
            <img
              key={a.name}
              src={a.img as string}
              alt={a.name}
              title={a.name}
              className="h-3 w-auto shrink-0 object-contain"
              draggable={false}
            />
          ))}
          {extraCount > 0 && (
            <span className="text-[10px] text-muted-foreground font-medium ml-0.5">
              +{extraCount}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
