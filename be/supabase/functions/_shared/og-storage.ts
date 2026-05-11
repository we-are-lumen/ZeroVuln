import { ZgFile, Indexer } from 'npm:@0glabs/0g-ts-sdk@0.3.3';
import { ethers } from 'npm:ethers@6.13.0';

const OG_CHAIN_ID = Deno.env.get('OG_CHAIN_ID') || '16602';
const OG_RPC_URL = Deno.env.get('OG_RPC_URL') || 'https://evmrpc-testnet.0g.ai';
const OG_COMPUTE_BROKER = Deno.env.get('OG_COMPUTE_BROKER') || '';
const OG_STORAGE_INDEXER = Deno.env.get('OG_STORAGE_INDEXER') || 'https://indexer-storage-testnet-turbo.0g.ai';
const OG_STORAGE_NODE = Deno.env.get('OG_STORAGE_NODE') || OG_STORAGE_INDEXER;
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

async function uploadViaLegacyEndpoint(namespace: string, key: string, content: string): Promise<{ uri: string; hash: string }> {
  const response = await fetch(`${OG_STORAGE_NODE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      namespace,
      key,
      data: content,
    }),
  });

  if (!response.ok) {
    throw new Error(`0G Storage upload failed: ${response.statusText}`);
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hashHex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return {
    uri: `0g://${namespace}/${key}`,
    hash: hashHex,
  };
}

export async function submitComputeJob(prompt: string, model?: string): Promise<{ job_id: string }> {
  if (!OG_COMPUTE_BROKER) {
    throw new Error('OG_COMPUTE_BROKER not configured');
  }

  const aiModel = model || Deno.env.get('AI_MODEL');

  const response = await fetch(OG_COMPUTE_BROKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiModel,
      prompt,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`0G Compute submission failed: ${response.statusText}`);
  }

  const result = await response.json();
  return { job_id: result.job_id || result.id };
}

export async function getComputeJob(jobId: string): Promise<ComputeJob> {
  if (!OG_COMPUTE_BROKER) {
    throw new Error('OG_COMPUTE_BROKER not configured');
  }

  const response = await fetch(`${OG_COMPUTE_BROKER}/${jobId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`0G Compute getJob failed: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    job_id: result.job_id || result.id,
    status: result.status,
    output: result.output,
    error: result.error,
  };
}

export async function uploadToOgStorage(namespace: string, key: string, content: string): Promise<{ uri: string; hash: string }> {
  if (!OG_PRIVATE_KEY) {
    console.warn('OG_PRIVATE_KEY not configured, fallback to legacy upload endpoint');
    return uploadViaLegacyEndpoint(namespace, key, content);
  }

  try {
    const indexer = getStorageIndexer();
    const wallet = getStorageWallet();
    const suffix = key.split('.').pop() || 'txt';
    const tempPath = await Deno.makeTempFile({ prefix: `0g-${namespace}-`, suffix: `.${suffix}` });

    await Deno.writeTextFile(tempPath, content);

    const file = await ZgFile.fromFilePath(tempPath);
    try {
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr || !tree) {
        throw new Error(`Merkle tree error: ${treeErr}`);
      }

      const rootHash = tree.rootHash();
      const [, uploadErr] = await indexer.upload(file, OG_RPC_URL, wallet as any);
      if (uploadErr) {
        throw new Error(`0G Storage upload failed: ${uploadErr.message}`);
      }

      return {
        uri: `0g://${rootHash}`,
        hash: rootHash,
      };
    } finally {
      await file.close();
      await Deno.remove(tempPath).catch(() => undefined);
    }
  } catch (e) {
    console.warn('0G SDK upload failed, fallback to legacy upload endpoint:', e);
    return uploadViaLegacyEndpoint(namespace, key, content);
  }
}

export async function fetchFromOgStorage(uri: string): Promise<{ content: string; hash: string }> {
  const rootOrPath = uri.replace('0g://', '');
  if (/^0x[0-9a-fA-F]{64}$/.test(rootOrPath)) {
    const indexer = getStorageIndexer();
    const tempPath = await Deno.makeTempFile({ prefix: '0g-download-' });

    try {
      const downloadErr = await indexer.download(rootOrPath, tempPath, true);
      if (downloadErr) {
        throw new Error(`0G Storage download failed: ${downloadErr.message}`);
      }

      const content = await Deno.readTextFile(tempPath);
      return { content, hash: rootOrPath };
    } finally {
      await Deno.remove(tempPath).catch(() => undefined);
    }
  }

  const response = await fetch(`${OG_STORAGE_NODE}/${rootOrPath}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`0G Storage fetch failed: ${response.statusText}`);
  }

  const content = await response.text();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hashHex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return { content, hash: hashHex };
}

export { OG_CHAIN_ID, OG_RPC_URL, OG_STORAGE_INDEXER };
