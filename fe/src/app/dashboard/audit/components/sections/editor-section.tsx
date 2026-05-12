"use client";

import { Button } from "@/shared/components/ui/button";
import { Add01Icon, CopyIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "sonner"; // Importing toast for feedback
import useQueryContractCatalogDetail from "../../hooks/use-query-contract-catalog-detail";

const EditorSection = () => {
  const searchParams = useSearchParams();
  const selectedScId = searchParams.get("selected_sc");

  const { data, isLoading } = useQueryContractCatalogDetail(selectedScId ?? "");

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const formattedCode = useMemo(() => {
    if (!data?.source_code) return "";
    return data.source_code.map((lineObj) => lineObj.code).join("\n");
  }, [data?.source_code]);

  const handleCopy = async () => {
    if (!formattedCode) return;

    try {
      await navigator.clipboard.writeText(formattedCode);
      toast.success("Source code copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy code");
      console.error("Copy failed: ", err);
    }
  };

  return (
    <section className="flex h-full basis-[50%] flex-col rounded-lg border bg-mist-900/50">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h3 className="text-sm font-bold text-mist-400">
          {data?.name || "contract.sol"}
        </h3>
        <div className="flex items-center gap-3">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!formattedCode || isLoading}
            title="Copy source code"
          >
            <HugeiconsIcon icon={CopyIcon} />
          </Button>

          <Button size="sm">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={3} />
            <span>Add Finding</span>
          </Button>
        </div>
      </div>

      <div className="relative grow overflow-auto">
        {!selectedScId ? (
          <div className="flex h-full items-center justify-center text-zinc-500">
            <p className="text-sm italic">
              Select a contract to view source code
            </p>
          </div>
        ) : isLoading ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Loading code...
          </div>
        ) : (
          <SyntaxHighlighter
            language="solidity"
            style={darcula}
            showLineNumbers={true}
            wrapLines={true}
            customStyle={{
              margin: 0,
              padding: "1.5rem",
              fontSize: "0.875rem",
              lineHeight: "1.5",
              background: "transparent",
            }}
            lineNumberStyle={{
              minWidth: "3em",
              paddingRight: "1em",
              color: "#4a4a4a",
              textAlign: "right",
              userSelect: "none",
            }}
          >
            {formattedCode}
          </SyntaxHighlighter>
        )}
      </div>
    </section>
  );
};

export default EditorSection;
