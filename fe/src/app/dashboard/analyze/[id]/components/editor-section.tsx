"use client";

import { useParams } from "next/navigation";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/prism";

import CodeSkeleton from "@/app/dashboard/audit/components/skeletons/code-skeleton";
import useQueryContractDetail from "@/app/dashboard/code-gen/[id]/hooks/use-query-contract-detail";
import { Button } from "@/shared/components/ui/button";
import { payForFeature } from "@/shared/lib/zv-contract";
import {
  AnchorPointIcon,
  CopyIcon,
  NeuralNetworkIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import useAnalyzeSmartContract from "../../hooks/use-analyze-smart-contract";
import { AttackTraceModal } from "./attack-trace-modal";

const EditorSection = ({
  finalCode,
  isLoading,
}: {
  finalCode: string;
  isLoading: boolean;
}) => {
  const params = useParams();
  const contractId = params.id?.toString() ?? "";
  const { data, refetch } = useQueryContractDetail(contractId);
  const { mutateAsync: analyze, isPending } = useAnalyzeSmartContract();

  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);

  const latestTrace = data?.audits?.[0]?.ai_findings?.[0]?.attack_trace;

  const handleCopy = async () => {
    if (!finalCode) return;
    try {
      await navigator.clipboard.writeText(finalCode);
      toast.success("Contract code copied to clipboard");
    } catch {
      toast.error("Failed to copy code");
    }
  };

  console.log(data);

  const handleAnalyze = async () => {
    try {
      await toast.promise(payForFeature("Analyze", `analyze:${Date.now()}`), {
        loading: "Processing payment of 0.1 0g...",
        success: () => "Payment sucessful",
        error: (err: unknown) =>
          err instanceof Error ? err.message : "Payment failed",
      });

      await toast.promise(
        analyze({ code: finalCode, contract_id: contractId }),
        {
          loading: "Analyzing smart contract...",
          success: () => {
            refetch();
            return "Analysis complete";
          },
          error: (err: unknown) =>
            err instanceof Error
              ? err.message
              : "Failed analyzing smart contract",
        },
      );
    } catch {}
  };

  return (
    <section className="flex basis-[70%] flex-col overflow-hidden rounded-2xl border border-mist-800 bg-mist-900/50">
      <div className="flex items-center justify-between border-b border-mist-800 bg-mist-950/30 p-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-sm font-medium text-zinc-400">
            {data?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="outline" onClick={handleCopy}>
            <HugeiconsIcon icon={CopyIcon} size={18} strokeWidth={2} />
          </Button>

          <Button
            size="icon-sm"
            variant="outline"
            disabled={!latestTrace}
            onClick={() => setIsTraceModalOpen(true)}
            title="View Attack Trace"
          >
            <HugeiconsIcon icon={AnchorPointIcon} size={18} strokeWidth={2} />
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleAnalyze}
          >
            <span>Reanalyze</span>
          </Button>

          <Button size="sm">
            <HugeiconsIcon icon={NeuralNetworkIcon} size={18} strokeWidth={2} />
            <span>Deploy</span>
          </Button>
        </div>
      </div>

      <AttackTraceModal
        isOpen={isTraceModalOpen}
        onClose={setIsTraceModalOpen}
        traceData={latestTrace}
      />

      <div className="custom-scrollbar flex-1 grow overflow-auto bg-transparent p-2">
        {isLoading && <CodeSkeleton totalLines={20} />}
        {finalCode && (
          <SyntaxHighlighter
            language="solidity"
            style={darcula}
            showLineNumbers={true}
            wrapLines={true}
            customStyle={{
              margin: 0,
              padding: "1.5rem 0",
              fontSize: "0.875rem",
              lineHeight: "1.5",
              background: "transparent",
            }}
            lineNumberStyle={{
              minWidth: "3.5em",
              paddingRight: "1.5em",
              color: "#4a4a4a",
              textAlign: "right",
              userSelect: "none",
            }}
          >
            {finalCode}
          </SyntaxHighlighter>
        )}
      </div>
    </section>
  );
};

export default EditorSection;
