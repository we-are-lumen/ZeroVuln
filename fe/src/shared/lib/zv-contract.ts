import { BrowserProvider, Contract, keccak256, toUtf8Bytes } from "ethers";
import { ensureOgGalileoChain } from "./wallet/og-galileo";
import type { Eip1193Provider } from "@/shared/types/eip1193.type";

const ZV_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ZV_CONTRACT_ADDRESS;

const ZV_ABI = [
  "function featureFee() view returns (uint256)",
  "function payForFeature(uint8 feature, bytes32 refId) payable",
  "function claimableRewards(address user) view returns (uint256)",
  "function claimReward()",
];

function getEthereum(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

function requireContractAddress(): string {
  if (!ZV_CONTRACT_ADDRESS) {
    throw new Error("NEXT_PUBLIC_ZV_CONTRACT_ADDRESS belum di-set.");
  }
  return ZV_CONTRACT_ADDRESS;
}

export type ZVFeature = "CodeGen" | "Analyze";

function featureToEnum(feature: ZVFeature): number {
  // enum Feature { CodeGen, Analyze }
  return feature === "CodeGen" ? 0 : 1;
}

function toRefId(ref?: string): string {
  if (!ref) return "0x" + "00".repeat(32);
  return keccak256(toUtf8Bytes(ref));
}

export async function payForFeature(feature: ZVFeature, ref?: string) {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("Wallet provider tidak ditemukan. Install MetaMask dulu.");

  await ensureOgGalileoChain(ethereum);

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const zv = new Contract(requireContractAddress(), ZV_ABI, signer);

  const fee: bigint = await zv.featureFee();
  const tx = await zv.payForFeature(featureToEnum(feature), toRefId(ref), {
    value: fee,
  });
  await tx.wait();
  return { txHash: tx.hash, feeWei: fee };
}

export async function getClaimableRewardWei(walletAddress: string): Promise<bigint> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("Wallet provider tidak ditemukan.");

  await ensureOgGalileoChain(ethereum);

  const provider = new BrowserProvider(ethereum);
  const zv = new Contract(requireContractAddress(), ZV_ABI, provider);
  const amount: bigint = await zv.claimableRewards(walletAddress);
  return amount;
}

export async function claimReward() {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("Wallet provider tidak ditemukan.");

  await ensureOgGalileoChain(ethereum);

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const zv = new Contract(requireContractAddress(), ZV_ABI, signer);

  const tx = await zv.claimReward();
  await tx.wait();
  return { txHash: tx.hash };
}

