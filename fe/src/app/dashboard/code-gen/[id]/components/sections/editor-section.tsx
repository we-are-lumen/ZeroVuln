"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/prism";

import { Button } from "@/shared/components/ui/button";
import CodeSkeleton from "@/app/dashboard/audit/components/skeletons/code-skeleton";
import { deploySolidityContractFromSource } from "@/shared/lib/solidity/deploy";
import { CopyIcon, NeuralNetworkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import useQueryContractDetail from "../../hooks/use-query-contract-detail";

const SOURCE_FILENAME = "Contract.sol";

const EditorSection = () => {
  const params = useParams();
  const contractId = params.id?.toString() ?? "";
  const { data, isLoading } = useQueryContractDetail(contractId);
  const [isDeploying, setIsDeploying] = useState(false);

  const fullCode = useMemo(() => {
    return data?.source_code?.map((lineObj) => lineObj.code).join("\n") ?? "";
  }, [data?.source_code]);

  const handleCopy = async () => {
    if (!fullCode) return;
    try {
      await navigator.clipboard.writeText(fullCode);
      toast.success("Contract code copied to clipboard");
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleDeploy = async () => {
    if (!fullCode) return;
    if (isDeploying) return;

    setIsDeploying(true);
    try {
      const deployPromise = deploySolidityContractFromSource(fullCode);
      toast.promise(deployPromise, {
        loading: "Compiling & deploying contract...",
        success: "Deploy berhasil",
        error: (err: unknown) => (err instanceof Error ? err.message : "Deploy gagal"),
      });

      const res = await deployPromise;

      toast.success(
        `Deployed: ${res.address.slice(0, 6)}...${res.address.slice(-4)}`,
      );

      // Best-effort copy address to clipboard
      try {
        await navigator.clipboard.writeText(res.address);
      } catch {}
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <section className="flex basis-[70%] flex-col overflow-hidden rounded-2xl border border-mist-800 bg-mist-900/50">
      <div className="flex items-center justify-between border-b border-mist-800 bg-mist-950/30 p-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-sm font-medium text-zinc-400">
            {data?.name}
          </p>
          <span className="rounded border border-mist-700 bg-mist-950/40 px-2 py-0.5 font-mono text-[10px] text-mist-400">
            {SOURCE_FILENAME}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="outline" onClick={handleCopy}>
            <HugeiconsIcon icon={CopyIcon} size={18} strokeWidth={2} />
          </Button>

          <Button
            size="sm"
            onClick={handleDeploy}
            disabled={isLoading || !fullCode || isDeploying}
            title={!fullCode ? "Tidak ada code untuk di-deploy" : "Deploy ke OG Galileo"}
          >
            <HugeiconsIcon icon={NeuralNetworkIcon} size={18} strokeWidth={2} />
            <span>{isDeploying ? "Deploying..." : "Deploy"}</span>
          </Button>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 grow overflow-auto bg-transparent p-2">
        {isLoading && <CodeSkeleton totalLines={20} />}
        {fullCode && (
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
            {fullCode}
          </SyntaxHighlighter>
        )}
      </div>
    </section>
  );
};

export default EditorSection;
