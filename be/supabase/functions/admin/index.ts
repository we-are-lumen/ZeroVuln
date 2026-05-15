import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { uploadToOgStorage } from '../_shared/og-storage.ts';
import { allocateRewardFromCatalogOnchain } from '../_shared/zv-contract.ts';
import { VoyageAIClient } from 'npm:voyageai@0.2.1';
import { QdrantClient } from 'npm:@qdrant/js-client-rest@1.18.0';

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

interface RagFindingRecord {
  id: string;
  contractId?: string;
  contractHash: string;
  contractName?: string;
  vulnerabilityType: string;
  severity: Severity;
  swcId?: string;
  codeSnippet: string;
  functionContext: string;
  explanation: string;
  lineStart: number;
  lineEnd: number;
  timestamp: number;
  auditId: string;
  isVerified: boolean;
}

const runtimeDeno = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
const env = runtimeDeno?.env;

const VOYAGE_API_KEY = env?.get('VOYAGE_API_KEY') || '';
const VOYAGE_MODEL = env?.get('VOYAGE_MODEL') || 'voyage-code-2';
const QDRANT_URL = (env?.get('QDRANT_URL') || '').replace(/\/+$/, '');
const QDRANT_API_KEY = env?.get('QDRANT_API_KEY') || '';
const QDRANT_COLLECTION = env?.get('QDRANT_COLLECTION') || 'zerovuln_audit_findings';

let cachedVoyageClient: VoyageAIClient | null = null;
let cachedQdrantClient: QdrantClient | null = null;
let qdrantCollectionReady = false;

function getVoyageClient(): VoyageAIClient | null {
  if (!VOYAGE_API_KEY) return null;
  if (!cachedVoyageClient) {
    cachedVoyageClient = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });
  }
  return cachedVoyageClient;
}

function getQdrantClient(): QdrantClient | null {
  if (!QDRANT_URL) return null;
  if (!cachedQdrantClient) {
    cachedQdrantClient = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY || undefined,
    });
  }
  return cachedQdrantClient;
}

if (!runtimeDeno) {
  throw new Error('Deno runtime is not available');
}

runtimeDeno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();
  if (!auth.is_admin) return forbidden();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const afterAdmin = pathParts.slice(pathParts.indexOf('admin') + 1);
  const resource = afterAdmin[0];
  const id = afterAdmin.length > 1 ? afterAdmin[1] : null;
  const action = afterAdmin.length > 2 ? afterAdmin[2] : null;

  if (resource === 'auditor-findings') {
    if (req.method === 'GET') {
      const reviewStatus = url.searchParams.get('review_status');
      return handleListAuditorFindingsQueue(reviewStatus);
    }

    if (id && action === 'approve') {
      return handleApproveAuditorFinding(auth, id);
    }

    if (id && action === 'reject') {
      return handleRejectAuditorFinding(auth, id);
    }
  }

  return notFound('Admin endpoint not found');
});

async function handleListAuditorFindingsQueue(reviewStatus: string | null) {
  let query = supabase
    .from('auditor_findings')
    .select(`
      *,
      contracts(id, name, language, is_catalog, source_code),
      users:contributor_id(id, wallet_address)
    `)
    .order('submitted_at', { ascending: false });

  if (reviewStatus) {
    query = query.eq('review_status', reviewStatus);
  } else {
    query = query.eq('review_status', 'submitted');
  }

  const { data, error } = await query;

  if (error) return serverError(error.message);
  return json(data);
}

