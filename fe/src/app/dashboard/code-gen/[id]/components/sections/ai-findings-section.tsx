import { Shield02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useParams } from "next/navigation";
import useQueryContractDetail from "../../hooks/use-query-contract-detail";
import { useMemo } from "react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { AuditorFindingSeverity } from "@/shared/types/auditor-finding.type";
import SyntaxHighlighter from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/hljs";

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

const AiFindingsSection = () => {
  const params = useParams();
  const contractId = params.id?.toString() ?? "";
  const { data, isLoading } = useQueryContractDetail(contractId);

  const findings = useMemo(() => {
    if (!data?.audits) return [];

    const findings = data.audits.flatMap(({ ai_findings }) => ai_findings);

    return findings;
  }, [data]);

  const getSnippet = (start: number, end: number | null) => {
    if (!data?.source_code) return "";

    const relevantLines = data.source_code.filter(
      (l) => l.line >= start && l.line <= (end ?? start),
    );

    return relevantLines.map((l) => l.code).join("\n");
  };

  const renderCards = () =>
    findings.map(
      ({ uuid, title, description, severity, line_start, line_end }) => {
        const snippet = getSnippet(line_start, line_end);
        const isMultiLine = line_end !== line_start;

        return (
          <div key={uuid} className={cn("space-y-3 rounded-lg border p-3")}>
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
    <section className="flex h-full basis-[30%] flex-col rounded-2xl border bg-mist-900/50">
      <div className="border-b p-3">
        <div className="flex items-center gap-2 text-mist-400">
          <HugeiconsIcon icon={Shield02Icon} size={20} strokeWidth={2} />
          <h3 className="text-sm font-bold">AI MITIGATIONS</h3>
        </div>
      </div>
      <div className="h-full space-y-3 overflow-y-auto p-3">
        {isLoading && renderSkeleton()}
        {!isLoading && renderCards()}
      </div>
    </section>
  );
};

export default AiFindingsSection;
