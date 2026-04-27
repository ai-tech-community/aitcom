"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import type L from "leaflet";
import { MapContainer, CircleMarker, Popup, TileLayer } from "react-leaflet";
import { Link } from "@/i18n/navigation";

export interface MapDatacenter {
  id: string;
  slug: string;
  name: string;
  status: string;
  aiDedicated: boolean;
  lat: number;
  lng: number;
  city: string | null;
  region: string | null;
  country: string;
  capacityMw: number | null;
  capacityMwPlanned: number | null;
  primaryPowerSource: string | null;
  coolingType: string | null;
  verified: boolean;
  supplierCount: number;
  operator: { slug: string; canonicalName: string };
}

const STATUS_COLOR: Record<string, string> = {
  announced: "#94a3b8",
  "under-construction": "#f59e0b",
  operational: "#10b981",
  expanding: "#06b6d4",
  decommissioned: "#6b7280",
  cancelled: "#ef4444",
};

function radiusForMw(mw: number | null): number {
  if (!mw || mw <= 0) return 5;
  // log scale, 50MW → 8, 500MW → 12, 1000MW+ → 16
  return Math.min(20, 4 + Math.log10(mw + 1) * 4);
}

interface DatacentersMapViewProps {
  datacenters: MapDatacenter[];
}

export function DatacentersMapView({ datacenters }: DatacentersMapViewProps) {
  const bounds = useMemo<L.LatLngBoundsLiteral | null>(() => {
    if (!datacenters.length) return null;
    const lats = datacenters.map((d) => d.lat);
    const lngs = datacenters.map((d) => d.lng);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [datacenters]);

  return (
    <div className="border-border h-[70vh] min-h-[500px] overflow-hidden rounded-xl border">
      <MapContainer
        bounds={bounds ?? undefined}
        center={bounds ? undefined : [40, 0]}
        zoom={bounds ? undefined : 2}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {datacenters.map((dc) => {
          const color = STATUS_COLOR[dc.status] ?? "#94a3b8";
          const hasSuppliers = dc.supplierCount > 0;
          return (
            <CircleMarker
              key={dc.id}
              center={[dc.lat, dc.lng]}
              radius={radiusForMw(dc.capacityMw)}
              pathOptions={{
                color: hasSuppliers ? "#0ea5e9" : color,
                fillColor: color,
                fillOpacity: dc.aiDedicated ? 0.8 : 0.5,
                weight: hasSuppliers ? 3 : dc.aiDedicated ? 2 : 1,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{dc.name}</div>
                  <div className="text-xs opacity-70">
                    {dc.operator.canonicalName} ·{" "}
                    {[dc.city, dc.region, dc.country]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1 text-xs">
                    <span
                      className="rounded px-1.5 py-0.5 text-white"
                      style={{ background: color }}
                    >
                      {dc.status}
                    </span>
                    {dc.aiDedicated && (
                      <span className="rounded bg-purple-600 px-1.5 py-0.5 text-white">
                        AI
                      </span>
                    )}
                    {dc.capacityMw != null && (
                      <span className="bg-muted rounded px-1.5 py-0.5">
                        {dc.capacityMw} MW
                      </span>
                    )}
                    {dc.capacityMwPlanned != null &&
                      dc.capacityMwPlanned !== dc.capacityMw && (
                        <span className="bg-muted rounded px-1.5 py-0.5">
                          {dc.capacityMwPlanned} MW planned
                        </span>
                      )}
                    {hasSuppliers && (
                      <span className="rounded bg-sky-600 px-1.5 py-0.5 text-white">
                        {dc.supplierCount} supplier
                        {dc.supplierCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/datacenters/${dc.slug}`}
                    className="mt-1 inline-block text-xs underline"
                  >
                    Details →
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