async function handleApproveAuditorFinding(auth: { user_id: number; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: finding, error: fetchError } = await supabase
    .from('auditor_findings')
    .select(
      'id, uuid, contributor_id, title, severity, description, line_start, line_end, review_status, contracts(id, uuid, name, language, is_catalog, source_code, reward_per_finding), users:contributor_id(wallet_address)',
    )
    .eq('uuid', id)
    .single();

  if (fetchError || !finding) return notFound('Auditor finding not found');

  if (finding.review_status !== 'submitted') {
    return badRequest('Can only approve findings with review_status=submitted');
  }

  const contract = (Array.isArray(finding.contracts) ? finding.contracts[0] : finding.contracts) as
    | {
        id: number;
        uuid: string;
        name: string;
        language: string | null;
        is_catalog: boolean;
        source_code: unknown;
        reward_per_finding?: number | null;
      }
    | null;
  if (!contract?.is_catalog) return badRequest('Contract must be a catalog contract');

  const submitterWallet = (finding.users as { wallet_address?: string } | null)?.wallet_address;
  if (!submitterWallet) return badRequest('Submitter wallet address not found');

  const decidedAt = new Date().toISOString();
  const rewardPerFinding = contract.reward_per_finding ?? 0;

  // Step 1: Update DB (optimistic). If on-chain fails, we rollback.
  const { data: updated, error } = await supabase
    .from('auditor_findings')
    .update({
      review_status: 'approved',
      decided_at: decidedAt,
      reward_amount: rewardPerFinding,
    })
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);

  // Step 2: On-chain allocate reward (if reward > 0)
  if (rewardPerFinding > 0) {
    try {
      await allocateRewardFromCatalogOnchain({
        findingUuid: finding.uuid,
        catalogUuid: contract.uuid,
        submitterWalletAddress: submitterWallet,
      });
    } catch (e) {
      console.error('Failed to allocate reward on-chain:', e);
      // Rollback DB to submitted status for consistency (user request: fail if on-chain fails)
      await supabase
        .from('auditor_findings')
        .update({
          review_status: 'submitted',
          decided_at: null,
          reward_amount: 0,
        })
        .eq('uuid', id);

      const msg = e instanceof Error ? e.message : 'Unknown error';
      return serverError(`On-chain tx failed: ${msg}`);
    }
  }

  try {
    const snippet = sliceSourceByLines(contract.source_code, finding.line_start, finding.line_end);
    const datasetRecord = buildDatasetRecord({
      title: finding.title,
      severity: finding.severity,
      description: finding.description,
      language: contract.language || 'solidity',
      snippet,
    });
    const jsonl = JSON.stringify(datasetRecord) + '\n';
    const { uri, hash } = await uploadToOgStorage('datasets', `auditor-findings/${finding.uuid}.jsonl`, jsonl);
    updated.dataset_uri = uri;
    updated.dataset_hash = hash;
    await supabase
      .from('auditor_findings')
      .update({ dataset_uri: uri, dataset_hash: hash })
      .eq('uuid', id);
  } catch (e) {
    console.error('Failed to upload approved finding dataset to 0G Storage:', e);
  }

  try {
    await storeApprovedFindingToRag({
      finding: {
        uuid: finding.uuid,
        title: finding.title,
        severity: finding.severity,
        description: finding.description,
        line_start: finding.line_start,
        line_end: finding.line_end,
      },
      contract: {
        uuid: contract.uuid,
        name: contract.name,
        source_code: contract.source_code,
      },
    });
  } catch (e) {
    console.error('Failed to persist approved finding to RAG:', e);
  }

  return json(updated);
}

function sliceSourceByLines(sourceCode: unknown, lineStart: number, lineEnd: number): string {
  if (!Array.isArray(sourceCode) || sourceCode.length === 0) return '';
  const lines: string[] = [];
  for (const entry of sourceCode) {
    if (entry && typeof entry === 'object' && 'code' in entry) {
      const code = (entry as { code?: unknown }).code;
      if (typeof code === 'string') {
        lines.push(...code.split('\n'));
      }
    }
  }
  if (lines.length === 0) return '';

  const start = Number.isInteger(lineStart) && (lineStart as number) >= 1 ? (lineStart as number) : 1;
  const end = Number.isInteger(lineEnd) && (lineEnd as number) >= start ? (lineEnd as number) : lines.length;
  return lines.slice(start - 1, end).join('\n');
}

function sourceCodeToLines(sourceCode: unknown): string[] {
  if (!Array.isArray(sourceCode) || sourceCode.length === 0) return [];
  const lines: string[] = [];
  for (const entry of sourceCode) {
    if (entry && typeof entry === 'object' && 'code' in entry) {
      const code = (entry as { code?: unknown }).code;
      if (typeof code === 'string') {
        lines.push(...code.split('\n'));
      }
    }
  }
  return lines;
}

function extractContextWindow(sourceCode: unknown, lineStart: number | null, lineEnd: number | null, padding = 15): string {
  const lines = sourceCodeToLines(sourceCode);
  if (lines.length === 0) return '';

  const startLine = Number.isInteger(lineStart) && (lineStart ?? 0) >= 1 ? (lineStart as number) : 1;
  const endLine = Number.isInteger(lineEnd) && (lineEnd ?? 0) >= startLine ? (lineEnd as number) : startLine;
  const start = Math.max(0, startLine - 1 - padding);
  const end = Math.min(lines.length, endLine + padding);
  return lines.slice(start, end).join('\n');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRagConfigured(): boolean {
  return Boolean(QDRANT_URL && VOYAGE_API_KEY);
}

async function embedText(text: string): Promise<number[]> {
  const client = getVoyageClient();
  if (!client) {
    console.warn('Approved finding RAG skipped: VOYAGE_API_KEY is not configured');
    return [];
  }

  const result = await client.embed({
    input: text,
    model: VOYAGE_MODEL,
  });

  const items = Array.isArray(result?.data) ? result.data : [];
  const first = items[0] as { embedding?: unknown } | undefined;
  const embedding = first?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Voyage embed returned an invalid vector');
  }

  return embedding
    .map((value) => typeof value === 'number' ? value : Number(value))
    .filter((value) => Number.isFinite(value));
}

async function ensureQdrantCollection(client: QdrantClient, vectorSize: number): Promise<void> {
  if (vectorSize <= 0 || qdrantCollectionReady) return;

  try {
    await client.getCollection(QDRANT_COLLECTION);
    qdrantCollectionReady = true;
    return;
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status && status !== 404) throw error;
  }

  await client.createCollection(QDRANT_COLLECTION, {
    vectors: { size: vectorSize, distance: 'Cosine' },
  });
  qdrantCollectionReady = true;
}

