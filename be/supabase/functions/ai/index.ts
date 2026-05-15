import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { uploadToOgStorage, fetchFromOgStorage } from '../_shared/og-storage.ts';
import { VoyageAIClient } from 'npm:voyageai@0.2.1';
import { QdrantClient } from 'npm:@qdrant/js-client-rest@1.18.0';

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
const AI_CODEAUDIT_SYSTEM_PROMPT_V2 = `
Role: You are a Senior Smart Contract Auditor.

Task: Analyze the provided Solidity code for vulnerabilities and provide production-ready fixes.

Input: A raw UTF-8 string of Solidity code.

Protocol:
1) Index the input as 1-based lines.
2) Identify vulnerabilities with severity + confidence.
3) Produce a full code_fixed (the full corrected contract).
4) For each vulnerability, provide a remediation plan that is safe to apply:
   - If the issue is on a single line, remediation.mode MUST be "line" and the fix MUST target only that line.
   - If the issue is inside a function, remediation.mode MUST be "function" and the fix MUST provide a full replacement for that function.

Output Rules (STRICT):
- JSON ONLY. Return a single JSON object, no markdown, no extra text.
- start_line/end_line MUST reference the ORIGINAL input lines.
- For remediation.mode="line":
  - remediation.line MUST equal start_line and end_line.
  - remediation.replacement_line MUST be a single line (no "\\n"). Use empty string "" to delete that line.
- For remediation.mode="function":
  - remediation.function_name MUST be the Solidity function name.
  - remediation.replacement_function MUST be the FULL function code:
    - Must start with "function <name>"
    - Must include the full body with balanced braces.
    - Must NOT include any extra closing brace that belongs OUTSIDE the function.
- ATTACK TRACE (MANDATORY):
  - For EACH vulnerability with severity in {critical, high, medium}, you MUST output a non-empty attack_trace.
  - attack_trace MUST describe a realistic attacker flow against THIS contract in a step-by-step manner (setup → trigger → exploit loop/abuse → outcome).
  - attack_trace.nodes MUST contain at least 4 nodes, including:
    1) an attacker EOA,
    2) an attacker contract (if applicable),
    3) the victim contract,
    4) the vulnerable function (as a Function node).
  - attack_trace.edges MUST contain at least 3 edges and MUST reference node ids in nodes[].id.
  - Include a narrative steps list in attack_trace.metadata.steps (>= 4 steps). Each step must explain what happens and why it succeeds.

JSON Schema:
{
  "code_fixed": "string",
  "vulnerabilities": [
    {
      "name": "string",
      "reasoning_trace": ["string"],
      "start_line": number,
      "end_line": number,
      "severity": "critical|high|medium|low|info",
      "confidence": number,
      "remediation": {
        "mode": "line|function",
        "line": number,
        "replacement_line": "string",
        "function_name": "string",
        "replacement_function": "string"
      },
      "attack_trace": {
        "traceId": "string",
        "nodes": [{ "id": "string", "label": "string", "type": "string", "address": "string" }],
        "edges": [{ "from": "string", "to": "string", "action": "string", "value": "string", "status": "string" }],
        "metadata": {
          "blockNumber": number,
          "confidence": number,
          "vulnerability": "string",
          "steps": [
            {
              "step": number,
              "title": "string",
              "description": "string",
              "from": "string (node id, optional)",
              "to": "string (node id, optional)",
              "action": "string (optional)"
            }
          ]
        }
      }
    }
  ]
}
`.trim();

