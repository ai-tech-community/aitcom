"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import {
  STARTUP_PIN_ZOOM,
  type StartupMapPin,
} from "@/lib/investigations/startups";
import {
  STARTUPS_MAP_MAX_ZOOM,
  STARTUPS_MAP_MIN_ZOOM,
  StartupClusterIndex,
  type StartupMapBounds,
  type StartupMapMarker,
} from "@/lib/investigations/startups-map-clusters";

export type StartupsClusterMapProps = {
  pins: readonly StartupMapPin[];
  /** Company to highlight (hovered or focused in the list). */
  activeId: string | null;
  formatCount: (count: number) => string;
  clusterTitle: (count: number) => string;
  onViewChange: (bounds: StartupMapBounds, zoom: number) => void;
  /** A pin, or a cluster that zooming cannot split, was picked. */
  onSelect: (pins: StartupMapPin[]) => void;
};

/** Count bubbles for groups, dots for single companies. Orange = active. */
export function StartupsClusterMapView(props: StartupsClusterMapProps) {
  // Fit the first render to the pins; after that the viewer owns the view.
  const [initial] = useState(() => initialView(props.pins));

  return (
    <MapContainer
      {...initial}
      minZoom={STARTUPS_MAP_MIN_ZOOM}
      maxZoom={STARTUPS_MAP_MAX_ZOOM}
      zoomSnap={0.5}
      scrollWheelZoom
      worldCopyJump
      // OSM's own sea colour, so a zoomed-out world has no grey bands.
      className="bg-[#aad3df]!"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClusterLayer {...props} />
    </MapContainer>
  );
}

function initialView(pins: readonly StartupMapPin[]) {
  if (pins.length === 0) return { center: [20, 0] as L.LatLngTuple, zoom: 2 };
  const lats = pins.map((pin) => pin.lat);
  const lngs = pins.map((pin) => pin.lng);
  return {
    bounds: [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ] as L.LatLngBoundsLiteral,
    boundsOptions: {
      maxZoom: STARTUP_PIN_ZOOM.city,
      padding: [32, 32] as L.PointTuple,
    },
  };
}

function readView(map: L.Map): { bounds: StartupMapBounds; zoom: number } {
  const bounds = map.getBounds();
  return {
    bounds: {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    },
    zoom: map.getZoom(),
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ClusterLayer({
  pins,
  activeId,
  formatCount,
  clusterTitle,
  onViewChange,
  onSelect,
}: StartupsClusterMapProps) {
  const map = useMap();
  const index = useMemo(() => new StartupClusterIndex(pins), [pins]);
  const [view, setView] = useState(() => readView(map));
  useMapEvents({ moveend: () => setView(readView(map)) });

  // Report the viewport without re-running when the parent re-renders.
  // (useEffectEvent would fit, but Next 15.4's bundled React lacks it.)
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  });
  useEffect(() => {
    onViewChangeRef.current(view.bounds, view.zoom);
  }, [view]);

  const markers = useMemo(
    () => index.markers(view.bounds, view.zoom),
    [index, view],
  );
  const activeKey = useMemo(
    () => (activeId ? markerKeyFor(activeId, markers, index) : null),
    [activeId, markers, index],
  );

  return markers.map((marker) => {
    const key = markerKey(marker);
    const active = key === activeKey;
    if (marker.kind === "pin") {
      return (
        <Marker
          key={key}
          position={[marker.pin.lat, marker.pin.lng]}
          icon={pinIcon(active)}
          title={marker.pin.name}
          alt={marker.pin.name}
          zIndexOffset={active ? 1000 : 0}
          eventHandlers={{ click: () => onSelect([marker.pin]) }}
        />
      );
    }
    const title = clusterTitle(marker.count);
    return (
      <Marker
        key={key}
        position={[marker.lat, marker.lng]}
        icon={clusterIcon(formatCount(marker.count), active)}
        title={title}
        alt={title}
        zIndexOffset={active ? 1000 : 0}
        eventHandlers={{
          click: () => {
            if (marker.expandable) {
              map.setView([marker.lat, marker.lng], marker.expansionZoom, {
                animate: !prefersReducedMotion(),
              });
            } else {
              onSelect(index.leaves(marker.id));
            }
          },
        }}
      />
    );
  });
}

function markerKey(marker: StartupMapMarker): string {
  return marker.kind === "pin" ? `p:${marker.pin.id}` : `c:${marker.id}`;
}

function markerKeyFor(
  id: string,
  markers: readonly StartupMapMarker[],
  index: StartupClusterIndex,
): string | null {
  for (const marker of markers) {
    if (marker.kind === "pin" && marker.pin.id === id) return markerKey(marker);
  }
  for (const marker of markers) {
    if (
      marker.kind === "cluster" &&
      index.leaves(marker.id).some((pin) => pin.id === id)
    ) {
      return markerKey(marker);
    }
  }
  return null;
}

// Icons are centred on the point: a zero-size anchor holding a translated child.
const centred = "absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2";

const bubbleBase = `${centred} inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 font-mono text-xs font-medium tabular-nums whitespace-nowrap shadow-sm transition-colors`;
const bubbleIdle =
  "border-foreground/70 bg-background text-foreground hover:bg-foreground hover:text-background";
const bubbleActive = "border-primary bg-primary text-primary-foreground";

const dotBase = `${centred} block rounded-full border-2 border-background shadow-sm transition-colors`;
const dotIdle = "size-3.5 bg-foreground hover:bg-primary";
const dotActive = "size-4 bg-primary";

const iconCache = new Map<string, L.DivIcon>();

function cachedIcon(key: string, html: string): L.DivIcon {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({ html, className: "", iconSize: [0, 0] });
    iconCache.set(key, icon);
  }
  return icon;
}

function clusterIcon(label: string, active: boolean): L.DivIcon {
  const cls = `${bubbleBase} ${active ? bubbleActive : bubbleIdle}`;
  return cachedIcon(
    `c:${label}:${active}`,
    `<span class="${cls}">${label}</span>`,
  );
}

function pinIcon(active: boolean): L.DivIcon {
  const cls = `${dotBase} ${active ? dotActive : dotIdle}`;
  return cachedIcon(`p:${active}`, `<span class="${cls}"></span>`);
}
