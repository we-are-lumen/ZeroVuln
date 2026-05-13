"use client";

import BrandLogo from "@/shared/components/ui/brand-logo";
import Link from "next/link";
import { navItems } from "../constants/nav-items";
import NavItem from "./nav-item";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";

function truncateWallet(wallet: string) {
  if (!wallet) return "";
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

const DashboardNavbar = () => {
  const [wallet, setWallet] = useState<string>("");

  const walletShort = useMemo(() => truncateWallet(wallet), [wallet]);

  useEffect(() => {
    const stored = localStorage.getItem("walletAddress") || "";
    setWallet(stored);

    const ethereum = (window as any).ethereum as
      | { on?: (e: string, fn: (...args: any[]) => void) => void; removeListener?: (e: string, fn: (...args: any[]) => void) => void }
      | undefined;
    if (!ethereum?.on) return;

    const onAccountsChanged = (accounts: string[]) => {
      const next = accounts?.[0] || "";
      if (next) {
        localStorage.setItem("walletAddress", next);
      } else {
        localStorage.removeItem("walletAddress");
      }
      setWallet(next);
    };

    ethereum.on("accountsChanged", onAccountsChanged);
    return () => ethereum.removeListener?.("accountsChanged", onAccountsChanged);
  }, []);

  const handleDisconnect = () => {
    localStorage.removeItem("walletAddress");
    // biar guard dashboard auto redirect
    window.location.href = "/";
  };

  const renderNavItems = () =>
    navItems.map((props, index) => <NavItem key={index} {...props} />);

  return (
    <nav className="flex items-center justify-between border-b px-6 py-3">
      <Link href="/" className="text-primary">
        <BrandLogo size={32} />
      </Link>

      <div className="flex items-center">{renderNavItems()}</div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border px-4 py-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75 delay-500 duration-1000"></span>
            <span className="relative inline-flex size-2 rounded-full bg-green-500"></span>
          </span>
          <p className="text-sm">{walletShort || "-"}</p>
        </div>

        <Button size="sm" variant="outline" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </div>
    </nav>
  );
};

export default DashboardNavbar;
