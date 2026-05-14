import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { uploadToOgStorage, fetchFromOgStorage } from '../_shared/og-storage.ts';

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const runtimeDeno = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
const env = runtimeDeno?.env;

const AI_CHAT_API_URL = env?.get('AI_CHAT_API_URL') || 'https://ai.sumopod.com/v1/chat/completions';
const AI_CHAT_MODEL = env?.get('AI_CHAT_MODEL') || 'gemini/gemini-3.1-flash-lite-preview';
const AI_EMBEDDING_API_URL = env?.get('AI_EMBEDDING_API_URL') || 'https://ai.sumopod.com/v1/embeddings';
const AI_EMBEDDING_MODEL = env?.get('AI_EMBEDDING_MODEL') || 'text-embedding-3-small';
const QDRANT_URL = (env?.get('QDRANT_URL') || '').replace(/\/+$/, '');
const QDRANT_API_KEY = env?.get('QDRANT_API_KEY') || '';
const QDRANT_COLLECTION = env?.get('QDRANT_COLLECTION') || 'zerovuln_audit_findings';
const RAG_TOP_K = Math.max(1, Number.parseInt(env?.get('RAG_TOP_K') || '5', 10) || 5);

const AI_CODEGEN_SYSTEM_PROMPT = "Target: Lead Blockchain Security Architect and Smart Contract Auditor.\nRole: Generate high-security Solidity smart contracts and provide a detailed forensic trace of an averted attack.\n\nOperational Rules:\n1. Standards: Solidity ^0.8.20, OpenZeppelin (AccessControl, ReentrancyGuard, SafeERC20).\n2. Patterns: Checks-Effects-Interactions, Pull-over-Push.\n3. Output Requirement: Valid JSON only. Do NOT use markdown code blocks, backticks, or conversational text.\n\nCRITICAL WORKFLOW:\nStep 1: Generate a production-ready Solidity contract.\nStep 2: Identify specific mitigations within the code line-by-line.\nStep 3: Simulate a flow tracing of a failed hack attempt against this implementation.\n\nJSON Structure:\n{\n  \"code\": \"string (Use \\n for new lines and escape internal quotes)\",\n  \"vulnerability_mitigations\": [\n    {\n      \"name\": \"string\",\n      \"reason\": \"string\",\n      \"start_line\": number,\n      \"end_line\": number\n    }\n  ]\n}\n\nConstraint: The response must be a single raw JSON object.";
const AI_CODEAUDIT_SYSTEM_PROMPT = "Role: You are a senior smart contract auditor. Analyze the provided Solidity source for vulnerabilities and provide a production-ready fix.\n\nProtocol:\n1. Treat the source as a 1-based list of lines.\n2. Audit for critical, high, medium, low, and informational issues.\n3. Produce a corrected code_fixed version using OpenZeppelin standards and the CEI pattern when relevant.\n4. Map exact line numbers from the original input.\n\nOutput rules:\n- JSON only.\n- No markdown wrappers.\n- Start with { and end with }.\n- suggested_code must be a verbatim extract from code_fixed.\n\nJSON Schema:\n{\n  \"code_fixed\": \"string\",\n  \"vulnerabilities\": [\n    {\n      \"name\": \"string\",\n      \"reasoning_trace\": [\"string\"],\n      \"start_line\": number,\n      \"end_line\": number,\n      \"severity\": \"critical|high|medium|low|info\",\n      \"confidence\": number,\n      \"suggested_code\": \"string\",\n      \"attack_trace\": {\n        \"traceId\": \"string\",\n        \"nodes\": [{ \"id\": \"string\", \"label\": \"string\", \"type\": \"string\", \"address\": \"string\" }],\n        \"edges\": [{ \"from\": \"string\", \"to\": \"string\", \"label\": \"string\" }]\n      }\n    }\n  ]\n}";

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

interface AIChatPayload {
  prompt: string;
  system_prompt: string;
}