// constant AI System Prompt
const AI_CODEGEN_SYSTEM_PROMPT = `
Role: Lead Blockchain Security Architect & Smart Contract Auditor.

Task: Generate a production-ready Solidity smart contract AND report the security mitigations you included.

Hard Requirements:
1) Solidity ^0.8.20.
2) Use OpenZeppelin where appropriate (AccessControl, ReentrancyGuard, SafeERC20).
3) Use CEI + Pull-over-Push patterns where relevant.

Output Rules (STRICT):
- JSON ONLY. Return a single JSON object. No markdown, no backticks, no extra text.
- The field "code" MUST be the full Solidity source as a string using "\\n" for newlines.
- LINE ACCURACY: The mitigation line numbers MUST reference the generated "code" string (1-based line index).
- For each mitigation, "excerpt" MUST be exactly the lines from "code" for start_line..end_line joined with "\\n".
- Keep "vulnerability_mitigations" concise: max 8 items. Prefer high-impact security mitigations only.

JSON Schema:
{
  "contract_name": "string (Short PascalCase, e.g. MyToken, RoyaltyNFT)",
  "code": "string",
  "vulnerability_mitigations": [
    {
      "name": "string",
      "reason": "string",
      "start_line": number,
      "end_line": number,
      "excerpt": "string"
    }
  ]
}
`.trim();
const AI_CODEAUDIT_SYSTEM_PROMPT = "**Role:** You are a Senior Smart Contract Auditor.\n\n**Task:** Analyze the provided raw Solidity string for vulnerabilities and provide a production-ready fix.\n\n**Input:** A raw UTF-8 string of Solidity code.\n\n**Protocol:**\n\n1. **Index:** Treat the input as a list of lines starting at line 1.\n2. **Audit:** Identify Critical (Reentrancy, Logic), High (Access Control), Medium (Arithmetic, DoS), and Low (Gas, NatSpec) issues.\n3. **Remediate:** Produce a full `code_fixed` version using OpenZeppelin standards and the Checks-Effects-Interactions (CEI) pattern.\n4. **Patch Instructions (IMPORTANT):** For each vulnerability, output a deterministic `patch` object describing exactly what to change. This patch is what the frontend will apply.\n\n**Output Rules (STRICT):**\n\n* **JSON ONLY.** Your entire response must be a single, valid JSON object.\n* **NO MARKDOWN WRAPPERS.** Do not use `json or ` blocks.\n* **Start your response directly with `{` and end with `}`.**\n* **NO CONVERSATIONAL TEXT.**\n* **LINE ACCURACY.** `start_line` and `end_line` must match the 1-based index of the ORIGINAL input string.\n* **PATCH ACCURACY.** `patch.start_line` and `patch.end_line` must point to the exact lines in the ORIGINAL input that should be edited.\n* **REPLACE MUST PRESERVE BLOCK SHAPE.** When `patch.op` is `replace`, `patch.replacement` MUST contain the FULL replacement block for lines `patch.start_line..patch.end_line`, including any unchanged lines. The number of lines in `patch.replacement` must equal `(patch.end_line - patch.start_line + 1)`.\n* **VERBATIM REPLACEMENT.** `patch.replacement` must be final Solidity code (may be multi-line). Do not output partial snippets for a multi-line replace.\n\n**JSON Schema:**\n\n{\n  \"code_fixed\": \"string\",\n  \"vulnerabilities\": [\n    {\n      \"name\": \"string\",\n      \"reasoning_trace\": [\"string\"],\n      \"start_line\": number,\n      \"end_line\": number,\n      \"severity\": \"critical|high|medium|low|info\",\n      \"confidence\": number,\n      \"patch\": {\n        \"op\": \"replace|insert_before|insert_after|delete\",\n        \"start_line\": number,\n        \"end_line\": number,\n        \"replacement\": \"string\"\n      },\n      \"attack_trace\": { ... }\n    }\n  ]\n}\n";

const runtimeDeno = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
const env = runtimeDeno?.env;

