/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { cn } from "@/shared/lib/utils";
import {
  Cancel01Icon,
  CodeIcon,
  Copy01Icon,
  PackageOpenIcon,
  Tick02FreeIcons,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import useQueryAdminReviewAuditorFinding, {
  ADMIN_REVIEW_AUDITOR_FINDING_QUERY_KEY,
} from "./hooks/use-query-admin-review-author-findings";
import truncateWallet from "@/shared/lib/helpers/trucateWalletAddress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { darcula } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useApproveAditorFinding } from "./hooks/use-approve-auditor-finding";
import { useRejectAditorFinding } from "./hooks/use-reject-auditor-finding";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import StatusFilter from "./components/status-filter";
import { useSearchParams } from "next/navigation";

type ConfirmAction = {
  type: "approve" | "reject";
  uuid: string;
  title: string;
} | null;

const truncateHash = (hash: string) => {
  if (!hash) return "-";
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};

const getSeverityBadgeClass = (severity: string) => {
  switch (severity.toLowerCase()) {
    case "critical":
      return "border-purple-500 bg-purple-500/10 text-purple-500";
    case "high":
      return "border-rose-500 bg-rose-500/10 text-rose-500";
    case "medium":
      return "border-amber-500 bg-amber-500/10 text-amber-500";
    case "low":
      return "border-blue-500 bg-blue-500/10 text-blue-500";
    default:
      return "border-zinc-500 bg-zinc-500/10 text-zinc-500";
  }
};

const getFormattedCode = (sourceCodeArray: any[]) => {
  return sourceCodeArray?.map((lineObj) => lineObj.code).join("\n") || "";
};

const AdminDashboardPage = () => {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const reviewStatus = searchParams.get("status") ?? "submitted";

  const { data, isLoading } = useQueryAdminReviewAuditorFinding(reviewStatus);
  const { mutateAsync: approve } = useApproveAditorFinding();
  const { mutateAsync: reject } = useRejectAditorFinding();

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [inspectedFinding, setInspectedFinding] = useState<any | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const handleExecuteAction = async () => {
    if (!confirmAction) return;

    const { uuid, type } = confirmAction;

    setMutatingId(uuid);
    setConfirmAction(null);

    const actionPromise = type === "approve" ? approve(uuid) : reject(uuid);

    toast.promise(actionPromise, {
      loading: `${type === "approve" ? "Approving" : "Rejecting"} finding...`,
      success: () => {
        queryClient.invalidateQueries({
          queryKey: [ADMIN_REVIEW_AUDITOR_FINDING_QUERY_KEY],
        });
        return `Finding ${type === "approve" ? "approved" : "rejected"} successfully`;
      },
      error: (err: any) =>
        `Failed to ${type}: ${err.message || "Unknown error"}`,
      finally: () => {
        setMutatingId(null);
      },
    });
  };

  return (
    <main className="flex h-full flex-col space-y-6 p-6">
      <div className="mb-6 flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Findings</h1>
          <p className="text-sm text-mist-500">
            Review and manage security vulnerabilities submitted by auditors.
          </p>
        </div>
      </div>
      <StatusFilter />

      <div className="rounded-md border bg-mist-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-mist-800 hover:bg-transparent">
              <TableHead className="w-[300px]">Finding</TableHead>
              <TableHead>Target Contract</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Submitter</TableHead>
              <TableHead>Deployment Hash</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading findings...
                </TableCell>
              </TableRow>
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground italic"
                >
                  <div className="flex h-32 flex-col items-center justify-center gap-4">
                    <HugeiconsIcon icon={PackageOpenIcon} size={44} />
                    <p>No findings found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((finding) => (
                <TableRow
                  key={finding.uuid}
                  className="border-b border-mist-800 transition-colors hover:bg-white/5"
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="line-clamp-1">{finding.title}</span>
                      <span className="text-[10px] text-mist-400">
                        Lines: {finding.line_start} - {finding.line_end}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col">
                      <span className="line-clamp-1">
                        {finding.contracts?.name}
                      </span>
                      <span className="text-[10px] text-mist-400 capitalize">
                        {finding.contracts?.language}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        getSeverityBadgeClass(finding.severity),
                      )}
                    >
                      {finding.severity}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setInspectedFinding(finding)}
                    >
                      <HugeiconsIcon icon={CodeIcon} />
                      <span>See Detail</span>
                    </Button>
                  </TableCell>

                  <Dialog
                    open={!!inspectedFinding}
                    onOpenChange={(open) => !open && setInspectedFinding(null)}
                  >
                    <DialogContent
                      aria-describedby=""
                      className="flex max-h-[80vh] w-fit flex-col"
                    >
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <span>{inspectedFinding?.title}</span>
                        </DialogTitle>
                      </DialogHeader>

                      <div className="space-y-2">
                        <div className="text-mist-400">
                          <span className="font-semibold text-primary capitalize">
                            {finding.severity}
                          </span>{" "}
                          · Line{" "}
                          <span className="font-semibold text-primary">
                            {inspectedFinding?.line_start}{" "}
                            {inspectedFinding?.line_start !==
                            inspectedFinding?.line_end
                              ? `- ${inspectedFinding?.line_end}`
                              : null}
                          </span>
                        </div>

                        <p className="text-mist-400">{finding.description}</p>
                      </div>

                      <div className="relative w-[50vw] grow overflow-auto rounded-md border border-mist-800 bg-zinc-950">
                        <div className="sticky top-0 z-10 border-b border-mist-800 bg-zinc-900 px-4 py-2 font-mono text-xs text-mist-400">
                          {inspectedFinding?.contracts?.name}
                        </div>

                        <SyntaxHighlighter
                          language="solidity"
                          style={darcula}
                          showLineNumbers={true}
                          wrapLines={true}
                          lineProps={(lineNumber) => {
                            const isVulnerable =
                              lineNumber >= inspectedFinding?.line_start &&
                              lineNumber <= inspectedFinding?.line_end;

                            return {
                              style: {
                                display: "block",
                                backgroundColor: isVulnerable
                                  ? "rgba(244, 63, 94, 0.15)"
                                  : "transparent",
                                borderLeft: isVulnerable
                                  ? "4px solid #f43f5e"
                                  : "4px solid transparent",
                              },
                            };
                          }}
                          customStyle={{
                            margin: 0,
                            padding: "1rem 0",
                            fontSize: "13px",
                            background: "transparent",
                          }}
                        >
                          {getFormattedCode(
                            inspectedFinding?.contracts?.source_code,
                          )}
                        </SyntaxHighlighter>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <TableCell className="font-mono text-xs">
                    {truncateWallet(finding.users?.wallet_address)}
                  </TableCell>

                  <TableCell>
                    {finding.dataset_hash ? (
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span>{truncateHash(finding.dataset_hash)}</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            navigator.clipboard.writeText(finding.dataset_hash);
                            toast.success("Hash copied");
                          }}
                          title="Copy full hash"
                        >
                          <HugeiconsIcon
                            icon={Copy01Icon}
                            size={14}
                            strokeWidth={2}
                          />
                        </Button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {finding.review_status}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          finding.review_status !== "submitted" ||
                          mutatingId === finding.uuid
                        }
                        className="text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                        onClick={() =>
                          setConfirmAction({
                            type: "approve",
                            uuid: finding.uuid,
                            title: finding.title,
                          })
                        }
                        title="Approve"
                      >
                        <HugeiconsIcon icon={Tick02FreeIcons} size={18} />
                        <span>Approve</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          finding.review_status !== "submitted" ||
                          mutatingId === finding.uuid
                        }
                        className="text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
                        onClick={() =>
                          setConfirmAction({
                            type: "reject",
                            uuid: finding.uuid,
                            title: finding.title,
                          })
                        }
                        title="Reject"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={18} />
                        <span>Reject</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="capitalize">
              {confirmAction?.type} Finding?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {confirmAction?.type} the finding:
              <span className="mb-2 block font-semibold text-white">
                {confirmAction?.title}
              </span>
              This action will be finalized in the security audit report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecuteAction}
              className={cn(
                "capitalize",
                confirmAction?.type === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 text-white hover:bg-rose-700",
              )}
            >
              {confirmAction?.type}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default AdminDashboardPage;
