import {
  BrowserProvider,
  Contract,
  keccak256,
  parseEther,
  toUtf8Bytes,
} from "ethers";
import { ensureOgChain } from "./wallet/og-chain";
import type { Eip1193Provider } from "@/shared/types/eip1193.type";

const ZV_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ZV_CONTRACT_ADDRESS;

const ZV_ABI = [
  "function featureFee() view returns (uint256)",
  "function payForFeature(uint8 feature, bytes32 refId) payable",
  "function claimableRewards(address user) view returns (uint256)",
  "function claimReward()",
  "function fund() payable",
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

function toSimpleWalletError(err: unknown, actionLabel = "Payment"): Error {
  // MetaMask user reject: code 4001 (EIP-1193)
  const anyErr = err as any;
  const code = anyErr?.code ?? anyErr?.info?.error?.code;
  const message: string = String(anyErr?.message ?? anyErr?.shortMessage ?? "");

  const rejected =
    code === 4001 ||
    /user rejected|rejected|denied/i.test(message);

  if (rejected) return new Error(`${actionLabel} cancelled in wallet.`);
  return err instanceof Error ? err : new Error(`${actionLabel} failed.`);
}

export async function payForFeature(feature: ZVFeature, ref?: string) {
  try {
    const ethereum = getEthereum();
    if (!ethereum) throw new Error("Wallet provider tidak ditemukan. Install MetaMask dulu.");

    await ensureOgChain(ethereum);

    const provider = new BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const zv = new Contract(requireContractAddress(), ZV_ABI, signer);

    const fee: bigint = await zv.featureFee();
    const tx = await zv.payForFeature(featureToEnum(feature), toRefId(ref), {
      value: fee,
    });
    await tx.wait();
    return { txHash: tx.hash, feeWei: fee };
  } catch (err) {
    throw toSimpleWalletError(err, "Payment");
  }
}

export async function getClaimableRewardWei(walletAddress: string): Promise<bigint> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("Wallet provider tidak ditemukan.");

  await ensureOgChain(ethereum);

  const provider = new BrowserProvider(ethereum);
  const zv = new Contract(requireContractAddress(), ZV_ABI, provider);
  const amount: bigint = await zv.claimableRewards(walletAddress);
  return amount;
}

export async function claimReward() {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("Wallet provider tidak ditemukan.");

  await ensureOgChain(ethereum);

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const zv = new Contract(requireContractAddress(), ZV_ABI, signer);

  const tx = await zv.claimReward();
  await tx.wait();
  return { txHash: tx.hash };
}

export async function getContractBalanceWei(): Promise<bigint> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("Wallet provider tidak ditemukan.");

  await ensureOgChain(ethereum);

  const provider = new BrowserProvider(ethereum);
  const balance = await provider.getBalance(requireContractAddress());
  return balance;
}

export async function fundContract(amount0g: string) {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("Wallet provider tidak ditemukan.");

  await ensureOgChain(ethereum);

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const zv = new Contract(requireContractAddress(), ZV_ABI, signer);

  const value = parseEther(amount0g);
  const tx = await zv.fund({ value });
  await tx.wait();
  return { txHash: tx.hash };
}
