import { ZgFile, Indexer } from 'npm:@0gfoundation/0g-ts-sdk';
import { ethers } from 'npm:ethers@6.13.0';

const OG_CHAIN_ID = Deno.env.get('OG_CHAIN_ID') || '16661';
const OG_RPC_URL = Deno.env.get('OG_RPC_URL') || 'https://evmrpc.0g.ai';
const OG_STORAGE_INDEXER = Deno.env.get('OG_STORAGE_INDEXER') || 'https://indexer-storage-turbo.0g.ai';
const OG_PRIVATE_KEY = Deno.env.get('OG_PRIVATE_KEY') || Deno.env.get('PRIVATE_KEY') || '';

export interface ComputeJob {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
}

let cachedIndexer: Indexer | null = null;
let cachedWallet: ethers.Wallet | null = null;

function getStorageIndexer(): Indexer {
  console.warn('Getting storage indexer with config:', { OG_STORAGE_INDEXER });
  if (!cachedIndexer) {
    cachedIndexer = new Indexer(OG_STORAGE_INDEXER);
  }
  return cachedIndexer;
}

function getStorageWallet(): ethers.Wallet {
  if (!OG_PRIVATE_KEY) {
    throw new Error('OG_PRIVATE_KEY not configured');
  }
  if (!cachedWallet) {
    const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
    cachedWallet = new ethers.Wallet(OG_PRIVATE_KEY, provider);
  }
  return cachedWallet;
}

export async function uploadToOgStorage(namespace: string, key: string, content: string): Promise<{ uri: string; hash: string }> {

  const indexer = getStorageIndexer();
  const wallet = getStorageWallet();
  const suffix = key.split('.').pop() || 'txt';
  const tempPath = await Deno.makeTempFile({ prefix: `0g-${namespace}-`, suffix: `.${suffix}` });

  await Deno.writeTextFile(tempPath, content);

  const file = await ZgFile.fromFilePath(tempPath);
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr !== null) throw new Error(`Merkle tree error: ${treeErr}`);

    const rootHash = tree?.rootHash();
    if (!rootHash) throw new Error('Merkle tree root hash is empty');
    console.log('Merkle tree root hash:', rootHash, 'size:', file.size(), 'bytes');

    const [tx, uploadErr] = await indexer.upload(file, OG_RPC_URL, wallet as any);
    if (uploadErr !== null) throw new Error(`Upload error: ${uploadErr}`);

    console.log('0G Storage upload success:', rootHash);

    if (tx && typeof tx === 'object' && 'rootHash' in tx) {
      return { uri: tx.rootHash, hash: tx.txHash };
    }
    return { uri: tx.rootHashes, hash: tx.txHashes };
  } finally {
    try { await file.close(); } catch { /* ignore */ }
    await Deno.remove(tempPath).catch(() => undefined);
  }
}

export { OG_CHAIN_ID, OG_RPC_URL, OG_STORAGE_INDEXER };
