import BrandLogo from "@/shared/components/ui/brand-logo";
import { Button } from "@/shared/components/ui/button";
import { APP_PATH } from "@/shared/constants/app-path";
import { Wallet03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { ensureOgChain } from "@/shared/lib/wallet/og-chain";
import { api } from "@/api/client";
import type { Eip1193Provider } from "@/shared/types/eip1193.type";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function getEthereum(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

const LandingNavbar = () => {
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);

  const hasWallet = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(localStorage.getItem("walletAddress"));
  }, []);

  useEffect(() => {
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
      })) as unknown as string[];

      await ensureOgChain(ethereum);

      const wallet = accounts?.[0];
      if (!wallet) throw new Error("Tidak ada akun wallet yang dipilih.");

      localStorage.setItem("walletAddress", wallet);

      try {
        await api.get("me").json();
      } catch (e: unknown) {
        console.error(e);
        localStorage.removeItem("walletAddress");
        alert(
          "Connect wallet berhasil, tapi gagal handshake ke backend (/me). Pastikan backend jalan dan env FE sudah benar.",
        );
        return;
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Gagal connect wallet.";
      alert(message);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <nav className="sticky top-0 z-20 flex items-center justify-between bg-mist-950/80 px-20 py-3 backdrop-blur-md">
      <Link href={APP_PATH.landing}>
        <BrandLogo className="text-primary" />
      </Link>

      <div className="space-x-2 text-mist-400">
        <Link
          href="/"
          className="px-4 py-2 transition-all duration-300 hover:text-white"
        >
          Benefits
        </Link>
        <Link
          href="/"
          className="px-4 py-2 transition-all duration-300 hover:text-white"
        >
          Specifications
        </Link>
        <Link
          href="/"
          className="px-4 py-2 transition-all duration-300 hover:text-white"
        >
          How-to
        </Link>
        <Link
          href="/"
          className="px-4 py-2 transition-all duration-300 hover:text-white"
        >
          Contact Us
        </Link>
      </div>

      <Button onClick={handleConnect} disabled={isConnecting}>
        <HugeiconsIcon icon={Wallet03Icon} strokeWidth={2} size={24} />
        Connect Wallet
      </Button>
    </nav>
  );
};

export default LandingNavbar;