const AI_CHAT_API_URL = env?.get('AI_CHAT_API_URL') || 'https://ai.sumopod.com/v1/chat/completions';
const AI_CHAT_MODEL = env?.get('AI_CHAT_MODEL') || 'gemini/gemini-3.1-flash-lite-preview';
const VOYAGE_API_KEY = env?.get('VOYAGE_API_KEY') || '';
const VOYAGE_MODEL = env?.get('VOYAGE_MODEL') || 'voyage-code-2';
const QDRANT_URL = (env?.get('QDRANT_URL') || '').replace(/\/+$/, '');
const QDRANT_API_KEY = env?.get('QDRANT_API_KEY') || '';
const QDRANT_COLLECTION = env?.get('QDRANT_COLLECTION') || 'zerovuln_audit_findings';
const RAG_TOP_K = Math.max(1, Number.parseInt(env?.get('RAG_TOP_K') || '5', 10) || 5);

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

// const AI_CODEGEN_SYSTEM_PROMPT = "Target: Lead Blockchain Security Architect and Smart Contract Auditor.\nRole: Generate high-security Solidity smart contracts and provide a detailed forensic trace of an averted attack.\n\nOperational Rules:\n1. Standards: Solidity ^0.8.20, OpenZeppelin (AccessControl, ReentrancyGuard, SafeERC20).\n2. Patterns: Checks-Effects-Interactions, Pull-over-Push.\n3. Output Requirement: Valid JSON only. Do NOT use markdown code blocks, backticks, or conversational text.\n\nCRITICAL WORKFLOW:\nStep 1: Generate a production-ready Solidity contract.\nStep 2: Identify specific mitigations within the code line-by-line.\nStep 3: Simulate a flow tracing of a failed hack attempt against this implementation.\n\nJSON Structure:\n{\n  \"code\": \"string (Use \\n for new lines and escape internal quotes)\",\n  \"vulnerability_mitigations\": [\n    {\n      \"name\": \"string\",\n      \"reason\": \"string\",\n      \"start_line\": number,\n      \"end_line\": number\n    }\n  ]\n}\n\nConstraint: The response must be a single raw JSON object.";
// const AI_CODEAUDIT_SYSTEM_PROMPT = "Role: You are a senior smart contract auditor. Analyze the provided Solidity source for vulnerabilities and provide a production-ready fix.\n\nProtocol:\n1. Treat the source as a 1-based list of lines.\n2. Audit for critical, high, medium, low, and informational issues.\n3. Produce a corrected code_fixed version using OpenZeppelin standards and the CEI pattern when relevant.\n4. Map exact line numbers from the original input.\n\nOutput rules:\n- JSON only.\n- No markdown wrappers.\n- Start with { and end with }.\n- suggested_code must be a verbatim extract from code_fixed.\n\nJSON Schema:\n{\n  \"code_fixed\": \"string\",\n  \"vulnerabilities\": [\n    {\n      \"name\": \"string\",\n      \"reasoning_trace\": [\"string\"],\n      \"start_line\": number,\n      \"end_line\": number,\n      \"severity\": \"critical|high|medium|low|info\",\n      \"confidence\": number,\n      \"suggested_code\": \"string\",\n      \"attack_trace\": {\n        \"traceId\": \"string\",\n        \"nodes\": [{ \"id\": \"string\", \"label\": \"string\", \"type\": \"string\", \"address\": \"string\" }],\n        \"edges\": [{ \"from\": \"string\", \"to\": \"string\", \"label\": \"string\" }]\n      }\n    }\n  ]\n}";

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

function isRagConfigured(): boolean {
  return Boolean(QDRANT_URL && VOYAGE_API_KEY);
}

