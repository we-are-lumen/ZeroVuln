"use client";

import useQueryMeProfile from "./hooks/use-query-me-profile";
import { useClaimZvReward, useQueryZvClaimableReward } from "./hooks/use-zv-reward";
import truncateWallet from "@/shared/lib/helpers/trucateWalletAddress";
import formatRelativeTime from "@/shared/lib/helpers/formatRelativeTime";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
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
import { formatEther } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    const wallet = localStorage.getItem("walletAddress");
    setWalletAddress(wallet);
  }, []);

  const {
    data: claimableWei,
    isLoading: isClaimableLoading,
    isError: isClaimableError,
    error: claimableError,
  } = useQueryZvClaimableReward(walletAddress);
  const { mutateAsync: claim, isPending: isClaiming } =
    useClaimZvReward(walletAddress);

  const claimable0g = useMemo(() => {
    if (!claimableWei) return "0";
    return Number(formatEther(claimableWei)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  }, [claimableWei]);

  const findings = data?.auditor_findings ?? [];
  const totalFindings = findings.length;
  const totalReward = findings.reduce((sum, f) => sum + (f.reward_amount ?? 0), 0);

  const statusCount = findings.reduce<Record<string, number>>((acc, f) => {
    const key = (f.review_status || "unknown").toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const latestFindings = [...findings]
    .sort((a, b) => {
      const at = new Date(a.submitted_at ?? a.created_at).getTime();
      const bt = new Date(b.submitted_at ?? b.created_at).getTime();
      return bt - at;
    })
    .slice(0, 10);

  return (
    <main className="flex h-full flex-col space-y-6 p-6">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-sm text-mist-500">
            Ringkasan akun dan kontribusi kamu.
          </p>
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border bg-mist-900/50 backdrop-blur-sm">
              <CardHeader className="border-b">
                <CardTitle>Account</CardTitle>
                <CardDescription>Informasi akun kamu.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-mist-400">Wallet address</span>
                  <span className="font-mono text-xs">
                    {data.wallet_address || "-"}
                  </span>
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
                  <span className="text-xs text-mist-400">Account age</span>
                  <span className="text-xs text-mist-200">
                    {formatRelativeTime(data.created_at)} yang lalu
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-mist-400">Wallet (short)</span>
                  <span className="text-xs text-mist-200">
                    {truncateWallet(data.wallet_address)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border bg-mist-900/50 backdrop-blur-sm">
              <CardHeader className="border-b">
                <CardTitle>Contributions</CardTitle>
                <CardDescription>
                  Ringkasan kontribusi finding kamu.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-mist-800 bg-mist-950/40 p-3">
                    <p className="text-xs text-mist-400">Total findings</p>
                    <p className="text-xl font-bold">{totalFindings}</p>
                  </div>
                  <div className="rounded-lg border border-mist-800 bg-mist-950/40 p-3">
                    <p className="text-xs text-mist-400">Total reward</p>
                    <p className="text-xl font-bold tabular-nums">
                      {totalReward.toLocaleString()} 0g
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {Object.entries(statusCount)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <Badge
                        key={status}
                        variant="outline"
                        className="capitalize"
                      >
                        {status}: {count}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border bg-mist-900/50 backdrop-blur-sm">
            <CardHeader className="border-b">
              <CardTitle>Rewards (On-chain)</CardTitle>
              <CardDescription>
                Reward yang bisa kamu claim dari ZVContract.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-xs text-mist-400">Claimable</p>
                {isClaimableLoading ? (
                  <p className="text-sm text-mist-400">Loading...</p>
                ) : isClaimableError ? (
                  <p className="text-sm text-destructive">
                    {claimableError instanceof Error
                      ? claimableError.message
                      : "Gagal load claimable reward."}
                  </p>
                ) : (
                  <p className="text-xl font-bold tabular-nums">{claimable0g} 0g</p>
                )}
              </div>

              <Button
                onClick={async () => {
                  try {
                    await toast.promise(claim(), {
                      loading: "Mengirim transaksi claim...",
                      success: () => "Claim berhasil.",
                      error: (err: unknown) =>
                        err instanceof Error ? err.message : "Claim gagal.",
                    });
                  } catch {
                    // toast handle
                  }
                }}
                disabled={
                  isClaiming ||
                  !walletAddress ||
                  isClaimableLoading ||
                  Boolean(isClaimableError) ||
                  !claimableWei ||
                  claimableWei === 0n
                }
              >
                {isClaiming ? "Claiming..." : "Claim"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border bg-mist-900/50 backdrop-blur-sm">
            <CardHeader className="border-b">
              <CardTitle>Aktivitas terbaru</CardTitle>
              <CardDescription>
                Menampilkan {latestFindings.length} temuan terbaru.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-mist-800 hover:bg-transparent">
                    <TableHead>Finding</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Reward</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestFindings.length ? (
                    latestFindings.map((f) => (
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
                              Contract ID: {f.contract_id ?? "-"} ·{" "}
                              {f.submitted_at
                                ? `Dikirim ${formatRelativeTime(f.submitted_at)} yang lalu`
                                : `Dibuat ${formatRelativeTime(f.created_at)} yang lalu`}
                            </span>
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
                          {(f.reward_amount ?? 0)
                            ? `${f.reward_amount?.toLocaleString()} 0g`
                            : "-"}
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
