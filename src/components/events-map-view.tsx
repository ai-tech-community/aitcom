"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
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

const userIcon = L.divIcon({
  html: `<div style="
    width: 18px;
    height: 18px;
    background: #2563eb;
    border: 3px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.25), 0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
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
  userCoords?: { lat: number; lng: number } | null;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export function EventsMapView({
  events,
  userCoords = null,
}: EventsMapViewProps) {
  const bounds = useMemo<L.LatLngBoundsLiteral | null>(() => {
    if (events.length === 0 && !userCoords) return null;

    let points: Array<{ lat: number; lng: number }> = [];

    if (userCoords && events.length > 0) {
      const sorted = [...events]
        .map((e) => ({
          event: e,
          km: haversineKm(userCoords, { lat: e.latitude, lng: e.longitude }),
        }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 5);
      points = [
        userCoords,
        ...sorted.map((s) => ({
          lat: s.event.latitude,
          lng: s.event.longitude,
        })),
      ];
    } else if (userCoords) {
      return [
        [userCoords.lat - 0.5, userCoords.lng - 0.5],
        [userCoords.lat + 0.5, userCoords.lng + 0.5],
      ];
    } else {
      points = events.map((e) => ({ lat: e.latitude, lng: e.longitude }));
    }

    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
  }, [events, userCoords]);

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
        {userCoords && (
          <Marker position={[userCoords.lat, userCoords.lng]} icon={userIcon}>
            <Popup>
              <div className="text-xs font-semibold text-black">
                You are here
              </div>
            </Popup>
          </Marker>
        )}
        {events.map((event) => (
          <Marker
            key={event.id}
            position={[event.latitude, event.longitude]}
            icon={markerIcon}
          >
            <Popup>
              <div className="font-mono text-xs tracking-wider text-neutral-500">
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
                <div className="mt-1 inline-block rounded bg-black px-1.5 py-0.5 font-mono text-xs text-white">
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
