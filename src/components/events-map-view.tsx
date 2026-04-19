"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
} from "react-leaflet";
import { Link } from "@/i18n/navigation";

const markerIcon = L.divIcon({
  html: `<div style="
    width: 14px;
    height: 14px;
    background: #111;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  "></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export interface MapEvent {
  id: number;
  slug: string;
  title: string;
  date: string;
  location: string;
  latitude: number;
  longitude: number;
  type: string;
  aitFitScore?: number | null;
}

interface EventsMapViewProps {
  events: MapEvent[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export function EventsMapView({ events }: EventsMapViewProps) {
  const bounds = useMemo<L.LatLngBoundsLiteral | null>(() => {
    if (events.length === 0) return null;
    const lats = events.map((e) => e.latitude);
    const lngs = events.map((e) => e.longitude);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [events]);

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground mt-12 text-center">
        No geocoded events to show on map.
      </p>
    );
  }

  return (
    <div className="border-border mt-8 overflow-hidden rounded-xl border">
      <MapContainer
        bounds={bounds ?? undefined}
        center={bounds ? undefined : [52.37, 4.9]}
        zoom={bounds ? undefined : 4}
        scrollWheelZoom
        style={{ height: "60vh", minHeight: "500px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {events.map((event) => (
          <Marker
            key={event.id}
            position={[event.latitude, event.longitude]}
            icon={markerIcon}
          >
            <Popup>
              <div className="font-mono text-[11px] tracking-wider text-neutral-500">
                {formatDate(event.date)} · {event.type.toUpperCase()}
              </div>
              <Link
                href={`/events/${event.slug}`}
                className="mt-1 block text-sm font-semibold text-black hover:underline"
              >
                {event.title}
              </Link>
              <div className="mt-1 text-xs text-neutral-600">
                {event.location}
              </div>
              {typeof event.aitFitScore === "number" && (
                <div className="mt-1 inline-block rounded bg-black px-1.5 py-0.5 font-mono text-[10px] text-white">
                  AIT {event.aitFitScore}/10
                </div>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
