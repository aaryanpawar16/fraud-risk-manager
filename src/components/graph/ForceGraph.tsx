// src/components/graph/ForceGraph.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D, { type NodeObject, type LinkObject } from "react-force-graph-2d";
import type { GraphNode, GraphLink } from "@/api/types";

export const NODE_TYPE_COLOR: Record<GraphNode["type"], string> = {
  customer: "#5b8def", // accent
  device: "#e5a73e", // amber
  address: "#3ebd7e", // green
};

interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  height?: number;
}

/** Thin, typed wrapper around react-force-graph-2d. Handles container
 * auto-resize (the underlying library needs explicit pixel width) and
 * applies the risk-console color system by node type. Extracted so any
 * future page needing a shared-identity graph (e.g. a per-customer
 * "who else shares this device" drilldown) can reuse it without
 * duplicating the resize/color logic. */
export default function ForceGraph({ nodes, links, onNodeClick, height = 520 }: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height]);

  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      onNodeClick?.(node as unknown as GraphNode);
    },
    [onNodeClick]
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height,
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <ForceGraph2D
        graphData={{ nodes: nodes as unknown as NodeObject[], links: links as unknown as LinkObject[] }}
        width={dims.width}
        height={dims.height}
        backgroundColor="transparent"
        nodeLabel={(n) => (n as unknown as GraphNode).label}
        nodeColor={(n) => NODE_TYPE_COLOR[(n as unknown as GraphNode).type]}
        nodeRelSize={5}
        linkColor={() => "rgba(167, 173, 186, 0.25)"}
        linkWidth={1}
        onNodeClick={handleNodeClick}
        cooldownTicks={80}
      />
    </div>
  );
}
