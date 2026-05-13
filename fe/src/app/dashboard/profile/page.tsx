"use client";

import useQueryMeProfile from "./hooks/use-query-me-profile";
import truncateWallet from "@/shared/lib/helpers/trucateWalletAddress";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";

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

const ProfilePage = () => {
  const { data, isLoading, isError, error } = useQueryMeProfile();

  return (
    <main className="flex h-full flex-col space-y-6 p-6">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-sm text-mist-500">Ringkasan akun dan submission kamu.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-mist-900/50 p-6 text-sm text-mist-400">
          Loading profile...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          Gagal load profile:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      ) : !data ? (
        <div className="rounded-xl border bg-mist-900/50 p-6 text-sm text-mist-400">
          Data profile tidak ditemukan.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border bg-mist-900/50 backdrop-blur-sm">
            <CardHeader className="border-b">
              <CardTitle>Account</CardTitle>
              <CardDescription>Info dasar user dari endpoint /me/profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist-400">Wallet</span>
                <span className="font-medium">{truncateWallet(data.wallet_address)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist-400">UUID</span>
                <span className="font-mono text-xs">{data.uuid}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist-400">Role</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize",
                    data.is_admin
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                      : "border-mist-600 bg-mist-800/40 text-mist-200",
                  )}
                >
                  {data.is_admin ? "admin" : "user"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist-400">Created</span>
                <span className="text-xs text-mist-200">
                  {formatRelativeTime(data.created_at)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist-400">Updated</span>
                <span className="text-xs text-mist-200">
                  {formatRelativeTime(data.updated_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-mist-900/50 backdrop-blur-sm">
            <CardHeader className="border-b">
              <CardTitle>My Findings</CardTitle>
              <CardDescription>
                Daftar temuan (auditor_findings) yang ter-link ke akun kamu.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-mist-800 hover:bg-transparent">
                    <TableHead className="w-[320px]">Finding</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Reward</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.auditor_findings?.length ? (
                    data.auditor_findings.map((f) => (
                      <TableRow
                        key={f.uuid}
                        className="border-b border-mist-800 transition-colors hover:bg-white/5"
                      >
                        <TableCell className="align-top">
                          <div className="flex flex-col">
                            <span className="line-clamp-1 font-medium">
                              {f.title}
                            </span>
                            <span className="text-[10px] text-mist-400">
                              Contract ID: {f.contract_id ?? "-"} · Lines:{" "}
                              {f.line_start ?? "-"} - {f.line_end ?? "-"}
                            </span>
                            {f.submitted_at ? (
                              <span className="text-[10px] text-mist-500">
                                Dikirim {formatRelativeTime(f.submitted_at)} yang lalu
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize",
                              getSeverityBadgeClass(f.severity),
                            )}
                          >
                            {f.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="outline"
                            className="capitalize text-[10px]"
                          >
                            {f.review_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-right tabular-nums">
                          {f.reward_amount ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground italic"
                      >
                        Belum ada finding.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
};

export default ProfilePage;
