"use client";

import dynamic from "next/dynamic";
import type { GraphNode, GraphEdge } from "./relationship-graph";

const Inner = dynamic(
  () => import("./relationship-graph").then((m) => m.RelationshipGraph),
  {
    ssr: false,
    loading: () => (
      <div className="border-border flex h-[600px] items-center justify-center rounded-lg border">
        <p className="text-muted-foreground font-mono text-xs tracking-wider">
          LOADING GRAPH…
        </p>
      </div>
    ),
  },
);

export function RelationshipGraphLoader(props: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  return <Inner {...props} />;
}

export type { GraphNode, GraphEdge };
