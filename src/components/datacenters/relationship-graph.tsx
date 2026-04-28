"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type GraphNode = {
  id: string;
  slug: string;
  name: string;
  kind: "operator" | "supplier";
  weight: number;
  mw: number;
  categories?: string[];
};

type GraphEdge = {
  source: string;
  target: string;
  weight: number;
};

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function RelationshipGraph({ nodes, edges }: Props) {
  const [highlight, setHighlight] = useState<string | null>(null);

  const { rfNodes, rfEdges } = useMemo(() => {
    // Bipartite layout: operators on left, suppliers on right.
    const operators = nodes.filter((n) => n.kind === "operator");
    const suppliers = nodes.filter((n) => n.kind === "supplier");
    operators.sort((a, b) => b.weight - a.weight);
    suppliers.sort((a, b) => b.weight - a.weight);

    const opSpacing = Math.max(60, 720 / Math.max(1, operators.length));
    const supSpacing = Math.max(60, 720 / Math.max(1, suppliers.length));

    const rfNodes: Node[] = [
      ...operators.map((n, i) => ({
        id: n.id,
        position: { x: 0, y: i * opSpacing },
        data: { label: n.name, kind: n.kind, weight: n.weight },
        style: {
          background:
            highlight &&
            n.id !== highlight &&
            !isConnected(highlight, n.id, edges)
              ? "#1e293b40"
              : "#0ea5e9",
          color: "#fff",
          border: "1px solid #0284c7",
          borderRadius: 6,
          fontSize: 11,
          padding: 4,
          width: Math.min(180, 80 + n.weight * 4),
        },
      })),
      ...suppliers.map((n, i) => ({
        id: n.id,
        position: { x: 600, y: i * supSpacing },
        data: { label: n.name, kind: n.kind, weight: n.weight },
        style: {
          background:
            highlight &&
            n.id !== highlight &&
            !isConnected(highlight, n.id, edges)
              ? "#1e293b40"
              : "#a855f7",
          color: "#fff",
          border: "1px solid #9333ea",
          borderRadius: 6,
          fontSize: 11,
          padding: 4,
          width: Math.min(180, 80 + n.weight * 4),
        },
      })),
    ];

    const maxW = Math.max(1, ...edges.map((e) => e.weight));
    const rfEdges: Edge[] = edges.map((e) => {
      const dim =
        highlight !== null && e.source !== highlight && e.target !== highlight;
      return {
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        animated: false,
        style: {
          stroke: dim ? "#33415540" : "#64748b",
          strokeWidth: Math.max(1, (e.weight / maxW) * 4),
        },
        label: e.weight > 1 ? `${e.weight}` : undefined,
        labelStyle: { fontSize: 10, fill: "#94a3b8" },
      };
    });
    return { rfNodes, rfEdges };
  }, [nodes, edges, highlight]);

  return (
    <div className="border-border h-[600px] overflow-hidden rounded-lg border">
      <div className="border-border bg-muted/30 flex items-center justify-between border-b px-3 py-2 text-xs">
        <div className="flex items-center gap-3">
          <span>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-500"></span>
            {nodes.filter((n) => n.kind === "operator").length} operators
          </span>
          <span>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-purple-500"></span>
            {nodes.filter((n) => n.kind === "supplier").length} suppliers
          </span>
          <span className="text-muted-foreground">{edges.length} edges</span>
        </div>
        <div className="flex items-center gap-2">
          {highlight && (
            <button
              type="button"
              onClick={() => setHighlight(null)}
              className="hover:bg-muted rounded border px-2 py-0.5"
            >
              Clear filter
            </button>
          )}
          <span className="text-muted-foreground">
            Click a node to focus its connections
          </span>
        </div>
      </div>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodeClick={(_, n) =>
          setHighlight((curr) => (curr === n.id ? null : n.id))
        }
        fitView
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function isConnected(
  focusId: string,
  nodeId: string,
  edges: GraphEdge[],
): boolean {
  for (const e of edges) {
    if (
      (e.source === focusId && e.target === nodeId) ||
      (e.target === focusId && e.source === nodeId)
    ) {
      return true;
    }
  }
  return false;
}

export type { GraphNode, GraphEdge };
