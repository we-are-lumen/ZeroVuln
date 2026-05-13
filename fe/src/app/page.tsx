"use client";

import { Button } from "@/shared/components/ui/button";
import { ensureOgGalileoChain } from "@/shared/lib/wallet/og-galileo";
import { api } from "@/api/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
};

function getEthereum(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).ethereum as Eip1193Provider | undefined;
}

export default function Home() {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);

  const hasWallet = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(localStorage.getItem("walletAddress"));
  }, []);

  useEffect(() => {
    // Kalau sudah connect, langsung arahkan ke /dashboard
    if (hasWallet) router.replace("/dashboard");
  }, [hasWallet, router]);

  async function handleConnect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      alert("Wallet provider tidak ditemukan. Install MetaMask dulu.");
      return;
    }

    try {
      setIsConnecting(true);
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      await ensureOgGalileoChain(ethereum);

      const wallet = accounts?.[0];
      if (!wallet) throw new Error("Tidak ada akun wallet yang dipilih.");

      localStorage.setItem("walletAddress", wallet);

      // Handshake ke backend supaya user langsung ter-upsert di table `users`
      // (BE akan memanggil resolveUser() saat endpoint /me dipanggil).
      try {
        await api.get("me").json();
      } catch (e: any) {
        console.error(e);
        localStorage.removeItem("walletAddress");
        alert(
          "Connect wallet berhasil, tapi gagal handshake ke backend (/me). Pastikan backend jalan dan env FE sudah benar."
        );
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Gagal connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-6">
        <h1 className="text-2xl font-bold">ZeroVuln</h1>
        <p className="mt-2 text-sm text-mist-500">
          Connect wallet untuk mulai menggunakan dashboard.
        </p>

        <div className="mt-6">
          <Button className="w-full" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </Button>
        </div>
      </div>
    </main>
  );
}