interface AuditVulnerability {
  name?: string;
  severity?: string;
  start_line?: number;
  end_line?: number;
  confidence?: number;
  reasoning_trace?: string[];
  suggested_code?: unknown;
  attack_trace?: unknown;
}

interface StoredFindingRow {
  uuid: string;
  severity: string;
  title: string;
  description: string | null;
  line_start: number | null;
  line_end: number | null;
  confidence?: number | null;
  status?: string | null;
  attack_trace?: unknown;
  remediation?: unknown;
}

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
  remediation?: string;
  attackTrace?: unknown;
  embeddingText?: string;
}

interface QdrantPointPayload {
  rootHash?: string;
  vulnerabilityType?: string;
  severity?: string;
  swcId?: string;
  contractHash?: string;
  lineStart?: number;
  lineEnd?: number;
  timestamp?: number;
}

interface QdrantSearchPoint {
  id: string;
  payload?: QdrantPointPayload;
}

if (!runtimeDeno) {
  throw new Error('Deno runtime is not available');
}

runtimeDeno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const aiIndex = pathParts.indexOf('ai');
  const segment = pathParts[aiIndex + 1];

  if (req.method !== 'POST') return badRequest('Method not allowed');

  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  if (segment === 'ai-codegen') {
    return handleCodegen(req, auth, body);
  }
  if (segment === 'ai-audit') {
    return handleAudit(req, auth, body);
  }

  return notFound('Endpoint not found');
});

async function aiFetch(payload: AIChatPayload): Promise<Response> {
  const apiKey = env?.get('AI_API_KEY');
  const maxTokens = 1024;
  const temperature = 0.7;

  if (!apiKey) throw new Error('AI_API_KEY not configured');

  return fetch(AI_CHAT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_CHAT_MODEL,
      messages: [
        { role: 'system', content: payload.system_prompt },
        { role: 'user', content: payload.prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });
}

function getEmbeddingApiKey(): string {
  return env?.get('AI_EMBEDDING_API_KEY') || env?.get('AI_API_KEY') || '';
}

function isRagConfigured(): boolean {
  return Boolean(QDRANT_URL && getEmbeddingApiKey());
}

async function embedText(text: string): Promise<number[]> {
  const apiKey = getEmbeddingApiKey();
  if (!apiKey) {
    console.warn('RAG embedding skipped: embedding API key is not configured');
    return [];
  }

  const response = await fetch(AI_EMBEDDING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Embedding API ${response.status}: ${errBody}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const items = Array.isArray(data.data) ? data.data : [];
  const first = items[0] as Record<string, unknown> | undefined;
  const embedding = first?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding API returned an invalid vector');
  }

  return embedding
    .map((value) => typeof value === 'number' ? value : Number(value))
    .filter((value) => Number.isFinite(value));
}

function qdrantHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (QDRANT_API_KEY) {
    headers['api-key'] = QDRANT_API_KEY;
  }
  return headers;
}

async function qdrantRequest(path: string, init: RequestInit, allow404 = false): Promise<Response | null> {
  if (!QDRANT_URL) return null;

  const extraHeaders = init.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {};
  const response = await fetch(`${QDRANT_URL}${path}`, {
    ...init,
    headers: {
      ...qdrantHeaders(),
      ...extraHeaders,
    },
  });

  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Qdrant ${response.status}: ${errBody}`);
  }
  return response;
}

async function ensureQdrantCollection(vectorSize: number): Promise<void> {
  if (!QDRANT_URL || vectorSize <= 0) return;

  const existing = await qdrantRequest(`/collections/${QDRANT_COLLECTION}`, { method: 'GET' }, true);
  if (existing) return;

  await qdrantRequest(`/collections/${QDRANT_COLLECTION}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    }),
  });
}

