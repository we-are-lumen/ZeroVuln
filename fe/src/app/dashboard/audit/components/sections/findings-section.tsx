"use client";

import { Badge } from "@/shared/components/ui/badge";
import useQueryAuditorFinding from "../../hooks/use-query-auditor-finding";
import { cn } from "@/shared/lib/utils";
import { AuditorFindingSeverity } from "@/shared/types/auditor-finding.type";
import { useSearchParams } from "next/navigation";
import useQueryContractCatalogDetail from "../../hooks/use-query-contract-catalog-detail";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/prism";

const FindingsSection = () => {
  const searchParams = useSearchParams();
  const selectedScId = searchParams.get("selected_sc");

  const { data: code } = useQueryContractCatalogDetail(selectedScId ?? "");
  const { data: findings } = useQueryAuditorFinding();

  // Helper to extract specific lines for the snippet
  const getVulnerableSnippet = (start: number, end: number | null) => {
    if (!code?.source_code) return "";

    // Line numbers in your data shape are 1-based
    const relevantLines = code.source_code.filter(
      (l) => l.line >= start && l.line <= (end ?? start),
    );

    return relevantLines.map((l) => l.code).join("\n");
  };

  const getCardClassNames = (severity: AuditorFindingSeverity) => {
    switch (severity) {
      case "high":
        return "border-rose-500/70 bg-rose-500/10";
      case "medium":
        return "border-amber-500/70 bg-amber-500/10";
      case "low":
        return "border-blue-500/70 bg-blue-500/10";
      default:
        return "border-zinc-700/70 bg-zinc-900";
    }
  };

  const getBadgeClassNames = (severity: AuditorFindingSeverity) => {
    switch (severity) {
      case "high":
        return "bg-rose-500/70";
      case "medium":
        return "bg-amber-500/70";
      case "low":
        return "bg-sky-500/70";
      default:
        return "bg-zinc-500/70";
    }
  };

  const renderCards = () =>
    findings?.map(
      ({
        uuid,
        title,
        description,
        severity,
        line_start,
        line_end,
        review_status,
      }) => {
        const snippet = getVulnerableSnippet(line_start, line_end);

        return (
          <div
            key={uuid}
            className={cn(
              "space-y-3 rounded-md border p-3",
              getCardClassNames(severity),
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="line-clamp-1 text-sm leading-tight font-semibold">
                {title}
              </h4>
              <div className="space-x-2">
                <Badge
                  variant="outline"
                  className={cn("text-[10px] font-bold capitalize")}
                >
                  {review_status}
                </Badge>
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
                  {line_start} {line_end ? `- ${line_end}` : null}
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
          </div>
        );
      },
    );

  return (
    <section className="flex h-full basis-[25%] flex-col rounded-lg border bg-mist-900/50 backdrop-blur-sm">
      <div className="border-b px-6 py-3">
        <h3 className="text-sm font-bold text-mist-400">FINDINGS</h3>
      </div>
      <div className="grow space-y-4 overflow-y-auto p-4">
        {!selectedScId ? (
          <p className="py-10 text-center text-xs text-zinc-500 italic">
            Select a contract to see associated findings
          </p>
        ) : (
          renderCards()
        )}
      </div>
    </section>
  );
};

export default FindingsSection;
