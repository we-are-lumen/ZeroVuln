"use client";

import { useMemo, useState } from "react";
import { formatEther } from "ethers";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";

import {
  useFundZvTreasury,
  useQueryZvTreasuryBalance,
} from "./hooks/use-zv-treasury";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ZV_CONTRACT_ADDRESS;

export default function AdminTreasuryPage() {
  const {
    data: balanceWei,
    isLoading,
    isError,
    error,
  } = useQueryZvTreasuryBalance();
  const { mutateAsync: fund, isPending } = useFundZvTreasury();

  const [amount, setAmount] = useState("1");

  const balance0g = useMemo(() => {
    if (!balanceWei) return "0";
    return Number(formatEther(balanceWei)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  }, [balanceWei]);

  return (
    <main className="flex h-full flex-col space-y-6 p-6">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Treasury</h1>
          <p className="text-sm text-mist-500">
            Top up ZVContract balance to pay claimable rewards.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border bg-mist-900/50 backdrop-blur-sm">
          <CardHeader className="border-b">
            <CardTitle>Contract</CardTitle>
            <CardDescription>
              Essential ZVContract details to power your reward claims.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-mist-400">Address</span>
              <span className="font-mono text-xs">
                {CONTRACT_ADDRESS || "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-mist-400">Balance</span>
              {isLoading ? (
                <span className="text-xs text-mist-400">Loading...</span>
              ) : isError ? (
                <span className="text-xs text-destructive">
                  {error instanceof Error
                    ? error.message
                    : "Gagal load balance."}
                </span>
              ) : (
                <span className="text-sm font-bold tabular-nums">
                  {balance0g} 0g
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border bg-mist-900/50 backdrop-blur-sm">
          <CardHeader className="border-b">
            <CardTitle>Send Fund</CardTitle>
            <CardDescription>
              Send 0G from admin wallet to smart contract.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs text-mist-400">Amount (0G)</p>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <Button
              onClick={async () => {
                try {
                  const v = Number(amount);
                  if (!amount || Number.isNaN(v) || v <= 0) {
                    toast.error("Amount harus lebih dari 0.");
                    return;
                  }

                  await toast.promise(fund(amount), {
                    loading: "Mengirim transaksi fund...",
                    success: () => "Fund berhasil.",
                    error: (err: unknown) =>
                      err instanceof Error ? err.message : "Fund gagal.",
                  });
                } catch {
                  // toast handle
                }
              }}
              disabled={isPending || !CONTRACT_ADDRESS}
            >
              {isPending ? "Sending..." : "Send Fund"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