async function upsertQdrantPoint(id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
  const client = getQdrantClient();
  if (!client || vector.length === 0) return;

  await ensureQdrantCollection(client, vector.length);
  await client.upsert(QDRANT_COLLECTION, {
    wait: true,
    points: [
      {
        id,
        vector,
        payload,
      },
    ],
  });
}

function normalizeSeverityForRag(value: unknown): Severity {
  const normalized = typeof value === 'string' ? value.toUpperCase() : 'MEDIUM';
  if (normalized === 'CRITICAL' || normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW' || normalized === 'INFO') {
    return normalized;
  }
  return 'MEDIUM';
}

function extractSwcId(...parts: unknown[]): string | undefined {
  const text = parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .filter((part): part is string => typeof part === 'string')
    .join(' ');

  const match = text.match(/\bSWC-\d+\b/i);
  return match?.[0]?.toUpperCase();
}

function buildEmbeddingText(finding: RagFindingRecord): string {
  return [
    `Vulnerability: ${finding.vulnerabilityType}`,
    `SWC: ${finding.swcId ?? 'N/A'}`,
    `Severity: ${finding.severity}`,
    '',
    'Vulnerable Code:',
    finding.codeSnippet,
    '',
    'Function Context:',
    finding.functionContext,
    '',
    'Explanation:',
    finding.explanation,
  ].join('\n').trim();
}

async function storeApprovedFindingToRag(params: {
  finding: {
    uuid: string;
    title: string;
    severity: string;
    description: string;
    line_start: number | null;
    line_end: number | null;
  };
  contract: {
    uuid: string;
    name: string;
    source_code: unknown;
  };
}): Promise<void> {
  if (!isRagConfigured()) {
    console.warn('Approved finding RAG skipped: Qdrant or embedding credentials are missing');
    return;
  }

  const fullSource = sourceCodeToLines(params.contract.source_code).join('\n');
  if (!fullSource.trim()) {
    console.warn('Approved finding RAG skipped: contract source is empty');
    return;
  }

  const lineStart = Number.isInteger(params.finding.line_start) && (params.finding.line_start ?? 0) >= 1
    ? (params.finding.line_start as number)
    : 1;
  const lineEnd = Number.isInteger(params.finding.line_end) && (params.finding.line_end ?? 0) >= lineStart
    ? (params.finding.line_end as number)
    : lineStart;

  const record: RagFindingRecord = {
    id: params.finding.uuid,
    contractId: params.contract.uuid,
    contractHash: await sha256Hex(fullSource),
    contractName: params.contract.name,
    vulnerabilityType: params.finding.title,
    severity: normalizeSeverityForRag(params.finding.severity),
    swcId: extractSwcId(params.finding.title, params.finding.description),
    codeSnippet: sliceSourceByLines(params.contract.source_code, lineStart, lineEnd),
    functionContext: extractContextWindow(params.contract.source_code, lineStart, lineEnd),
    explanation: params.finding.description || '',
    lineStart,
    lineEnd,
    timestamp: Date.now(),
    auditId: params.finding.uuid,
    isVerified: true,
  };

  const embeddingText = buildEmbeddingText(record);
  const embedding = await embedText(embeddingText);
  if (embedding.length === 0) return;

  const storageResult = await uploadToOgStorage(
    'ai-findings-rag',
    `approved-auditor-findings/${params.finding.uuid}.json`,
    JSON.stringify({ ...record, embeddingText }),
  );

  await upsertQdrantPoint(params.finding.uuid, embedding, {
    rootHash: storageResult.uri,
    vulnerabilityType: record.vulnerabilityType,
    severity: record.severity,
    swcId: record.swcId,
    contractHash: record.contractHash,
    lineStart: record.lineStart,
    lineEnd: record.lineEnd,
    timestamp: record.timestamp,
    isVerified: true,
  });
}

function buildDatasetRecord(args: {
  title: string;
  severity: string;
  description: string;
  language: string;
  snippet: string;
}): Record<string, string> {
  const instruction = 'Identify the vulnerability in the following Solidity smart contract and explain why it is unsafe.';
  const input = args.snippet;
  const output = `Vulnerability: ${args.title} (severity: ${args.severity}).\n${args.description}`;
  return { instruction, input, output };
}

async function handleRejectAuditorFinding(auth: { user_id: number; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: finding, error: fetchError } = await supabase
    .from('auditor_findings')
    .select('id, review_status')
    .eq('uuid', id)
    .single();

  if (fetchError || !finding) return notFound('Auditor finding not found');

  if (finding.review_status !== 'submitted') {
    return badRequest('Can only reject findings with review_status=submitted');
  }

  const { data, error } = await supabase
    .from('auditor_findings')
    .update({
      review_status: 'rejected',
      decided_at: new Date().toISOString(),
    })
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}
