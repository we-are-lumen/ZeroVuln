"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ensureOgGalileoChain } from "@/shared/lib/wallet/og-galileo";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
};

/**
 * Guard simpel berbasis localStorage.
 * - Kalau belum connect wallet → lempar balik ke "/"
 * - Kalau sudah connect → biarkan halaman render normal
 */
export default function WalletGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const wallet = localStorage.getItem("walletAddress");
    if (!wallet) {
      router.replace("/");
      return;
    }

    const ethereum = (window as any).ethereum as Eip1193Provider | undefined;
    if (!ethereum) return;

    // Pastikan chain sesuai 0G Galileo testnet
    ensureOgGalileoChain(ethereum).catch(() => {
      // Jika gagal switch/add network, balik ke root supaya user bisa connect ulang
      router.replace("/");
    });
  }, [router]);

  return <>{children}</>;
}