async function embedText(text: string): Promise<number[]> {
  const client = getVoyageClient();
  if (!client) {
    console.warn('RAG embedding skipped: VOYAGE_API_KEY is not configured');
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

async function searchQdrant(vector: number[], limit: number): Promise<QdrantSearchPoint[]> {
  const client = getQdrantClient();
  if (!client || vector.length === 0) return [];

  try {
    const results = await client.search(QDRANT_COLLECTION, {
      vector,
      limit,
      with_payload: true,
      with_vector: false,
    });

    return results.map((point: { id: number | string; payload?: Record<string, unknown> | null }) => ({
      id: String(point.id),
      payload: (point.payload ?? {}) as QdrantPointPayload,
    }));
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 404) return [];
    throw error;
  }
}

async function upsertQdrantPoint(id: string, vector: number[], payload: QdrantPointPayload): Promise<void> {
  const client = getQdrantClient();
  if (!client || vector.length === 0) return;

  await ensureQdrantCollection(client, vector.length);
  await client.upsert(QDRANT_COLLECTION, {
    wait: true,
    points: [
      {
        id,
        vector,
        payload: payload as Record<string, unknown>,
      },
    ],
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
function isDefaultGeneratedName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return /^Generated Contract - \d{4}-\d{2}-\d{2}$/.test(name);
}

function isDefaultAuditedName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return /^Audited Contract - \d{4}-\d{2}-\d{2}$/.test(name);
}

function extractPrimaryContractName(code: string): string | null {
  if (!code) return null;
  // Find first `contract Name` (also matches `abstract contract Name`)
  const m = code.match(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (!m?.[1]) return null;
  const name = m[1].trim();
  // Basic sanity check: keep it short & simple
  if (name.length < 2 || name.length > 64) return null;
  return name;
}

function sanitizeContractName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Keep only a simple Solidity identifier (PascalCase typically)
  const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!m?.[1]) return null;
  if (m[1].length > 64) return null;
  return m[1];
}

function parseAIResponse(aiData: unknown) {
  const payload = extractAIContent(aiData);

  if (payload && typeof payload === 'object') {
    const p = payload as { contract_name?: unknown; code?: unknown; vulnerability_mitigations?: unknown };
    const contract_name = sanitizeContractName(p.contract_name);
    const code = typeof p.code === 'string' ? p.code : '';
    const mitigations = Array.isArray(p.vulnerability_mitigations) ? p.vulnerability_mitigations : [];
    return { contract_name, code, mitigations, raw: payload };
  }

  return { contract_name: null, code: typeof payload === 'string' ? payload : '', mitigations: [], raw: payload };
}

type CodegenMitigation = {
  name: string;
  reason: string;
  start_line: number;
  end_line: number;
  excerpt?: string;
};

function normalizeCodegenMitigations(
  mitigations: unknown[],
  codeLines: string[],
): CodegenMitigation[] {
  const maxItems = 8;
  const out: CodegenMitigation[] = [];

  const toInt = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string') {
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  for (const m of mitigations) {
    if (!m || typeof m !== 'object') continue;
    const mm = m as Record<string, unknown>;
    const name = typeof mm.name === 'string' ? mm.name.trim() : '';
    const reason = typeof mm.reason === 'string' ? mm.reason.trim() : '';
    const start = toInt(mm.start_line);
    const end = toInt(mm.end_line);
    const excerpt = typeof mm.excerpt === 'string' ? mm.excerpt : undefined;

    if (!name || !reason) continue;
    if (start === null || end === null) continue;
    if (start < 1 || end < start || end > codeLines.length) continue;

    // Keep ranges reasonably small to avoid noisy/incorrect broad claims.
    if (end - start + 1 > 80) continue;

    const expectedExcerpt = codeLines.slice(start - 1, end).join('\n');
    if (excerpt !== undefined) {
      // Strict match (prompt requires exact). If mismatch, drop.
      if (excerpt !== expectedExcerpt) continue;
    }

    out.push({ name, reason, start_line: start, end_line: end, excerpt: expectedExcerpt });
    if (out.length >= maxItems) break;
  }

  return out;
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
  let existingName: string | null = null;
  if (contract_id && typeof contract_id === 'string') {
    const { data: existing, error: existingError } = await supabase
      .from('contracts')
      .select('id, uuid, owner_id, is_catalog, name')
      .eq('uuid', contract_id)
      .single();
    if (existingError || !existing) return notFound('Contract not found');
    if (existing.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
    if (existing.is_catalog) return badRequest('Cannot codegen into catalog contract');
    contractRowId = existing.id;
    contractUuid = existing.uuid;
    existingName = typeof existing.name === 'string' ? existing.name : null;
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
      .select('id, uuid, name')
      .single();

    if (contractError || !newContract) {
      console.error('Failed to create contract:', contractError);
      return serverError('Failed to create contract');
    }
    contractRowId = newContract.id;
    contractUuid = newContract.uuid;
    existingName = typeof newContract.name === 'string' ? newContract.name : null;
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
    const codeLines = generatedCode ? generatedCode.split(/\r?\n/) : [];
    const mitigations = normalizeCodegenMitigations(parsed.mitigations, codeLines);
    const suggestedName =
      parsed.contract_name ||
      (generatedCode ? extractPrimaryContractName(generatedCode) : null);

    // Insert ai_findings for each vulnerability mitigation
    if (mitigations.length > 0) {
      const findings = mitigations.map((mitigation) => ({
        audit_id: audit.id,
        severity: 'info',
        title: mitigation.name || 'Vulnerability Mitigation',
        description: mitigation.reason || '',
        line_start: mitigation.start_line ?? null,
        line_end: mitigation.end_line ?? null,
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
          title: 'Mitigations unavailable',
          description:
            'AI did not return valid vulnerability mitigations for this generated contract.',
          status: 'open',
        });

      if (findingError) {
        console.error('Failed to insert ai_finding:', findingError);
      }
    }

    // Update contract with generated code as source_code line blocks (+ set AI-based name if default)
    if (generatedCode) {
      const sourceBlocks = codeStringToSourceBlocks(generatedCode);
      const shouldUpdateName =
        !!suggestedName && (existingName === null || isDefaultGeneratedName(existingName));
      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          source_code: sourceBlocks,
          ...(shouldUpdateName ? { name: suggestedName } : {}),
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
  let existingName: string | null = null;
  if (contract_id && typeof contract_id === 'string') {
    const { data: existing, error: existingError } = await supabase
      .from('contracts')
      .select('id, uuid, owner_id, is_catalog, name')
      .eq('uuid', contract_id)
      .single();
    if (existingError || !existing) return notFound('Contract not found');
    if (existing.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
    if (existing.is_catalog) return badRequest('Cannot audit catalog contract via this endpoint');
    contractRowId = existing.id;
    contractUuid = existing.uuid;
    existingName = typeof existing.name === 'string' ? existing.name : null;

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
      .select('id, uuid, name')
      .single();
    if (contractError || !newContract) {
      console.error('Failed to create contract:', contractError);
      return serverError('Failed to create contract');
    }
    contractRowId = newContract.id;
    contractUuid = newContract.uuid;
    existingName = typeof newContract.name === 'string' ? newContract.name : null;
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
      system_prompt: AI_CODEAUDIT_SYSTEM_PROMPT_V2,
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      throw new Error(`AI service ${aiResponse.status}: ${errBody}`);
    }

    const aiData = await aiResponse.json();
    const parsed = parseAuditResponse(aiData);
    const inputLines = code.split(/\r?\n/);
    const nameFromCode =
      extractPrimaryContractName(parsed.code_fixed || '') || extractPrimaryContractName(code);
    const shouldUpdateName =
      !!nameFromCode && (existingName === null || isDefaultAuditedName(existingName));
    if (shouldUpdateName) {
      const { error: nameErr } = await supabase
        .from('contracts')
        .update({ name: nameFromCode })
        .eq('id', contractRowId);
      if (nameErr) console.error('Failed to update contract name:', nameErr);
    }
    const findings = parsed.vulnerabilities.length > 0
      ? parsed.vulnerabilities.map((v) => {
          const remediation = normalizeRemediation(v.remediation, v, inputLines);
          const patch = normalizePatch(v.patch, inputLines);
          const sev = typeof v.severity === 'string' ? v.severity.toLowerCase() : '';
          const mustHaveTrace = sev === 'critical' || sev === 'high' || sev === 'medium';
          const attackTrace =
            v.attack_trace && typeof v.attack_trace === 'object'
              ? v.attack_trace
              : mustHaveTrace
                ? fallbackAttackTrace(v)
                : null;
          return ({
          audit_id: audit.id,
          severity: normalizeSeverity(v.severity),
          title: v.name || 'Security Finding',
          description: Array.isArray(v.reasoning_trace) ? v.reasoning_trace.join('\n') : '',
          line_start: typeof v.start_line === 'number' ? v.start_line : null,
          line_end: typeof v.end_line === 'number' ? v.end_line : null,
          confidence: typeof v.confidence === 'number' ? v.confidence : null,
          status: 'open',
          reasoning_trace: { vulnerability: v },
          remediation: remediation
            ? remediation
            : patch
              ? { patch }
              : v.suggested_code
                ? { suggested_code: v.suggested_code }
                : null,
          attack_trace: attackTrace,
        });
      })
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

type FindingPatchOp = 'replace' | 'insert_before' | 'insert_after' | 'delete';
type FindingPatch = {
  op: FindingPatchOp;
  start_line: number;
  end_line: number;
  replacement?: string;
};

function countCurlyBraces(s: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  for (const ch of s) {
    if (ch === '{') open++;
    if (ch === '}') close++;
  }
  return { open, close };
}

type FindingRemediationMode = 'line' | 'function';
type FindingRemediation =
  | {
      mode: 'line';
      line: number;
      replacement_line: string;
    }
  | {
      mode: 'function';
      function_name: string;
      replacement_function: string;
    };

function fallbackAttackTrace(vuln: { name?: string; start_line?: number; end_line?: number }): Record<string, unknown> {
  const vulnName = typeof vuln.name === 'string' && vuln.name.trim() ? vuln.name.trim() : 'Vulnerability';
  const range =
    typeof vuln.start_line === 'number' && typeof vuln.end_line === 'number'
      ? `lines ${vuln.start_line}-${vuln.end_line}`
      : 'unknown lines';

  return {
    traceId: `fallback-${Date.now()}`,
    nodes: [
      { id: 'attacker_eoa', type: 'EOA', label: 'Attacker EOA', address: '0xATTACKER' },
      { id: 'victim', type: 'Contract', label: 'Victim Contract', address: '0xVICTIM' },
      { id: 'vuln_fn', type: 'Function', label: `Vulnerable path (${range})`, address: '-' },
      { id: 'attacker_contract', type: 'Contract', label: 'Attacker Contract (optional)', address: '0xATTACKER_CONTRACT' },
    ],
    edges: [
      { from: 'attacker_eoa', to: 'victim', action: 'Prepare state (deposit / setup)', value: '', status: 'success' },
      { from: 'attacker_eoa', to: 'vuln_fn', action: 'Call vulnerable function', value: '', status: 'success' },
      { from: 'attacker_contract', to: 'victim', action: 'Re-enter / abuse external call (if applicable)', value: '', status: 're-entrant' },
    ],
    metadata: {
      blockNumber: 0,
      confidence: 35,
      vulnerability: vulnName,
      steps: [
        {
          step: 1,
          title: 'Setup',
          description: 'Attacker prepares the required preconditions (e.g., funds deposited, roles/allowances set, or state primed).',
          from: 'attacker_eoa',
          to: 'victim',
          action: 'setup',
        },
        {
          step: 2,
          title: 'Trigger',
          description: `Attacker calls the vulnerable path (${range}).`,
          from: 'attacker_eoa',
          to: 'vuln_fn',
          action: 'trigger',
        },
        {
          step: 3,
          title: 'Exploit',
          description:
            'If the victim performs an external call before updating state (or uses unsafe auth/oracle), attacker re-enters or manipulates control flow to extract value.',
          from: 'attacker_contract',
          to: 'victim',
          action: 'exploit',
        },
        {
          step: 4,
          title: 'Outcome',
          description:
            'Victim ends up in an inconsistent state or loses funds. Attacker stops once further exploitation is no longer profitable.',
        },
      ],
    },
  };
}

function normalizeRemediation(
  value: unknown,
  vuln: { start_line?: number; end_line?: number },
  sourceLines: string[],
): FindingRemediation | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const mode = v.mode;
  if (mode !== 'line' && mode !== 'function') return null;

  if (mode === 'line') {
    const line = v.line;
    const replacementLine = typeof v.replacement_line === 'string' ? v.replacement_line : '';
    if (typeof line !== 'number' || !Number.isFinite(line)) return null;
    if (line < 1 || line > sourceLines.length) return null;
    // Must be a single line (no newline).
    if (replacementLine.includes('\n') || replacementLine.includes('\r')) return null;
    // Must match vuln range (single-line finding).
    if (typeof vuln.start_line === 'number' && typeof vuln.end_line === 'number') {
      if (vuln.start_line !== vuln.end_line) return null;
      if (line !== vuln.start_line) return null;
    }
    return { mode: 'line', line, replacement_line: replacementLine };
  }

  const functionNameRaw = typeof v.function_name === 'string' ? v.function_name : '';
  const replacementFunction =
    typeof v.replacement_function === 'string' ? v.replacement_function : '';

  let functionName = functionNameRaw.trim();
  if (!functionName) {
    const m = replacementFunction.match(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (m?.[1]) functionName = m[1];
  }
  if (!functionName) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(functionName)) return null;
  if (!replacementFunction.trim()) return null;
  if (!replacementFunction.trimStart().startsWith(`function ${functionName}`)) return null;
  // Ensure braces are balanced in the replacement function itself.
  const b = countCurlyBraces(replacementFunction);
  if (b.open === 0 || b.open !== b.close) return null;

  return {
    mode: 'function',
    function_name: functionName,
    replacement_function: replacementFunction,
  };
}

function normalizePatch(value: unknown, sourceLines: string[]): FindingPatch | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  const op = v.op;
  if (
    op !== 'replace' &&
    op !== 'insert_before' &&
    op !== 'insert_after' &&
    op !== 'delete'
  ) {
    return null;
  }

  const start = v.start_line;
  const end = v.end_line;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 1 || end < start) return null;
  if (start > sourceLines.length || end > sourceLines.length) return null;

  const replacement = typeof v.replacement === 'string' ? v.replacement : '';

  // Safety rules to avoid destructive wide deletes/replaces caused by AI mis-mapping.
  if (op === 'delete') {
    // Deleting multiple lines is too risky; require single-line delete.
    if (end !== start) return null;
    return { op, start_line: start, end_line: end, replacement: '' };
  }
  if (op === 'insert_before' || op === 'insert_after') {
    // Treat insert as anchored to a single line.
    if (end !== start) return null;
    if (!replacement.trim()) return null;
    return { op, start_line: start, end_line: end, replacement };
  }
  // replace
  if (!replacement.trim()) return null;
  // Replacement must preserve block shape (line count) to avoid mangling surrounding lines.
  const expectedLines = end - start + 1;
  const actualLines = replacement.split(/\r?\n/).length;
  if (actualLines !== expectedLines) return null;

  // Additional safety: the replacement block must keep curly-brace balance
  // within the replaced range. This avoids cases where the AI includes an extra `}`
  // that actually belongs outside the range, causing `}}` after apply.
  const originalBlock = sourceLines.slice(start - 1, end).join('\n');
  const o = countCurlyBraces(originalBlock);
  const r = countCurlyBraces(replacement);
  if (o.open !== r.open || o.close !== r.close) return null;

  return { op, start_line: start, end_line: end, replacement };
}

interface AuditVulnerability {
  name?: string;
  severity?: string;
  start_line?: number;
  end_line?: number;
  confidence?: number;
  reasoning_trace?: string[];
  suggested_code?: unknown;
  remediation?: unknown;
  patch?: unknown;
  attack_trace?: unknown;
}
