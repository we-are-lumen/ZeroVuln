// 0G Compute helper — used by AI endpoints to run inference through the
// 0G Serving Broker against decentralized GPU providers.
//
// Model targeted by ZeroVuln: 0GM-1.0-35B-A3B
//
// Critical rules (see .0g-skills/patterns/COMPUTE.md):
//   - ethers v6 (npm:ethers@6.13.0)
//   - processResponse(providerAddress, chatID, usageData) — param order matters
//   - Extract ChatID from `ZG-Res-Key` header first, `data.id` as fallback
//   - Acknowledge provider before first use
import { createZGComputeNetworkBroker } from 'npm:@0glabs/0g-serving-broker@0.6.5';
import { ethers } from 'npm:ethers@6.13.0';

const OG_RPC_URL = Deno.env.get('OG_RPC_URL') || 'https://evmrpc.0g.ai';
const OG_PRIVATE_KEY =
  Deno.env.get('OG_PRIVATE_KEY') || Deno.env.get('PRIVATE_KEY') || '';
// Provider address can be set explicitly; otherwise we auto-discover the first
// provider whose model matches OG_COMPUTE_MODEL.
const OG_COMPUTE_PROVIDER = Deno.env.get('OG_COMPUTE_PROVIDER') || '';
const OG_COMPUTE_MODEL = Deno.env.get('OG_COMPUTE_MODEL') || '0GM-1.0-35B-A3B';

let cachedBroker: any | null = null;
let cachedWallet: ethers.Wallet | null = null;
let cachedProvider: { address: string; endpoint: string; model: string } | null = null;
const acknowledged = new Set<string>();

function getWallet(): ethers.Wallet {
  if (!OG_PRIVATE_KEY) {
    throw new Error('OG_PRIVATE_KEY not configured for 0G compute');
  }
  if (!cachedWallet) {
    const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
    cachedWallet = new ethers.Wallet(OG_PRIVATE_KEY, provider);
  }
  return cachedWallet;
}

async function getBroker(): Promise<any> {
  if (cachedBroker) return cachedBroker;
  const wallet = getWallet();
  cachedBroker = await createZGComputeNetworkBroker(wallet as any);
  return cachedBroker;
}

async function resolveProvider(): Promise<{ address: string; endpoint: string; model: string }> {
  if (cachedProvider) return cachedProvider;
  const broker = await getBroker();

  let providerAddress = OG_COMPUTE_PROVIDER;
  if (!providerAddress) {
    const services = await broker.inference.listService();
    // Service tuple: [0]=providerAddress, [1]=serviceType, [6]=model, [10]=teeVerified
    const match = (services as any[]).find(
      (s) => s[1] === 'chatbot' && typeof s[6] === 'string' && s[6] === OG_COMPUTE_MODEL,
    );
    if (!match) {
      const available = (services as any[])
        .filter((s) => s[1] === 'chatbot')
        .map((s) => s[6])
        .join(', ');
      throw new Error(
        `No 0G chatbot provider found for model "${OG_COMPUTE_MODEL}". Available chatbot models: ${available}`,
      );
    }
    providerAddress = match[0];
  }

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  cachedProvider = { address: providerAddress, endpoint, model };
  return cachedProvider;
}

async function ensureAcknowledged(providerAddress: string): Promise<void> {
  if (acknowledged.has(providerAddress)) return;
  const broker = await getBroker();
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  } catch (err) {
    // Acknowledgement is idempotent; a re-ack will throw. Treat as non-fatal.
    console.warn('0G provider acknowledge warning:', String(err));
  }
  acknowledged.add(providerAddress);
}

export interface OgChatPayload {
  prompt: string;
  system_prompt: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * Run a single non-streaming chat completion through the 0G Compute Network.
 * Returns the raw JSON body returned by the provider (OpenAI-compatible shape),
 * after also calling `processResponse()` for fee settlement.
 */
export async function ogChatCompletion(payload: OgChatPayload): Promise<unknown> {
  const broker = await getBroker();
  const { address, endpoint, model } = await resolveProvider();
  await ensureAcknowledged(address);

  const messages = [
    { role: 'system', content: payload.system_prompt },
    { role: 'user', content: payload.prompt },
  ];

  const headers = await broker.inference.getRequestHeaders(address);

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: payload.max_tokens ?? 4096,
      temperature: payload.temperature ?? 0.4,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`0G compute returned ${response.status}: ${errBody}`);
  }

  const data = await response.json();

  // ChatID for processResponse — header is the primary source, body as fallback.
  let chatID =
    response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key') || undefined;
  if (!chatID && data && typeof data === 'object' && 'id' in data) {
    const idVal = (data as Record<string, unknown>).id;
    if (typeof idVal === 'string') chatID = idVal;
  }

  try {
    const usage = (data as Record<string, unknown>)?.usage;
    await broker.inference.processResponse(
      address,
      chatID,
      usage ? JSON.stringify(usage) : undefined,
    );
  } catch (err) {
    // Fee settlement failures shouldn't block the user from receiving the
    // already-generated audit; surface as a warning instead.
    console.warn('0G processResponse failed:', String(err));
  }

  return data;
}

export { OG_COMPUTE_MODEL };