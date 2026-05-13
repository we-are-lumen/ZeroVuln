"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ensureOgGalileoChain } from "@/shared/lib/wallet/og-galileo";
import type { Eip1193Provider } from "@/shared/types/eip1193.type";

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

    const ethereum: Eip1193Provider | undefined = window.ethereum;
    if (!ethereum) return;

    // Pastikan chain sesuai 0G Galileo testnet
    ensureOgGalileoChain(ethereum).catch(() => {
      // Jika gagal switch/add network, balik ke root supaya user bisa connect ulang
      router.replace("/");
    });
  }, [router]);

  return <>{children}</>;
}
