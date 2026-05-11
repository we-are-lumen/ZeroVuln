const OG_CHAIN_ID = Deno.env.get('OG_CHAIN_ID') || '16602';
const OG_RPC_URL = Deno.env.get('OG_RPC_URL') || 'https://evmrpc-testnet.0g.ai';
const OG_COMPUTE_BROKER = Deno.env.get('OG_COMPUTE_BROKER') || '';
const OG_STORAGE_INDEXER = Deno.env.get('OG_STORAGE_INDEXER') || 'https://indexer-storage-testnet-turbo.0g.ai';

export interface ComputeJob {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
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
  const storageNode = Deno.env.get('OG_STORAGE_NODE') || OG_STORAGE_INDEXER;

  const keccak256 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hashHex = Array.from(new Uint8Array(keccak256)).map(b => b.toString(16).padStart(2, '0')).join('');

  const response = await fetch(`${storageNode}/upload`, {
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

  const result = await response.json();
  return {
    uri: `0g://${namespace}/${key}`,
    hash: hashHex,
  };
}

export async function fetchFromOgStorage(uri: string): Promise<{ content: string; hash: string }> {
  const storageNode = Deno.env.get('OG_STORAGE_NODE') || OG_STORAGE_INDEXER;
  const path = uri.replace('0g://', '');

  const response = await fetch(`${storageNode}/${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`0G Storage fetch failed: ${response.statusText}`);
  }

  const content = await response.text();
  const keccak256 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const hashHex = Array.from(new Uint8Array(keccak256)).map(b => b.toString(16).padStart(2, '0')).join('');

  return { content, hash: hashHex };
}

export { OG_CHAIN_ID, OG_RPC_URL, OG_STORAGE_INDEXER };