async function searchQdrant(vector: number[], limit: number): Promise<QdrantSearchPoint[]> {
  if (!QDRANT_URL || vector.length === 0) return [];

  const response = await qdrantRequest(`/collections/${QDRANT_COLLECTION}/points/query`, {
    method: 'POST',
    body: JSON.stringify({
      query: vector,
      limit,
      with_payload: true,
      with_vector: false,
    }),
  }, true);

  if (!response) return [];

  const data = await response.json() as Record<string, unknown>;
  const result = data.result;
  if (Array.isArray(result)) return result as QdrantSearchPoint[];
  if (result && typeof result === 'object' && Array.isArray((result as { points?: unknown[] }).points)) {
    return (result as { points: QdrantSearchPoint[] }).points;
  }
  return [];
}

async function upsertQdrantPoint(id: string, vector: number[], payload: QdrantPointPayload): Promise<void> {
  if (!QDRANT_URL || vector.length === 0) return;

  await ensureQdrantCollection(vector.length);
  await qdrantRequest(`/collections/${QDRANT_COLLECTION}/points?wait=true`, {
    method: 'PUT',
    body: JSON.stringify({
      points: [
        {
          id,
          vector,
          payload,
        },
      ],
    }),
  });
}

function stripJsonFences(s: string): string {
  let out = s.trim();
  out = out.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  if (!out.startsWith('{') || !out.endsWith('}')) {
    const first = out.indexOf('{');
    const last = out.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      out = out.slice(first, last + 1);
    }
  }
  return out.trim();
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return JSON.parse(stripJsonFences(s));
  }
}

function extractAIContent(aiData: unknown): unknown {
  if (!aiData || typeof aiData !== 'object') return aiData;
  const data = aiData as Record<string, unknown>;

  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const choice = data.choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === 'string') {
      try {
        return tryParseJson(content);
      } catch {
        return content;
      }
    }
  }

  if ('response' in data) {
    const inner = data.response;
    if (typeof inner === 'string') {
      try {
        return tryParseJson(inner);
      } catch {
        return inner;
      }
    }
    return inner;
  }

  return aiData;
}

function codeStringToSourceBlocks(code: string) {
  return code.split(/\r?\n/).map((line, index) => ({ code: line, line: index + 1 }));
}

function extractLines(source: string, lineStart?: number | null, lineEnd?: number | null): string {
  if (!lineStart || !lineEnd || lineStart <= 0 || lineEnd < lineStart) return '';
  const lines = source.split(/\r?\n/);
  return lines.slice(lineStart - 1, lineEnd).join('\n').trim();
}

