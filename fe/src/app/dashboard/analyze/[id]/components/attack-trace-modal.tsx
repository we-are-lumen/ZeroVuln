/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Node,
  Panel,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

interface AttackTraceModalProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  traceData: any; // The attack_trace object from your API
}

export const AttackTraceModal = ({
  isOpen,
  onClose,
  traceData,
}: AttackTraceModalProps) => {
  // Map API data to React Flow format
  const { nodes, edges } = useMemo(() => {
    if (!traceData) return { nodes: [], edges: [] };

    const rfNodes: Node[] = traceData.nodes.map((node: any, index: number) => ({
      id: node.id,
      // Simple layout: spread nodes horizontally
      position: { x: index * 100, y: index * 150 },
      data: {
        label: (
          <div className="flex flex-col text-[10px]">
            <span className="font-bold text-primary uppercase">
              {node.type}
            </span>
            <span className="text-xs text-white">{node.label}</span>
            <span className="font-mono text-mist-500">{node.address}</span>
          </div>
        ),
      },
      className:
        "bg-mist-950 border border-mist-800 rounded-lg p-2 w-[200px] shadow-2xl",
    }));

    const rfEdges: Edge[] = traceData.edges.map((edge: any, index: number) => ({
      id: `e-${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.action,
      animated: edge.status === "re-entrant", // Animate the re-entrant call
      labelStyle: { fill: "#fff", fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: "#000", fillOpacity: 0.7 },
      style: { stroke: edge.status === "re-entrant" ? "#10b981" : "#3f3f46" },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [traceData]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="border-mist-800p-0 flex h-[70vh] max-w-5xl flex-col overflow-hidden">
        <div className="flex h-full w-full flex-col">
          <DialogHeader className="mb-3 flex shrink-0 flex-row items-center justify-between space-y-0 border-b border-mist-700 pb-3">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-sm font-bold text-mist-200 uppercase">
                Forensic Canvas • Attack Trace Analysis
              </DialogTitle>
              <p className="text-xs text-mist-500">
                Visualizing Transaction Flow
              </p>
            </div>
          </DialogHeader>
          <ReactFlow nodes={nodes} edges={edges} fitView colorMode="dark">
            <Background
              color="#1e293b"
              variant={BackgroundVariant.Lines}
              gap={25}
              size={1}
            />
            <Controls />
            <Panel
              position="top-right"
              className="rounded border border-mist-800 bg-mist-900 p-2 text-[10px] text-mist-400"
            >
              Trace ID: {traceData?.traceId}
            </Panel>
          </ReactFlow>
        </div>
      </DialogContent>
    </Dialog>
  );
};
