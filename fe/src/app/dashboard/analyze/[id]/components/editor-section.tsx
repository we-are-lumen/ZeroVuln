"use client";

import { useParams } from "next/navigation";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/prism";

import CodeSkeleton from "@/app/dashboard/audit/components/skeletons/code-skeleton";
import useQueryContractDetail from "@/app/dashboard/code-gen/[id]/hooks/use-query-contract-detail";
import { Button } from "@/shared/components/ui/button";
import { deploySolidityContractFromSource } from "@/shared/lib/solidity/deploy";
import { payForFeature } from "@/shared/lib/zv-contract";
import contractService from "@/api/services/contracts.service";
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

const normalizeContractLabel = (name?: string | null) => {
  const base = (name ?? "Contract").trim();
  if (!base) return { title: "Contract", ext: ".sol" };
  if (base.toLowerCase().endsWith(".sol")) {
    return { title: base.slice(0, -4) || "Contract", ext: ".sol" };
  }
  return { title: base, ext: ".sol" };
};

const formatHash = (hash?: string | null) => {
  if (!hash) return "";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
};

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
  const [isDeploying, setIsDeploying] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

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

  const handleAnalyze = async () => {
    if (!finalCode) return;
    if (isPaying || isPending) return;

    setIsPaying(true);
    try {
      const paymentPromise = payForFeature("Analyze", `analyze:${Date.now()}`);
      toast.promise(paymentPromise, {
        loading: "Processing payment of 0.1 0g...",
        success: () => "Payment sucessful",
        error: (err: unknown) =>
          err instanceof Error ? err.message : "Payment failed",
      });

      await paymentPromise;

      const analyzePromise = analyze({ code: finalCode, contract_id: contractId });
      toast.promise(analyzePromise, {
        loading: "Analyzing smart contract...",
        success: () => "Analysis complete",
        error: (err: unknown) =>
          err instanceof Error ? err.message : "Failed analyzing smart contract",
      });

      await analyzePromise;
      refetch();
    } catch {
      // noop - toast.promise already surfaces errors
    } finally {
      setIsPaying(false);
    }
  };

  const handleDeploy = async () => {
    if (!finalCode) return;
    if (isDeploying) return;

    setIsDeploying(true);
    try {
      const deployPromise = deploySolidityContractFromSource(finalCode);
      toast.promise(deployPromise, {
        loading: "Compiling & deploying contract...",
        success: "Deploy berhasil",
        error: (err: unknown) => (err instanceof Error ? err.message : "Deploy gagal"),
      });

      const res = await deployPromise;

      toast.success(
        `Deployed: ${res.address.slice(0, 6)}...${res.address.slice(-4)}`,
      );

      try {
        await navigator.clipboard.writeText(res.address);
      } catch {}

      // Update contract status + deployment tx hash
      if (contractId) {
        try {
          await contractService.updateContract(contractId, {
            status: "deployed",
            hash_sc: res.txHash ?? null,
          });
          refetch();
        } catch (e) {
          console.warn("Failed to sync deployed status:", e);
        }
      }
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCopyHash = async () => {
    if (!data?.hash_sc) return;
    try {
      await navigator.clipboard.writeText(data.hash_sc);
      toast.success("Transaction hash copied to clipboard");
    } catch {
      toast.error("Failed to copy transaction hash");
    }
  };

  return (
    <section className="flex basis-[70%] flex-col overflow-hidden rounded-2xl border border-mist-800 bg-mist-900/50">
      <div className="flex items-center justify-between border-b border-mist-800 bg-mist-950/30 p-3">
        <div className="flex items-center gap-2">
          {(() => {
            const { title, ext } = normalizeContractLabel(data?.name);
            return (
              <>
                <p className="font-mono text-sm font-medium text-zinc-400">
                  {title}
                </p>
                <span className="rounded border border-mist-700 bg-mist-950/40 px-2 py-0.5 font-mono text-[10px] text-mist-400">
                  {ext}
                </span>
                {data?.status === "deployed" && (
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300">
                    deployed
                  </span>
                )}
                {data?.hash_sc && (
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="rounded border border-mist-700 bg-mist-950/40 px-2 py-0.5 font-mono text-[10px] text-mist-400 hover:text-mist-200"
                    title="Copy transaction hash"
                  >
                    {formatHash(data.hash_sc)}
                  </button>
                )}
              </>
            );
          })()}
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
            disabled={isPending || isPaying}
            onClick={handleAnalyze}
          >
            <span>Reanalyze</span>
          </Button>

          <Button
            size="sm"
            onClick={handleDeploy}
            disabled={isLoading || !finalCode || isDeploying}
            title={!finalCode ? "Tidak ada code untuk di-deploy" : "Deploy ke OG Galileo"}
          >
            <HugeiconsIcon icon={NeuralNetworkIcon} size={18} strokeWidth={2} />
            <span>{isDeploying ? "Deploying..." : "Deploy"}</span>
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
