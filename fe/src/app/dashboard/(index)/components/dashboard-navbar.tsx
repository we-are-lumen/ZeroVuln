/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import BrandLogo from "@/shared/components/ui/brand-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import truncateWallet from "@/shared/lib/helpers/trucateWalletAddress";
import { Logout01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { navItems } from "../constants/nav-items";
import NavItem from "./nav-item";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon } from "@hugeicons/core-free-icons";
import type { Eip1193Provider } from "@/shared/types/eip1193.type";
import { APP_PATH } from "@/shared/constants/app-path";

function truncateWallet(wallet: string) {
  if (!wallet) return "";
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

const DashboardNavbar = () => {
  const [wallet, setWallet] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("walletAddress") || "";
  });

  const walletShort = useMemo(() => truncateWallet(wallet), [wallet]);

  useEffect(() => {
    const ethereum: Eip1193Provider | undefined = window.ethereum;
    if (!ethereum?.on) return;

    const onAccountsChanged = (accounts: unknown) => {
      const next =
        Array.isArray(accounts) && typeof accounts[0] === "string"
          ? accounts[0]
          : "";
      if (next) {
        localStorage.setItem("walletAddress", next);
      } else {
        localStorage.removeItem("walletAddress");
      }
      setWallet(next);
    };

    ethereum.on("accountsChanged", onAccountsChanged);
    return () =>
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
  }, []);

  const handleDisconnect = () => {
    localStorage.removeItem("walletAddress");
    window.location.href = "/";
  };

  const renderNavItems = () =>
    navItems.map((props, index) => <NavItem key={index} {...props} />);

  return (
    <nav className="flex items-center justify-between border-b border-mist-800 bg-background px-6 py-3">
      <Link href="/" className="text-primary">
        <BrandLogo size={32} />
      </Link>

      <div className="flex items-center">{renderNavItems()}</div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex cursor-pointer items-center gap-2 rounded-md border border-mist-800 px-4 py-2 transition-colors hover:bg-mist-900/50">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75 delay-500 duration-1000"></span>
                <span className="relative inline-flex size-2 rounded-full bg-green-500"></span>
              </span>
              <p className="font-mono text-sm">{walletShort || "-"}</p>
            </div>
          </DropdownMenuTrigger>

        <Button
          size="icon-sm"
          variant="outline"
          onClick={handleDisconnect}
          aria-label="Disconnect wallet"
          title="Disconnect"
        >
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
        </Button>
          <DropdownMenuContent
            align="end"
            className="w-48 border-mist-800 bg-mist-950 text-white"
          >
            <DropdownMenuItem className="cursor-pointer">
              <Link
                href={APP_PATH.dashboard.profile}
                className="flex w-full items-center gap-2"
              >
                <HugeiconsIcon icon={UserIcon} size={16} />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDisconnect}
              className="flex cursor-pointer items-center gap-2 text-rose-500 focus:bg-rose-500/10 focus:text-rose-500"
            >
              <HugeiconsIcon icon={Logout01Icon} size={16} />
              <span>Disconnect</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
};

export default DashboardNavbar;
