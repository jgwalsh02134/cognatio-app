import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { Map as MapIcon, Ship, MapPin, Anchor } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { cn } from "@/lib/utils";
import {
  buildImmigrationPaths,
  buildPlaceMarkers,
  type LatLng,
} from "@/lib/geo";

const ORIGIN_COLOR = "#f59e0b"; // amber — countries of origin (non-US)
const SETTLE_COLOR = "#2563eb"; // blue — US settlement
const PATH_COLOR = "#e11d48"; // rose — immigration journeys

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 9 });
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

      <div className="relative z-0 h-[60vh] sm:h-[68vh] overflow-hidden rounded-lg border border-card-border">
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
          <FitBounds points={allPoints} />

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
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold mb-1">
                      {p.count} {p.count === 1 ? "person" : "people"}:{" "}
                      {p.fromCountry} → {p.toPlace.split(",")[0]}
                    </div>
                    <div className="text-muted-foreground">
                      {p.fromPlace.split(",").slice(0, 2).join(", ")} →{" "}
                      {p.toPlace.split(",").slice(0, 2).join(", ")}
                    </div>
                    {p.sample.length > 0 && (
                      <div className="mt-1">{p.sample.join(", ")}</div>
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
                radius={Math.min(22, 4 + Math.sqrt(m.count / maxCount) * 18)}
                pathOptions={{
                  color: m.isOrigin ? ORIGIN_COLOR : SETTLE_COLOR,
                  fillColor: m.isOrigin ? ORIGIN_COLOR : SETTLE_COLOR,
                  fillOpacity: 0.5,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold">{m.place.split(",")[0]}</div>
                    <div className="text-muted-foreground">{m.place}</div>
                    <div className="mt-1">
                      {m.count} {m.count === 1 ? "person" : "people"} ·{" "}
                      {m.isOrigin ? "Origin" : "Settlement"}
                    </div>
                    <Link
                      href={`/places?q=${encodeURIComponent(m.place)}`}
                      className="text-primary hover:underline mt-1 inline-block"
                    >
                      See people here →
                    </Link>
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
