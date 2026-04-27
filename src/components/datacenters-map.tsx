"use client";

import dynamic from "next/dynamic";
import type { MapDatacenter } from "./datacenters-map-view";

const InnerMap = dynamic(
  () => import("./datacenters-map-view").then((m) => m.DatacentersMapView),
  {
    ssr: false,
    loading: () => (
      <div className="border-border flex h-[70vh] min-h-[500px] items-center justify-center rounded-xl border">
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          LOADING MAP…
        </p>
      </div>
    ),
  },
);

export function DatacentersMap(props: { datacenters: MapDatacenter[] }) {
  return <InnerMap {...props} />;
}

export type { MapDatacenter };