function extractContextWindow(source: string, lineStart?: number | null, lineEnd?: number | null, padding = 15): string {
  const lines = source.split(/\r?\n/);
  if (!lineStart || !lineEnd || lineStart <= 0 || lineEnd < lineStart) {
    return lines.slice(0, Math.min(lines.length, 40)).join('\n').trim();
  }

  const start = Math.max(0, lineStart - 1 - padding);
  const end = Math.min(lines.length, lineEnd + padding);
  return lines.slice(start, end).join('\n').trim();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseAIResponse(aiData: unknown) {
  const payload = extractAIContent(aiData);

  if (payload && typeof payload === 'object') {
    const p = payload as { code?: unknown; vulnerability_mitigations?: unknown };
    const code = typeof p.code === 'string' ? p.code : '';
    const mitigations = Array.isArray(p.vulnerability_mitigations) ? p.vulnerability_mitigations : [];
    return { code, mitigations, raw: payload };
  }

  return { code: typeof payload === 'string' ? payload : '', mitigations: [], raw: payload };
}

function parseAuditResponse(aiData: unknown): { code_fixed: string; vulnerabilities: AuditVulnerability[] } {
  const payload = extractAIContent(aiData);
  if (payload && typeof payload === 'object') {
    const p = payload as { code_fixed?: unknown; vulnerabilities?: unknown };
    const code_fixed = typeof p.code_fixed === 'string' ? p.code_fixed : '';
    const vulnerabilities = Array.isArray(p.vulnerabilities) ? p.vulnerabilities as AuditVulnerability[] : [];
    return { code_fixed, vulnerabilities };
  }
  return { code_fixed: '', vulnerabilities: [] };
}

function normalizeSeverity(value: unknown): string {
  const valid = ['critical', 'high', 'medium', 'low', 'info'];
  if (typeof value === 'string' && valid.includes(value.toLowerCase())) return value.toLowerCase();
  return 'medium';
}

function toRagSeverity(value: unknown): Severity {
  const normalized = normalizeSeverity(value).toUpperCase();
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

function buildRagContext(findings: RagFindingRecord[]): string {
  if (findings.length === 0) return '';

  return findings.map((finding, index) => {
    const swc = finding.swcId ? ` (${finding.swcId})` : '';
    return [
      `[Pattern ${index + 1}] [${finding.severity}] ${finding.vulnerabilityType}${swc}`,
      `Code snippet: ${finding.codeSnippet || 'N/A'}`,
      `Why vulnerable: ${finding.explanation || 'N/A'}`,
      `Context: ${finding.functionContext || 'N/A'}`,
      finding.remediation ? `Suggested remediation: ${finding.remediation}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');
}

function buildAuditPrompt(contractSource: string, retrievedFindings: RagFindingRecord[]): string {
  const ragContext = buildRagContext(retrievedFindings);
  if (!ragContext) return contractSource;

  return [
    'Known vulnerability patterns from previous audits:',
    ragContext,
    '',
    'Analyze the Solidity contract below.',
    'Focus especially on patterns similar to the known findings above.',
    'Return exact line numbers relative to the full contract.',
    '',
    contractSource,
  ].join('\n');
}

function buildCodegenPrompt(userPrompt: string, retrievedFindings: RagFindingRecord[]): string {
  const ragContext = buildRagContext(retrievedFindings);
  if (!ragContext) return userPrompt;

  return [
    'Use the previous vulnerability patterns below to avoid insecure implementations:',
    ragContext,
    '',
    'User request:',
    userPrompt,
    '',
    'Generate secure Solidity code that explicitly avoids the vulnerable patterns above.',
  ].join('\n');
}

function parseStoredRagFinding(content: string): RagFindingRecord | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Partial<RagFindingRecord>;
    if (typeof record.id !== 'string' || typeof record.vulnerabilityType !== 'string') return null;
    if (typeof record.explanation !== 'string' || typeof record.codeSnippet !== 'string' || typeof record.functionContext !== 'string') return null;
    if (typeof record.lineStart !== 'number' || typeof record.lineEnd !== 'number') return null;
    if (typeof record.auditId !== 'string' || typeof record.contractHash !== 'string') return null;
    return record as RagFindingRecord;
  } catch {
    return null;
  }
}

async function retrieveRelevantFindings(queryText: string, topK = RAG_TOP_K): Promise<RagFindingRecord[]> {
  if (!isRagConfigured()) return [];

  const queryEmbedding = await embedText(queryText);
  if (queryEmbedding.length === 0) return [];

  const results = await searchQdrant(queryEmbedding, topK);
  if (results.length === 0) return [];

  const findings = await Promise.all(results.map(async (result) => {
    const rootHash = result.payload?.rootHash;
    if (!rootHash) return null;

    try {
      const { content } = await fetchFromOgStorage(rootHash);
      return parseStoredRagFinding(content);
    } catch (error) {
      console.error('Failed to fetch RAG context from 0G:', error);
      return null;
    }
  }));

  return findings.filter((finding): finding is RagFindingRecord => Boolean(finding));
}

async function storeFindingToRag(finding: RagFindingRecord): Promise<void> {
  if (!isRagConfigured()) {
    console.warn('RAG persistence skipped: Qdrant or embedding credentials are missing');
    return;
  }

  const embeddingText = buildEmbeddingText(finding);
  const embedding = await embedText(embeddingText);
  if (embedding.length === 0) return;

  const record: RagFindingRecord = {
    ...finding,
    embeddingText,
  };

  const storageResult = await uploadToOgStorage('ai-findings-rag', `${finding.id}.json`, JSON.stringify(record));
  await upsertQdrantPoint(finding.id, embedding, {
    rootHash: storageResult.uri,
    vulnerabilityType: finding.vulnerabilityType,
    severity: finding.severity,
    swcId: finding.swcId,
    contractHash: finding.contractHash,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    timestamp: finding.timestamp,
  });
}

async function persistAuditFindingsToRag(params: {
  contractId: string;
  auditId: string;
  contractSource: string;
  findings: StoredFindingRow[];
  vulnerabilities: AuditVulnerability[];
}): Promise<void> {
  if (!isRagConfigured() || params.findings.length === 0 || params.vulnerabilities.length === 0) return;

  const contractHash = await sha256Hex(params.contractSource);

  await Promise.all(params.findings.map(async (finding, index) => {
    const vulnerability = params.vulnerabilities[index];
    if (!finding?.uuid || !vulnerability) return;

    const lineStart = typeof vulnerability.start_line === 'number'
      ? vulnerability.start_line
      : (finding.line_start ?? 1);
    const lineEnd = typeof vulnerability.end_line === 'number'
      ? vulnerability.end_line
      : (finding.line_end ?? lineStart);

    const ragFinding: RagFindingRecord = {
      id: finding.uuid,
      contractId: params.contractId,
      contractHash,
      vulnerabilityType: finding.title || vulnerability.name || 'Security Finding',
      severity: toRagSeverity(finding.severity || vulnerability.severity),
      swcId: extractSwcId(vulnerability.name, vulnerability.reasoning_trace),
      codeSnippet: extractLines(params.contractSource, lineStart, lineEnd),
      functionContext: extractContextWindow(params.contractSource, lineStart, lineEnd),
      explanation: finding.description || (Array.isArray(vulnerability.reasoning_trace) ? vulnerability.reasoning_trace.join('\n') : 'No explanation provided'),
      lineStart,
      lineEnd,
      timestamp: Date.now(),
      auditId: params.auditId,
      isVerified: false,
      remediation: typeof vulnerability.suggested_code === 'string' ? vulnerability.suggested_code : undefined,
      attackTrace: vulnerability.attack_trace ?? null,
    };

    try {
      await storeFindingToRag(ragFinding);
    } catch (error) {
      console.error(`Failed to persist finding ${finding.uuid} to RAG:`, error);
    }
  }));
}

async function handleCodegen(_req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { prompt, contract_id } = body;

  if (!prompt || typeof prompt !== 'string') {
    return badRequest('prompt is required');
  }

  let contractRowId: number;
  let contractUuid: string;
  if (contract_id && typeof contract_id === 'string') {
    const { data: existing, error: existingError } = await supabase
      .from('contracts')
      .select('id, uuid, owner_id, is_catalog')
      .eq('uuid', contract_id)
      .single();
    if (existingError || !existing) return notFound('Contract not found');
    if (existing.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
    if (existing.is_catalog) return badRequest('Cannot codegen into catalog contract');
    contractRowId = existing.id;
    contractUuid = existing.uuid;
  } else {
    const { data: newContract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        owner_id: auth.user_id,
        is_catalog: false,
        name: `Generated Contract - ${new Date().toISOString().slice(0, 10)}`,
        language: 'solidity',
        status: 'draft',
        source_code: [],
      })
      .select('id, uuid')
      .single();

    if (contractError || !newContract) {
      console.error('Failed to create contract:', contractError);
      return serverError('Failed to create contract');
    }
    contractRowId = newContract.id;
    contractUuid = newContract.uuid;
  }

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contractRowId,
      kind: 'codegen',
      status: 'pending',
    })
    .select('id, uuid')
    .single();

  if (auditError || !audit) return serverError('Failed to create audit record');

  try {
    let retrievedFindings: RagFindingRecord[] = [];
    try {
      retrievedFindings = await retrieveRelevantFindings(prompt, RAG_TOP_K);
    } catch (error) {
      console.error('Codegen RAG retrieval failed, continuing without context:', error);
    }

    const aiResponse = await aiFetch({
      prompt: buildCodegenPrompt(prompt, retrievedFindings),
      system_prompt: AI_CODEGEN_SYSTEM_PROMPT,
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      throw new Error(`AI service ${aiResponse.status}: ${errBody}`);
    }

    const aiData = await aiResponse.json();
    const parsed = parseAIResponse(aiData);
    const generatedCode = parsed.code || '';
    const mitigations = parsed.mitigations;

    if (Array.isArray(mitigations) && mitigations.length > 0) {
      const findings = mitigations.map((mitigation: Record<string, unknown>) => ({
        audit_id: audit.id,
        severity: 'info',
        title: (typeof mitigation.name === 'string' && mitigation.name) || 'Vulnerability Mitigation',
        description: typeof mitigation.reason === 'string' ? mitigation.reason : '',
        line_start: typeof mitigation.start_line === 'number' ? mitigation.start_line : null,
        line_end: typeof mitigation.end_line === 'number' ? mitigation.end_line : null,
        status: 'open',
        reasoning_trace: { mitigation },
      }));

      const { error: findingError } = await supabase.from('ai_findings').insert(findings);
      if (findingError) {
        console.error('Failed to insert ai_findings:', findingError);
      }
    } else {
      const { error: findingError } = await supabase
        .from('ai_findings')
        .insert({
          audit_id: audit.id,
          severity: 'info',
          title: 'Generated Smart Contract',
          description: `Generated code:\n\n${generatedCode}`,
          status: 'open',
        });

      if (findingError) {
        console.error('Failed to insert ai_finding:', findingError);
      }
    }

    if (generatedCode) {
      const sourceBlocks = codeStringToSourceBlocks(generatedCode);
      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          source_code: sourceBlocks,
        })
        .eq('id', contractRowId);

      if (updateError) {
        console.error('Failed to update contract:', updateError);
      }
    }

    await supabase
      .from('audits')
      .update({
        status: 'succeeded',
        completed_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    return json({
      contract_id: contractUuid,
      audit_id: audit.uuid,
      generated_code: generatedCode,
      mitigations,
      rag: {
        enabled: isRagConfigured(),
        retrieved_count: retrievedFindings.length,
      },
    }, 200);
  } catch (e) {
    console.error('Codegen job failed:', e);
    await supabase
      .from('audits')
      .update({ status: 'failed' })
      .eq('id', audit.id);
    return serverError(`Codegen failed: ${String(e)}`);
  }
}

async function handleAudit(_req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { code, contract_id } = body;

  if (!code || typeof code !== 'string') {
    return badRequest('code (raw smart contract string) is required');
  }

  let contractRowId: number;
  let contractUuid: string;
  if (contract_id && typeof contract_id === 'string') {
    const { data: existing, error: existingError } = await supabase
      .from('contracts')
      .select('id, uuid, owner_id, is_catalog')
      .eq('uuid', contract_id)
      .single();
    if (existingError || !existing) return notFound('Contract not found');
    if (existing.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
    if (existing.is_catalog) return badRequest('Cannot audit catalog contract via this endpoint');
    contractRowId = existing.id;
    contractUuid = existing.uuid;

    const { data: priorAudits, error: priorAuditsError } = await supabase
      .from('audits')
      .select('id')
      .eq('contract_id', contractRowId)
      .eq('kind', 'audit');
    if (priorAuditsError) {
      console.error('Failed to load prior audits:', priorAuditsError);
      return serverError('Failed to reset previous audit');
    }
    if (priorAudits && priorAudits.length > 0) {
      const priorAuditIds = priorAudits.map((a: { id: number }) => a.id);
      const { error: delFindingsError } = await supabase
        .from('ai_findings')
        .delete()
        .in('audit_id', priorAuditIds);
      if (delFindingsError) {
        console.error('Failed to delete prior ai_findings:', delFindingsError);
        return serverError('Failed to reset previous audit findings');
      }
      const { error: delAuditsError } = await supabase
        .from('audits')
        .delete()
        .in('id', priorAuditIds);
      if (delAuditsError) {
        console.error('Failed to delete prior audits:', delAuditsError);
        return serverError('Failed to reset previous audits');
      }
    }

    const { error: syncError } = await supabase
      .from('contracts')
      .update({ source_code: codeStringToSourceBlocks(code) })
      .eq('id', contractRowId);
    if (syncError) {
      console.error('Failed to sync contract source_code:', syncError);
    }
  } else {
    const { data: newContract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        owner_id: auth.user_id,
        is_catalog: false,
        name: `Audited Contract - ${new Date().toISOString().slice(0, 10)}`,
        language: 'solidity',
        status: 'draft',
        source_code: codeStringToSourceBlocks(code),
      })
      .select('id, uuid')
      .single();
    if (contractError || !newContract) {
      console.error('Failed to create contract:', contractError);
      return serverError('Failed to create contract');
    }
    contractRowId = newContract.id;
    contractUuid = newContract.uuid;
  }

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contractRowId,
      kind: 'audit',
      status: 'pending',
    })
    .select('id, uuid')
    .single();
  if (auditError || !audit) return serverError('Failed to create audit record');

  try {
    let retrievedFindings: RagFindingRecord[] = [];
    try {
      retrievedFindings = await retrieveRelevantFindings(code, RAG_TOP_K);
    } catch (error) {
      console.error('Audit RAG retrieval failed, continuing without context:', error);
    }

    const aiResponse = await aiFetch({
      prompt: buildAuditPrompt(code, retrievedFindings),
      system_prompt: AI_CODEAUDIT_SYSTEM_PROMPT,
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      throw new Error(`AI service ${aiResponse.status}: ${errBody}`);
    }

    const aiData = await aiResponse.json();
    const parsed = parseAuditResponse(aiData);
    const findings = parsed.vulnerabilities.length > 0
      ? parsed.vulnerabilities.map((v) => ({
          audit_id: audit.id,
          severity: normalizeSeverity(v.severity),
          title: v.name || 'Security Finding',
          description: Array.isArray(v.reasoning_trace) ? v.reasoning_trace.join('\n') : '',
          line_start: typeof v.start_line === 'number' ? v.start_line : null,
          line_end: typeof v.end_line === 'number' ? v.end_line : null,
          confidence: typeof v.confidence === 'number' ? v.confidence : null,
          status: 'open',
          reasoning_trace: { vulnerability: v },
          remediation: v.suggested_code ? { suggested_code: v.suggested_code } : null,
          attack_trace: v.attack_trace ?? null,
        }))
      : [{
          audit_id: audit.id,
          severity: 'info',
          title: 'Security Audit Finding',
          description: typeof aiData === 'string' ? aiData : JSON.stringify(aiData),
          status: 'open',
        }];

    const { data: inserted, error: findingError } = await supabase
      .from('ai_findings')
      .insert(findings)
      .select('uuid, severity, title, description, line_start, line_end, confidence, status, attack_trace, remediation');

    if (findingError || !inserted) {
      console.error('Failed to insert ai_findings:', findingError);
      throw new Error('Failed to save audit findings');
    }

    try {
      await persistAuditFindingsToRag({
        contractId: contractUuid,
        auditId: audit.uuid,
        contractSource: code,
        findings: inserted as StoredFindingRow[],
        vulnerabilities: parsed.vulnerabilities,
      });
    } catch (error) {
      console.error('Failed to persist audit findings into RAG:', error);
    }

    await supabase
      .from('audits')
      .update({
        status: 'succeeded',
        completed_at: new Date().toISOString(),
        summary: parsed.code_fixed ? 'Audit completed with suggested fixes' : 'Audit completed',
      })
      .eq('id', audit.id);

    return json({
      contract_id: contractUuid,
      audit_id: audit.uuid,
      code_fixed: parsed.code_fixed,
      findings: inserted,
      rag: {
        enabled: isRagConfigured(),
        retrieved_count: retrievedFindings.length,
        collection: QDRANT_COLLECTION,
      },
    }, 200);
  } catch (e) {
    console.error('Audit job failed:', e);
    await supabase
      .from('audits')
      .update({ status: 'failed' })
      .eq('id', audit.id);
    return serverError(`Audit failed: ${String(e)}`);
  }
}
