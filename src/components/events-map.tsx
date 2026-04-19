"use client";

import dynamic from "next/dynamic";
import type { MapEvent } from "./events-map-view";

const InnerMap = dynamic(
  () => import("./events-map-view").then((m) => m.EventsMapView),
  {
    ssr: false,
    loading: () => (
      <div className="border-border mt-8 flex h-[60vh] min-h-[500px] items-center justify-center rounded-xl border">
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          LOADING MAP…
        </p>
      </div>
    ),
  },
);

export function EventsMap(props: {
  events: MapEvent[];
  userCoords?: { lat: number; lng: number } | null;
}) {
  return <InnerMap {...props} />;
}

export type { MapEvent };
