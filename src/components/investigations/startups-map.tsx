"use client";

import dynamic from "next/dynamic";

import type { StartupMapPin } from "@/lib/investigations/startups";

const DEFAULT_MAP_HEIGHT = 320;

const InnerMap = dynamic(
  () => import("./startups-map-view").then((m) => m.StartupsMapView),
  {
    ssr: false,
    loading: () => (
      <div className="border-border flex h-full items-center justify-center rounded-xl border">
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          LOADING MAP…
        </p>
      </div>
    ),
  },
);

export function StartupsMap({
  pins,
  height = DEFAULT_MAP_HEIGHT,
}: {
  pins: StartupMapPin[];
  /** Map height in px. */
  height?: number;
}) {
  if (pins.length === 0) return null;
  // Fixed-height frame so the loading placeholder and the map share one box.
  return (
    <div style={{ minHeight: height }}>
      <InnerMap pins={pins} height={height} />
    </div>
  );
}
