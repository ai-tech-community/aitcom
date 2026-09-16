"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import type { StartupMapPin } from "@/lib/investigations/startups";

const markerIcon = L.divIcon({
  html: `<div style="
    width: 14px;
    height: 14px;
    background: oklch(0.705 0.213 47.604);
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  "></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export function StartupsMapView({ pins }: { pins: StartupMapPin[] }) {
  const bounds = useMemo<L.LatLngBoundsLiteral | null>(() => {
    if (pins.length === 0) return null;
    const lats = pins.map((pin) => pin.lat);
    const lngs = pins.map((pin) => pin.lng);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [pins]);

  if (pins.length === 0) return null;

  return (
    <div
      data-startups-map
      className="border-border overflow-hidden rounded-xl border"
    >
      <MapContainer
        bounds={bounds ?? undefined}
        center={bounds ? undefined : [20, 0]}
        zoom={bounds ? undefined : 2}
        scrollWheelZoom
        style={{ height: "320px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={markerIcon}>
            <Popup>
              <a
                href={pin.homepage}
                rel="noopener noreferrer"
                className="block text-sm font-semibold text-black hover:underline"
              >
                {pin.name}
              </a>
              {pin.region ? (
                <div className="mt-1 text-xs text-neutral-600">
                  {pin.region}
                </div>
              ) : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
