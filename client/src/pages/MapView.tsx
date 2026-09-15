import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { Map as MapIcon, Ship, MapPin, Anchor, ArrowRight } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { cn } from "@/lib/utils";
import {
  buildImmigrationPaths,
  buildPlaceMarkers,
  type LatLng,
  type PersonRef,
} from "@/lib/geo";

/** Scrollable list of people, each linking to their profile. Uses plain hash
 *  anchors because wouter <Link> does not fire inside a Leaflet popup (the
 *  popup is rendered in a detached DOM layer). */
function PeopleLinks({ refs }: { refs: PersonRef[] }) {
  if (refs.length === 0) return null;
  return (
    <ul className="my-1.5 max-h-44 overflow-y-auto space-y-0.5 pr-1">
      {refs.map((r) => (
        <li key={r.id}>
          <a
            href={`#/person/${encodeURIComponent(r.id)}`}
            className="flex items-center justify-between gap-2 rounded px-1.5 py-1 no-underline hover:bg-black/5"
          >
            <span className="font-medium text-primary truncate">{r.name}</span>
            {r.years && (
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {r.years}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

const ORIGIN_COLOR = "#f59e0b"; // amber — countries of origin (non-US)
const SETTLE_COLOR = "#2563eb"; // blue — US settlement
const PATH_COLOR = "#e11d48"; // rose — immigration journeys

function MapController({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    const apply = () => {
      // invalidateSize fixes the common mobile/responsive bug where Leaflet
      // measures the container before it has its final size and renders grey
      // gaps / only part of the map.
      map.invalidateSize();
      if (points.length) {
        map.fitBounds(L.latLngBounds(points.map((p) => L.latLng(p[0], p[1]))), {
          padding: [28, 28],
          maxZoom: 9,
        });
      }
    };
    const t1 = window.setTimeout(apply, 80);
    const t2 = window.setTimeout(() => map.invalidateSize(), 400);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [map, points]);
  return null;
}

export default function MapView() {
  const markers = useMemo(() => buildPlaceMarkers(), []);
  const paths = useMemo(() => buildImmigrationPaths(), []);

  const [showOrigins, setShowOrigins] = useState(true);
  const [showSettlements, setShowSettlements] = useState(true);
  const [showPaths, setShowPaths] = useState(true);

  const originCount = markers.filter((m) => m.isOrigin).length;
  const settleCount = markers.length - originCount;
  const immigrants = paths.reduce((n, p) => n + p.count, 0);

  const allPoints = useMemo<LatLng[]>(
    () => [
      ...markers.map((m) => [m.lat, m.lng] as LatLng),
      ...paths.flatMap((p) => [p.from, p.to]),
    ],
    [markers, paths],
  );

  const maxCount = Math.max(1, ...markers.map((m) => m.count));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-5 py-5 sm:py-8">
      <PageHero
        eyebrow="Geography"
        title="Origins, immigration & settlement"
        description="Where the family came from and where they put down roots — countries of origin abroad, the journeys across the Atlantic, and the towns around Troy and Albany where they settled. Mapped on OpenStreetMap."
        icon={MapIcon}
        stats={[
          { label: "Places", value: markers.length },
          { label: "Origin places", value: originCount, tone: "warn" },
          { label: "Immigrants mapped", value: immigrants, tone: "primary" },
        ]}
      />

      {/* Layer toggles */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToggleChip
          active={showSettlements}
          onClick={() => setShowSettlements((v) => !v)}
          color={SETTLE_COLOR}
          icon={<MapPin className="h-3.5 w-3.5" />}
          label={`Settlements (${settleCount})`}
        />
        <ToggleChip
          active={showOrigins}
          onClick={() => setShowOrigins((v) => !v)}
          color={ORIGIN_COLOR}
          icon={<Anchor className="h-3.5 w-3.5" />}
          label={`Origins (${originCount})`}
        />
        <ToggleChip
          active={showPaths}
          onClick={() => setShowPaths((v) => !v)}
          color={PATH_COLOR}
          icon={<Ship className="h-3.5 w-3.5" />}
          label={`Immigration paths (${paths.length})`}
        />
      </div>

      <div className="relative z-0 h-[58vh] sm:h-[70vh] overflow-hidden rounded-lg border border-card-border">
        <MapContainer
          center={[45, -40]}
          zoom={3}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: "#aadaff" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController points={allPoints} />

          {/* Immigration journeys (drawn under the markers) */}
          {showPaths &&
            paths.map((p, i) => (
              <Polyline
                key={`path-${i}`}
                positions={[p.from, p.to]}
                pathOptions={{
                  color: PATH_COLOR,
                  weight: Math.min(8, 1.5 + p.count / 2),
                  opacity: 0.55,
                }}
              >
                <Popup maxWidth={280} minWidth={210}>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[13px]">
                      <span>{p.fromCountry}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span>{p.toPlace.split(",")[0]}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {p.fromPlace.split(",").slice(0, 2).join(", ")} →{" "}
                      {p.toPlace.split(",").slice(0, 2).join(", ")}
                    </div>
                    <div className="mt-1 font-medium">
                      {p.count} {p.count === 1 ? "person made" : "people made"} this
                      crossing
                    </div>
                    <PeopleLinks refs={p.sample} />
                    {p.count > p.sample.length && (
                      <div className="text-[11px] text-muted-foreground">
                        + {p.count - p.sample.length} more
                      </div>
                    )}
                  </div>
                </Popup>
              </Polyline>
            ))}

          {/* Place markers */}
          {markers
            .filter((m) => (m.isOrigin ? showOrigins : showSettlements))
            .map((m) => (
              <CircleMarker
                key={m.place}
                center={[m.lat, m.lng]}
                radius={Math.max(7, Math.min(24, 5 + Math.sqrt(m.count / maxCount) * 20))}
                pathOptions={{
                  color: m.isOrigin ? ORIGIN_COLOR : SETTLE_COLOR,
                  fillColor: m.isOrigin ? ORIGIN_COLOR : SETTLE_COLOR,
                  fillOpacity: 0.5,
                  weight: 1.5,
                }}
              >
                <Tooltip direction="top" offset={[0, -2]} opacity={1}>
                  <span className="font-medium">{m.place.split(",")[0]}</span>
                  {" · "}
                  {m.count}
                </Tooltip>
                <Popup maxWidth={280} minWidth={210}>
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[13px]">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: m.isOrigin ? ORIGIN_COLOR : SETTLE_COLOR }}
                      />
                      {m.place.split(",")[0]}
                    </div>
                    <div className="text-muted-foreground">{m.place}</div>
                    <div className="mt-1 font-medium">
                      {m.count} {m.count === 1 ? "person" : "people"} ·{" "}
                      {m.isOrigin ? "Origin" : "Settlement"}
                    </div>
                    <PeopleLinks refs={m.people} />
                    <a
                      href={`#/places?q=${encodeURIComponent(m.place)}`}
                      className="mt-1 inline-flex min-h-8 items-center font-medium text-primary hover:underline"
                    >
                      Open in place explorer →
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        Circle size reflects how many family members are connected to a place.
        Coordinates are pre-geocoded via OpenStreetMap; cemetery-only and a few
        unrecognized places aren't plotted. Map data ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          OpenStreetMap
        </a>{" "}
        contributors.
      </p>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  color,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 min-h-9 text-xs font-medium hover-elevate active-elevate-2",
        active ? "border-foreground/30 text-foreground" : "border-border/60 text-muted-foreground opacity-60",
      )}
    >
      <span
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
        style={{ color }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}
