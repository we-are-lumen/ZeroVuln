"use client";

import { BrowserProvider, ContractFactory, type InterfaceAbi } from "ethers";

import type { Eip1193Provider } from "@/shared/types/eip1193.type";
import { ensureOgGalileoChain, OG_GALILEO_CHAIN } from "../wallet/og-galileo";

type DeployResult = {
  address: string;
  txHash?: string;
  explorerUrl?: string;
};

type CompileResponse = {
  abi: unknown[];
  bytecode: string; // 0x...
  constructorInputs: { name?: string; type?: string }[];
};

function getEthereum(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

async function compileOnServer(source: string): Promise<CompileResponse> {
  const res = await fetch("/api/solidity/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = (text || "").trim();

    // Simple UX: bila ada import/library yang belum bisa di-resolve, tampilkan copywriting yang jelas.
    const looksLikeImportIssue =
      /File import callback not supported/i.test(msg) ||
      /Source\s+".*"\s+not found/i.test(msg) ||
      /Import tidak ditemukan:/i.test(msg) ||
      /Cannot find module/i.test(msg);

    if (looksLikeImportIssue) {
      throw new Error(
        "Deploy failed: imported libraries aren’t supported yet. Please use a single-file contract (no imports).",
      );
    }

    throw new Error(msg || `Compile gagal (HTTP ${res.status})`);
  }

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object") {
    throw new Error("Response compile tidak valid.");
  }
  const d = data as Partial<CompileResponse>;
  if (!Array.isArray(d.abi)) throw new Error("Response compile tidak punya ABI.");
  if (typeof d.bytecode !== "string" || !d.bytecode.startsWith("0x")) {
    throw new Error("Response compile tidak punya bytecode.");
  }
  if (!Array.isArray(d.constructorInputs)) d.constructorInputs = [];
  return d as CompileResponse;
}

export async function deploySolidityContractFromSource(
  source: string,
): Promise<DeployResult> {
  if (!source?.trim()) throw new Error("Source code kosong.");

  const ethereum = getEthereum();
  if (!ethereum) {
    throw new Error("Wallet provider tidak ditemukan. Install MetaMask dulu.");
  }

  await ensureOgGalileoChain(ethereum);

  // Hindari compile di browser (solc butuh Node 'fs'). Compile kita jalankan via Next API route.
  const { abi, bytecode, constructorInputs } = await compileOnServer(source);
  if (constructorInputs.length > 0) {
    const sig = constructorInputs
      .map((i) => `${i?.name || "arg"}:${i?.type || "unknown"}`)
      .join(", ");
    throw new Error(
      `Constructor butuh parameter (${sig}). Saat ini UI Deploy belum mendukung input constructor args.`,
    );
  }

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const factory = new ContractFactory(abi as unknown as InterfaceAbi, bytecode, signer);

  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = tx?.hash;
  const explorerBase = OG_GALILEO_CHAIN.blockExplorerUrls?.[0];

  return {
    address,
    txHash,
    explorerUrl: explorerBase ? `${explorerBase}/address/${address}` : undefined,
  };
}
