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

  type FindingRemediation =
    | { mode: "line"; line: number; replacement_line: string }
    | {
        mode: "function";
        function_name: string;
        replacement_function: string;
      };

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const indexToLine = (s: string, index: number) =>
    s.slice(0, index).split("\n").length;

  const findFunctionRange = (
    code: string,
    functionName: string,
    nearLine: number,
  ): { startIndex: number; endIndexExclusive: number; startLine: number } | null => {
    const re = new RegExp(`\\bfunction\\s+${escapeRegExp(functionName)}\\b`, "g");
    const matches: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) matches.push(m.index);
    if (matches.length === 0) return null;

    const best = matches
      .map((idx) => ({ idx, line: indexToLine(code, idx) }))
      .sort((a, b) => Math.abs(a.line - nearLine) - Math.abs(b.line - nearLine))[0];

    const lineStartIndex = code.lastIndexOf("\n", best.idx - 1) + 1;
    const braceStart = code.indexOf("{", best.idx);
    if (braceStart === -1) return null;

    // Ignore function declarations without body (end with ';' before '{')
    const semi = code.indexOf(";", best.idx);
    if (semi !== -1 && semi < braceStart) return null;

    let depth = 0;
    let endBrace = -1;
    for (let i = braceStart; i < code.length; i++) {
      const ch = code[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          endBrace = i;
          break;
        }
      }
    }
    if (endBrace === -1) return null;

    const nextNewline = code.indexOf("\n", endBrace + 1);
    const endIndexExclusive = nextNewline === -1 ? code.length : nextNewline + 1;

    return {
      startIndex: lineStartIndex,
      endIndexExclusive,
      startLine: indexToLine(code, lineStartIndex),
    };
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

    // Extra guardrails (penting untuk findings lama yang mungkin masih punya patch salah).
    if (patch.op === "delete" && patch.end_line !== patch.start_line) {
      toast.warning(
        "Auto-apply unavailable: unsafe delete patch (multi-line). Please re-run Analyze.",
      );
      return;
    }
    if (
      (patch.op === "insert_before" || patch.op === "insert_after") &&
      patch.end_line !== patch.start_line
    ) {
      toast.warning(
        "Auto-apply unavailable: invalid insert patch range. Please re-run Analyze.",
      );
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
      if (replacementLines.length === 0) {
        toast.warning(
          "Auto-apply unavailable: empty replacement for a replace patch. Please re-run Analyze.",
        );
        return;
      }
      const expected = patch.end_line - patch.start_line + 1;
      if (replacementLines.length !== expected) {
        toast.warning(
          "Auto-apply unavailable: replacement block does not match the patch range. Please re-run Analyze.",
        );
        return;
      }

      const originalBlock = lines.slice(startIndex, endIndex + 1).join("\n");
      const countBraces = (s: string) => ({
        open: (s.match(/\{/g) || []).length,
        close: (s.match(/\}/g) || []).length,
      });
      const o = countBraces(originalBlock);
      const r = countBraces(replacementLines.join("\n"));
      if (o.open !== r.open || o.close !== r.close) {
        toast.warning(
          "Auto-apply unavailable: replacement changes brace structure. Please re-run Analyze.",
        );
        return;
      }

      lines.splice(startIndex, endIndex - startIndex + 1, ...replacementLines);
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }

    if (patch.op === "insert_before") {
      if (replacementLines.length === 0) {
        toast.warning(
          "Auto-apply unavailable: empty replacement for an insert patch. Please re-run Analyze.",
        );
        return;
      }
      lines.splice(startIndex, 0, ...replacementLines);
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }

    if (patch.op === "insert_after") {
      if (replacementLines.length === 0) {
        toast.warning(
          "Auto-apply unavailable: empty replacement for an insert patch. Please re-run Analyze.",
        );
        return;
      }
      lines.splice(endIndex + 1, 0, ...replacementLines);
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }
  };

  const applyRemediation = (
    remediation: FindingRemediation,
    findingLineStart: number,
  ) => {
    if (!finalCode) return;

    if (remediation.mode === "line") {
      const line = remediation.line;
      const replacement = remediation.replacement_line ?? "";
      const lines = finalCode.split("\n");
      const idx = line - 1;
      if (idx < 0 || idx >= lines.length) {
        toast.warning("Auto-apply unavailable: remediation line is out of bounds.");
        return;
      }

      if (replacement === "") {
        lines.splice(idx, 1);
      } else {
        const indent = (lines[idx].match(/^\s*/) || [""])[0];
        const newLine =
          /^\s/.test(replacement) || replacement === ""
            ? replacement
            : indent + replacement;
        lines[idx] = newLine;
      }
      setFinalCode(lines.join("\n"));
      toast.success("Fix applied successfully!");
      return;
    }

    const fnName = remediation.function_name;
    const replacementFn = remediation.replacement_function;
    if (!fnName || !replacementFn) {
      toast.warning("Auto-apply unavailable: missing function remediation data.");
      return;
    }

    const range = findFunctionRange(finalCode, fnName, findingLineStart);
    if (!range) {
      toast.warning("Auto-apply unavailable: function not found in current code.");
      return;
    }

    // Basic sanity: replacement function braces must be balanced.
    const count = (s: string) => ({
      open: (s.match(/\{/g) || []).length,
      close: (s.match(/\}/g) || []).length,
    });
    const r = count(replacementFn);
    if (r.open === 0 || r.open !== r.close) {
      toast.warning(
        "Auto-apply unavailable: replacement function has invalid brace structure.",
      );
      return;
    }

    const nextCode =
      finalCode.slice(0, range.startIndex) +
      replacementFn.trimEnd() +
      "\n" +
      finalCode.slice(range.endIndexExclusive);

    setFinalCode(nextCode);
    toast.success("Fix applied successfully!");
  };

  const handleApply = (opts: {
    remediation?: FindingRemediation;
    patch?: FindingPatch;
    findingLineStart: number;
  }) => {
    if (opts.remediation) {
      applyRemediation(opts.remediation, opts.findingLineStart);
      return;
    }
    if (opts.patch) {
      applyPatch(opts.patch);
      return;
    }

      toast.warning(
        "Auto-apply unavailable: no remediation data available. Please re-run Analyze.",
      );
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
        const remediationObj = remediation as any;
        const remediationMode = remediationObj?.mode as
          | FindingRemediation["mode"]
          | undefined;
        const remediationData: FindingRemediation | undefined =
          remediationMode === "line" || remediationMode === "function"
            ? (remediationObj as FindingRemediation)
            : undefined;

        const patch = remediationObj?.patch as FindingPatch | undefined;
        const suggestedCode =
          remediationObj?.suggested_code ??
          (reasoning_trace as any)?.vulnerability?.suggested_code;

        const label =
          remediationData?.mode === "line"
            ? `line ${remediationData.line}`
            : remediationData?.mode === "function"
              ? `function ${remediationData.function_name}`
              : patch
                ? `${patch.op} lines ${patch.start_line}-${patch.end_line}`
                : null;

        const displayStart =
          remediationData?.mode === "line"
            ? remediationData.line
            : remediationData?.mode === "function"
              ? line_start
              : patch?.start_line ?? line_start;

        const displayBody =
          remediationData?.mode === "line"
            ? remediationData.replacement_line
            : remediationData?.mode === "function"
              ? remediationData.replacement_function
              : patch?.op === "delete"
                ? getSnippet(patch.start_line, patch.end_line)
                : patch?.replacement ?? suggestedCode ?? "";

        const canApply = !!remediationData || !!patch;

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
                {label && (
                  <span className="ml-1 text-[10px] font-medium text-mist-400">
                    ({label})
                  </span>
                )}
              </div>

              <div className="border border-primary">
                <SyntaxHighlighter
                  language="solidity"
                  style={darcula}
                  showLineNumbers
                  startingLineNumber={displayStart}
                  customStyle={{
                    margin: 0,
                    padding: "0.5rem",
                    fontSize: "10px",
                    background: "rgba(0,0,0,0.3)",
                  }}
                >
                  {displayBody}
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
                disabled={!canApply}
                onClick={() => {
                  setChosenFindings((prev) => [...prev, uuid]);
                  handleApply({
                    remediation: remediationData,
                    patch,
                    findingLineStart: line_start,
                  });
                }}
                title={
                  canApply
                    ? "Apply fix"
                    : "Auto-apply needs remediation data. Please re-run Analyze."
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
