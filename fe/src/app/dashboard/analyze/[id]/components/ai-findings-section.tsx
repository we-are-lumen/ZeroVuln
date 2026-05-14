/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PackageOpenIcon,
  Shield02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
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

  type PatchOp = "replace" | "insert_before" | "insert_after" | "delete";
  type FindingPatch = {
    op: PatchOp;
    start_line: number;
    end_line: number;
    replacement?: string;
  };

  const applyPatch = (patch: FindingPatch) => {
    if (!finalCode) return;

    const lines = finalCode.split("\n");
    const startIndex = patch.start_line - 1;
    const endIndex = patch.end_line - 1;

    if (startIndex < 0 || endIndex < startIndex || endIndex >= lines.length) {
      toast.warning("Auto-apply unavailable: patch line range is out of bounds.");
      return;
    }

    const replacementLines =
      typeof patch.replacement === "string" && patch.replacement.length > 0
        ? patch.replacement.split("\n")
        : [];

    if (patch.op === "delete") {
      lines.splice(startIndex, endIndex - startIndex + 1);
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }

    if (patch.op === "replace") {
      lines.splice(startIndex, endIndex - startIndex + 1, ...replacementLines);
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }

    if (patch.op === "insert_before") {
      lines.splice(startIndex, 0, ...replacementLines);
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }

    if (patch.op === "insert_after") {
      lines.splice(endIndex + 1, 0, ...replacementLines);
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }
  };

  const handleApply = (patch?: FindingPatch) => {
    if (!patch) {
      toast.warning(
        "Auto-apply unavailable: this finding doesn’t include a patch yet. Please re-run Analyze.",
      );
      return;
    }
    applyPatch(patch);
  };

  const displayedFindings = useMemo(() => {
    return findings.filter(({ uuid }) => !chosenFindings.includes(uuid));
  }, [findings, chosenFindings]);

  const renderCards = () =>
    displayedFindings.map(
      ({
        uuid,
        title,
        description,
        severity,
        line_start,
        line_end,
        reasoning_trace,
        remediation,
        confidence,
      }) => {
        const snippet = getSnippet(line_start, line_end);
        const isMultiLine = line_end !== line_start;
        const patch = (remediation as any)?.patch as FindingPatch | undefined;
        const suggestedCode =
          (remediation as any)?.suggested_code ??
          (reasoning_trace as any)?.vulnerability?.suggested_code;

        return (
          <div
            key={uuid}
            className={cn("space-y-3 rounded-lg border border-mist-800 p-3")}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="line-clamp-1 text-sm font-semibold">{title}</h4>
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
                <span className="text-mist-400"> · Confidence </span>
                <span className="font-semibold text-primary">
                  {confidence ? confidence / 100 : 0}%
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

            <div className="space-y-2">
              <div className="flex items-center gap-1 text-primary">
                <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={2} />

                <h5 className="line-clamp-1 text-xs font-medium">
                  Suggested Fix
                </h5>
              </div>

              <div className="border border-primary">
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
                  {suggestedCode}
                </SyntaxHighlighter>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setChosenFindings((prev) => [...prev, uuid])}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={!patch}
                onClick={() => {
                  setChosenFindings((prev) => [...prev, uuid]);
                  handleApply(patch);
                }}
                title={
                  patch
                    ? "Apply fix"
                    : "Auto-apply needs patch data. Please re-run Analyze."
                }
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
    <section className="flex h-full grow-0 basis-[30%] flex-col overflow-x-auto rounded-2xl border border-mist-800 bg-mist-900/50">
      <div className="border-b border-mist-800 p-3">
        <div className="flex items-center gap-2 text-mist-400">
          <HugeiconsIcon icon={Shield02Icon} size={20} strokeWidth={2} />
          <h3 className="text-sm font-bold">AI FINDINGS</h3>
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
