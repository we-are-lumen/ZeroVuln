"use client";

import type { Eip1193Provider } from "@/shared/types/eip1193.type";

export const OG_GALILEO_CHAIN = {
  chainIdDec: 16602,
  chainIdHex: "0x40da",
  chainName: "0G-Galileo-Testnet",
  rpcUrls: ["https://evmrpc-testnet.0g.ai"],
  blockExplorerUrls: ["https://chainscan-galileo.0g.ai"],
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
} as const;

export async function ensureOgGalileoChain(ethereum: Eip1193Provider) {
  const current = (await ethereum.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === OG_GALILEO_CHAIN.chainIdHex) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: OG_GALILEO_CHAIN.chainIdHex }],
    });
  } catch (err: unknown) {
    // 4902 = unknown chain → coba add network dulu
    const e = err as { code?: number };
    if (e?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: OG_GALILEO_CHAIN.chainIdHex,
            chainName: OG_GALILEO_CHAIN.chainName,
            rpcUrls: [...OG_GALILEO_CHAIN.rpcUrls],
            blockExplorerUrls: [...OG_GALILEO_CHAIN.blockExplorerUrls],
            nativeCurrency: { ...OG_GALILEO_CHAIN.nativeCurrency },
          },
        ],
      });
      // Setelah add, switch lagi
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: OG_GALILEO_CHAIN.chainIdHex }],
      });
      return;
    }
    throw err;
  }
}
