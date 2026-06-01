import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import type { Affiliation, Person } from "@/lib/family";

import harvardShield from "@/assets/affiliations/harvard_shield.svg";
import southernPacificLogo from "@/assets/affiliations/southern_pacific_logo.png";
import smomInsignia from "@/assets/affiliations/smom_insignia.svg";
import nysSeal from "@/assets/affiliations/nys_seal.svg";
import sienaSeal from "@/assets/affiliations/siena_seal.png";
import rpiSeal from "@/assets/affiliations/rpi_seal.png";
import cornellSeal from "@/assets/affiliations/cornell_seal.svg";
import providenceSeal from "@/assets/affiliations/providence_seal.png";
import fordhamSeal from "@/assets/affiliations/fordham_seal.png";
import usHouseSeal from "@/assets/affiliations/us_house_seal.svg";
import manhattanCollegeSeal from "@/assets/affiliations/manhattan_college_seal.svg";
import westminsterSeal from "@/assets/affiliations/westminster_seal.png";
import manhattanvilleSeal from "@/assets/affiliations/manhattanville_seal.svg";

const AFFILIATION_LOGOS: Record<string, string> = {
  harvard: harvardShield,
  harvard_university: harvardShield,
  southern_pacific: southernPacificLogo,
  southern_pacific_railroad: southernPacificLogo,
  knights_of_malta: smomInsignia,
  smom: smomInsignia,
  sovereign_military_order_of_malta: smomInsignia,
  ny_public_service_commission: nysSeal,
  nys_public_service_commission: nysSeal,
  new_york_state: nysSeal,
  nys: nysSeal,
  siena: sienaSeal,
  siena_college: sienaSeal,
  siena_university: sienaSeal,
  rpi: rpiSeal,
  rensselaer: rpiSeal,
  rensselaer_polytechnic: rpiSeal,
  rensselaer_polytechnic_institute: rpiSeal,
  cornell: cornellSeal,
  cornell_university: cornellSeal,
  providence: providenceSeal,
  providence_college: providenceSeal,
  fordham: fordhamSeal,
  fordham_university: fordhamSeal,
  us_house: usHouseSeal,
  us_house_of_representatives: usHouseSeal,
  united_states_house_of_representatives: usHouseSeal,
  house_of_representatives: usHouseSeal,
  congress: usHouseSeal,
  manhattan_college: manhattanCollegeSeal,
  manhattan_university: manhattanCollegeSeal,
  westminster: westminsterSeal,
  westminster_college: westminsterSeal,
  westminster_college_missouri: westminsterSeal,
  manhattanville: manhattanvilleSeal,
  manhattanville_college: manhattanvilleSeal,
  manhattanville_university: manhattanvilleSeal,
};

function logoFor(key: string): string | null {
  return AFFILIATION_LOGOS[key.trim().toLowerCase()] ?? null;
}

export function AffiliationsCard({ person }: { person: Person }) {
  const items = person.affiliations ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="border-card-border" data-testid="affiliations-card">
      <CardContent className="p-4 sm:p-6">
        <h2 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Affiliations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((a, i) => (
            <AffiliationRow key={`${a.key}-${i}`} affiliation={a} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AffiliationRow({ affiliation }: { affiliation: Affiliation }) {
  const logo = logoFor(affiliation.key);
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-card-border bg-card p-3"
      data-testid={`affiliation-${affiliation.key}`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-background overflow-hidden">
        {logo ? (
          <img
            src={logo}
            alt={`${affiliation.name} mark`}
            className="h-10 w-10 object-contain"
          />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight break-words">
          {affiliation.name}
        </div>
        {affiliation.role && (
          <div className="text-xs text-muted-foreground mt-0.5 break-words">
            {affiliation.role}
          </div>
        )}
        {affiliation.dates && (
          <div className="text-[11px] text-muted-foreground/85 mt-0.5">
            {affiliation.dates}
          </div>
        )}
        {affiliation.note && (
          <div className="text-[11px] text-muted-foreground/80 mt-1 leading-snug">
            {affiliation.note}
          </div>
        )}
      </div>
    </div>
  );
}
