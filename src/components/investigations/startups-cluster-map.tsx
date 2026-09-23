"use client";

import dynamic from "next/dynamic";

import type { StartupsClusterMapProps } from "@/components/investigations/startups-cluster-map-view";

/** Leaflet needs `window`, so the map loads on the client only. */
export const StartupsClusterMap = dynamic<StartupsClusterMapProps>(
  () =>
    import("./startups-cluster-map-view").then((m) => m.StartupsClusterMapView),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted/40 flex size-full items-center justify-center">
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          LOADING MAP…
        </p>
      </div>
    ),
  },
);
