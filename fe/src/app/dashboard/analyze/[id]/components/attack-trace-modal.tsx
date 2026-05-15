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
  const { nodes, edges, traceId, steps } = useMemo(() => {
    if (!traceData) return { nodes: [], edges: [], traceId: "-", steps: [] as any[] };

    // Support slight schema differences (e.g. nested attack_trace).
    const payload = traceData?.nodes || traceData?.edges ? traceData : traceData?.attack_trace;
    if (!payload) return { nodes: [], edges: [], traceId: "-", steps: [] as any[] };

    const rawNodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
    const rawEdges = Array.isArray(payload?.edges) ? payload.edges : [];
    const traceId = String(payload?.traceId ?? "-");
    const steps = Array.isArray(payload?.metadata?.steps) ? payload.metadata.steps : [];

    const rfNodes: Node[] = rawNodes.map((node: any, index: number) => ({
      id: String(node?.id ?? `n-${index}`),
      // Simple layout: spread nodes horizontally
      position: { x: index * 100, y: index * 150 },
      data: {
        label: (
          <div className="flex flex-col text-[10px]">
            <span className="font-bold text-primary uppercase">
              {String(node?.type ?? "UNKNOWN")}
            </span>
            <span className="text-xs text-white">{node.label}</span>
            <span className="font-mono text-mist-500">{node.address}</span>
          </div>
        ),
      },
      className:
        "bg-mist-950 border border-mist-800 rounded-lg p-2 w-[200px] shadow-2xl",
    }));

    const toTarget = (to: any) => {
      if (typeof to === "string") return to;
      if (Array.isArray(to) && typeof to[0] === "string") return to[0];
      return String(to ?? "");
    };

    const rfEdges: Edge[] = rawEdges
      .map((edge: any, index: number) => ({
      id: `e-${index}`,
      source: String(edge?.from ?? ""),
      target: toTarget(edge?.to),
      label: String(edge?.action ?? ""),
      animated: edge?.status === "re-entrant", // Animate the re-entrant call
      labelStyle: { fill: "#fff", fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: "#000", fillOpacity: 0.7 },
      style: { stroke: edge?.status === "re-entrant" ? "#10b981" : "#3f3f46" },
      }))
      // ReactFlow butuh source/target valid.
      .filter((e: Edge) => e.source && e.target);

    return { nodes: rfNodes, edges: rfEdges, traceId, steps };
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
          <div className="flex h-full min-h-0 w-full">
            <div className="flex min-h-0 flex-1">
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
                  Trace ID: {traceId}
                </Panel>
              </ReactFlow>
            </div>

            <aside className="hidden w-[320px] shrink-0 border-l border-mist-800 bg-mist-950/40 p-3 md:block">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-mist-300 uppercase">Attack Steps</p>
                <p className="text-[10px] text-mist-500">{steps?.length ?? 0} steps</p>
              </div>

              <div className="custom-scrollbar h-full overflow-y-auto pr-1">
                {Array.isArray(steps) && steps.length > 0 ? (
                  <ol className="space-y-2">
                    {steps.map((s: any, idx: number) => (
                      <li
                        key={idx}
                        className="rounded border border-mist-800 bg-mist-900/40 p-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-semibold text-mist-200">
                            {typeof s?.step === "number" ? `#${s.step}` : `#${idx + 1}`}{" "}
                            {String(s?.title ?? "Step")}
                          </p>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-mist-400">
                          {String(s?.description ?? "")}
                        </p>
                        {(s?.action || (s?.from && s?.to)) && (
                          <p className="mt-2 text-[10px] text-mist-500">
                            {s?.from && s?.to ? `${s.from} → ${s.to}` : null}
                            {s?.action ? ` • ${String(s.action)}` : null}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-mist-500">
                    No step-by-step trace returned. Please re-run Analyze.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
