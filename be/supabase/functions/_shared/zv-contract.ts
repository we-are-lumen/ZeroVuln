import { Contract, JsonRpcProvider, Wallet, keccak256, parseEther, toUtf8Bytes } from 'npm:ethers@6.15.0';

const ZV_ABI = [
  'function setCatalogReward(bytes32 catalogId, uint256 rewardPerFindingWei) external',
  'function allocateRewardFromCatalog(bytes32 findingId, bytes32 catalogId, address submitter) external',
];

function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function getZvContract() {
  const rpcUrl = Deno.env.get('ZV_RPC_URL') || 'https://evmrpc-testnet.0g.ai';
  const contractAddress = requiredEnv('ZV_CONTRACT_ADDRESS');
  const pk = requiredEnv('ZV_ADMIN_PRIVATE_KEY');

  const provider = new JsonRpcProvider(rpcUrl, 16602);
  const wallet = new Wallet(pk, provider);
  return new Contract(contractAddress, ZV_ABI, wallet);
}

export function catalogUuidToId(catalogUuid: string): string {
  return keccak256(toUtf8Bytes(catalogUuid));
}

export function findingUuidToId(findingUuid: string): string {
  return keccak256(toUtf8Bytes(findingUuid));
}

export function reward0gToWei(amount0g: number | string): bigint {
  // amount0g is considered a token unit (e.g., 5 = 5 0g)
  return parseEther(String(amount0g ?? 0));
}

export async function setCatalogRewardOnchain(args: {
  catalogUuid: string;
  rewardPerFinding0g: number | string;
}) {
  const zv = getZvContract();
  const catalogId = catalogUuidToId(args.catalogUuid);
  const rewardWei = reward0gToWei(args.rewardPerFinding0g);
  const tx = await zv.setCatalogReward(catalogId, rewardWei);
  await tx.wait();
  return { txHash: tx.hash };
}

export async function allocateRewardFromCatalogOnchain(args: {
  findingUuid: string;
  catalogUuid: string;
  submitterWalletAddress: string;
}) {
  const zv = getZvContract();
  const findingId = findingUuidToId(args.findingUuid);
  const catalogId = catalogUuidToId(args.catalogUuid);
  const tx = await zv.allocateRewardFromCatalog(findingId, catalogId, args.submitterWalletAddress);
  await tx.wait();
  return { txHash: tx.hash };
}

