"use client";

import dynamic from "next/dynamic";

import type { StartupMapPin } from "@/lib/investigations/startups";

const InnerMap = dynamic(
  () => import("./startups-map-view").then((m) => m.StartupsMapView),
  {
    ssr: false,
    loading: () => (
      <div className="border-border flex h-80 items-center justify-center rounded-xl border">
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          LOADING MAP…
        </p>
      </div>
    ),
  },
);

export function StartupsMap({ pins }: { pins: StartupMapPin[] }) {
  if (pins.length === 0) return null;
  return <InnerMap pins={pins} />;
}
