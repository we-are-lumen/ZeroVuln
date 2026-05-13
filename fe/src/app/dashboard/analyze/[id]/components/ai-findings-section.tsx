/* eslint-disable @typescript-eslint/no-explicit-any */
import { PackageOpenIcon, Shield02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { AuditorFindingSeverity } from "@/shared/types/auditor-finding.type";
import SyntaxHighlighter from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/hljs";
import useQueryContractDetail from "@/app/dashboard/code-gen/[id]/hooks/use-query-contract-detail";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner"; // Assuming you use sonner based on previous snippets

const getBadgeClassNames = (severity: AuditorFindingSeverity) => {
  switch (severity) {
    case "critical":
      return "bg-purple-500/50";
    case "high":
      return "bg-rose-500/50";
    case "medium":
      return "bg-amber-500/50";
    case "low":
      return "bg-sky-500/50";
    default:
      return "bg-zinc-500/50";
  }
};

// 1. Add the Props Interface
interface AiFindingsSectionProps {
  finalCode: string;
  isLoading: boolean;
  setFinalCode: (code: string) => void;
}

const AiFindingsSection = ({
  finalCode,
  setFinalCode,
  isLoading,
}: AiFindingsSectionProps) => {
  const params = useParams();
  const contractId = params.id?.toString() ?? "";
  const { data } = useQueryContractDetail(contractId);

  const [chosenFindings, setChosenFindings] = useState<string[]>([]);

  useEffect(() => {
    if (!finalCode && data?.source_code) {
      const initialCode = data.source_code.map((l) => l.code).join("\n");
      setFinalCode(initialCode);
    }
  }, [data, finalCode, setFinalCode]);

  const findings = useMemo(() => {
    if (!data?.audits) return [];
    return data.audits.flatMap(({ ai_findings }) => ai_findings);
  }, [data]);

  const getSnippet = (start: number, end: number | null) => {
    if (!data?.source_code) return "";
    const relevantLines = data.source_code.filter(
      (l) => l.line >= start && l.line <= (end ?? start),
    );
    return relevantLines.map((l) => l.code).join("\n");
  };

  // 3. The Apply Logic
  const handleApply = (
    lineStart: number,
    lineEnd: number,
    suggestedCode?: string,
  ) => {
    if (!suggestedCode) {
      toast.error("No suggested code available for this finding.");
      return;
    }
    if (!finalCode) return;

    // Split the current editable code into an array of lines
    const lines = finalCode.split("\n");

    // Convert 1-based line numbers to 0-based array indices
    const startIndex = lineStart - 1;
    const endIndex = lineEnd - 1;
    const deleteCount = endIndex - startIndex + 1;

    // Remove the vulnerable lines and insert the suggested code
    lines.splice(startIndex, deleteCount, suggestedCode);

    // Join back into a string and update the parent state
    setFinalCode(lines.join("\n"));
    toast.success("Fix applied successfully!");
  };

  const displayedFindings = useMemo(() => {
    return findings.filter(({ uuid }) => !chosenFindings.includes(uuid));
  }, [findings, chosenFindings]);

  const renderCards = () =>
    displayedFindings.map(
      // Ensure we destructure remediation from the finding
      ({
        uuid,
        title,
        description,
        severity,
        line_start,
        line_end,
        remediation,
      }) => {
        const snippet = getSnippet(line_start, line_end);
        const isMultiLine = line_end !== line_start;
        // Extract the suggested code safely
        const suggestedCode = (remediation as any)?.suggested_code;

        return (
          <div
            key={uuid}
            className={cn("space-y-3 rounded-lg border border-mist-800 p-3")}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="line-clamp-1 text-sm leading-tight font-semibold">
                {title}
              </h4>
              <div className="space-x-2">
                <Badge
                  className={cn(
                    "text-[10px] font-bold text-mist-100 capitalize",
                    getBadgeClassNames(severity),
                  )}
                >
                  {severity}
                </Badge>
              </div>
            </div>

            <div>
              <p className="text-xs">
                <span className="text-mist-400">Line</span>{" "}
                <span className="font-semibold text-primary">
                  {line_start} {isMultiLine ? `- ${line_end}` : null}
                </span>
              </p>
            </div>

            <p className="text-[11px] leading-relaxed text-mist-400">
              {description}
            </p>

            <div className="overflow-auto rounded border border-white/5">
              <SyntaxHighlighter
                language="solidity"
                style={darcula}
                showLineNumbers
                startingLineNumber={line_start}
                customStyle={{
                  margin: 0,
                  padding: "0.5rem",
                  fontSize: "10px",
                  background: "rgba(0,0,0,0.3)",
                }}
              >
                {snippet}
              </SyntaxHighlighter>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setChosenFindings((prev) => [...prev, uuid])}
              >
                Dismiss
              </Button>
              {/* 4. Attach the handleApply function */}
              <Button
                size="sm"
                onClick={() => {
                  setChosenFindings((prev) => [...prev, uuid]);
                  handleApply(line_start, line_end, suggestedCode);
                }}
                disabled={!suggestedCode} // Disable if no fix is provided
              >
                Apply Fix
              </Button>
            </div>
          </div>
        );
      },
    );

  const renderSkeleton = () => (
    <div className="space-y-2">
      {[...Array(5)].map((_, index) => (
        <div
          key={index}
          className="h-32 w-full animate-pulse rounded-lg bg-mist-800"
        ></div>
      ))}
    </div>
  );

  return (
    <section className="flex h-full basis-[30%] flex-col rounded-2xl border border-mist-800 bg-mist-900/50">
      <div className="border-b border-mist-800 p-3">
        <div className="flex items-center gap-2 text-mist-400">
          <HugeiconsIcon icon={Shield02Icon} size={20} strokeWidth={2} />
          <h3 className="text-sm font-bold tracking-widest">AI FINDINGS</h3>
        </div>
      </div>
      <div className="custom-scrollbar h-full space-y-3 overflow-y-auto p-3">
        {displayedFindings.length === 0 && (
          <div className="flex size-full flex-col items-center justify-center gap-4 text-mist-500">
            <HugeiconsIcon icon={PackageOpenIcon} size={44} />
            <p className="text-center text-xs italic">
              No findings to be applied for this contract
            </p>
          </div>
        )}
        {isLoading && renderSkeleton()}
        {!isLoading && renderCards()}
      </div>
    </section>
  );
};

export default AiFindingsSection;
