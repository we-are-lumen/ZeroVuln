"use client";

import type { Eip1193Provider } from "@/shared/types/eip1193.type";

export type OgNetworkName = "mainnet" | "testnet";

function envOrDefault(name: string, fallback: string): string {
  const v = process.env[name];
  return (v && String(v).trim()) || fallback;
}

export const OG_MAINNET_CHAIN = {
  chainIdDec: 16661,
  chainIdHex: "0x4115",
  chainName: "0G Mainnet",
  rpcUrls: [envOrDefault("NEXT_PUBLIC_OG_RPC_URL_MAINNET", "https://evmrpc.0g.ai")],
  blockExplorerUrls: [
    envOrDefault("NEXT_PUBLIC_OG_EXPLORER_URL_MAINNET", "https://chainscan.0g.ai"),
  ],
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
} as const;

export const OG_GALILEO_CHAIN = {
  chainIdDec: 16602,
  chainIdHex: "0x40da",
  chainName: "0G Galileo Testnet",
  rpcUrls: [
    envOrDefault("NEXT_PUBLIC_OG_RPC_URL_TESTNET", "https://evmrpc-testnet.0g.ai"),
  ],
  blockExplorerUrls: [
    envOrDefault(
      "NEXT_PUBLIC_OG_EXPLORER_URL_TESTNET",
      "https://chainscan-galileo.0g.ai",
    ),
  ],
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
} as const;

function resolveTargetNetwork(): OgNetworkName {
  const raw = (process.env.NEXT_PUBLIC_OG_NETWORK || "").toLowerCase().trim();
  if (raw === "testnet" || raw === "galileo") return "testnet";
  return "mainnet"; // default: mainnet (requested)
}

export function getOgChain(network?: OgNetworkName) {
  const n = network ?? resolveTargetNetwork();
  return n === "testnet" ? OG_GALILEO_CHAIN : OG_MAINNET_CHAIN;
}

export async function ensureOgChain(
  ethereum: Eip1193Provider,
  network?: OgNetworkName,
) {
  const chain = getOgChain(network);
  const current = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === chain.chainIdHex) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainIdHex }],
    });
  } catch (err: unknown) {
    // 4902 = unknown chain → coba add network dulu
    const e = err as { code?: number };
    if (e?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chain.chainIdHex,
            chainName: chain.chainName,
            rpcUrls: [...chain.rpcUrls],
            blockExplorerUrls: [...chain.blockExplorerUrls],
            nativeCurrency: { ...chain.nativeCurrency },
          },
        ],
      });
      // Setelah add, switch lagi
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.chainIdHex }],
      });
      return;
    }
    throw err;
  }
}
