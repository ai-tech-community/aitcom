"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { MapDatacenter } from "./datacenters-map-view";

const InnerMap = dynamic(
  () => import("./datacenters-map-view").then((m) => m.DatacentersMapView),
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

/**
 * The map owns no height of its own: this box sizes both the loading state and
 * the loaded map, so swapping one for the other never shifts the page.
 */
export function DatacentersMap({
  datacenters,
  className = "h-[70vh] min-h-[500px]",
}: {
  datacenters: MapDatacenter[];
  /** Sizing for the map box. */
  className?: string;
}) {
  return (
    <div className={cn("relative isolate", className)}>
      <InnerMap datacenters={datacenters} />
    </div>
  );
}

export type { MapDatacenter };
