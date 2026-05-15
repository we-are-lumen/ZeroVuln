import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { submitComputeJob } from '../_shared/og-storage.ts';

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

Deno.serve(async (req: Request) => {
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

interface AIChatPayload {
  prompt: string;
  system_prompt: string;
}

async function aiFetch(payload: AIChatPayload): Promise<Response> {
  const apiUrl = 'https://ai.sumopod.com/v1/chat/completions';
  const apiKey = Deno.env.get('AI_API_KEY');
  const model = 'gemini/gemini-3.1-flash-lite-preview';
  const maxTokens =  1024;
  const temperature = 0.7;

  if (!apiKey) throw new Error('AI_API_KEY not configured');

  return await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: payload.system_prompt },
        { role: 'user', content: payload.prompt }
      ],
      max_tokens: maxTokens,
      temperature
    })
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

  // OpenAI-compatible: choices[0].message.content
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const choice = data.choices[0] as Record<string, unknown>;
    const message = choice?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === 'string') {
      try {
        return tryParseJson(content);
      } catch {
        return content;
      }
    }
  }

  // Legacy shape: { response: string | object }
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

function flattenSource(source: unknown): string {
  if (!Array.isArray(source)) return '';
  const parts: string[] = [];
  for (const entry of source) {
    if (entry && typeof entry === 'object' && 'code' in entry) {
      const code = (entry as { code?: unknown }).code;
      if (typeof code === 'string') parts.push(code);
    }
  }
  return parts.join('\n\n');
}

function codeStringToSourceBlocks(code: string) {
  return code.split(/\r?\n/).map((line, index) => ({ code: line, line: index + 1 }));
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

async function handleCodegen(_req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { prompt, contract_id } = body;

  if (!prompt || typeof prompt !== 'string') {
    return badRequest('prompt is required');
  }

  // Resolve contract: accept uuid from caller, otherwise create a fresh draft.
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

  // Create audit record
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
    // Call AI inference endpoint
    // const aiEndpoint = Deno.env.get('AI_INFERENCE_URL') || 'http://localhost:8000';
    
    const aiResponse = await aiFetch({
      prompt: prompt,
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

  // Resolve / create owning contract (cannot be null on auditor_findings; we use ai_findings here).
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

    // Re-audit: wipe previous audit findings + audit rows for this contract.
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
      const priorAuditIds = priorAudits.map((a) => a.id);
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

    // Sync contract source_code with the new code being audited.
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
    // const aiEndpoint = Deno.env.get('AI_INFERENCE_URL') || 'http://localhost:8000';

    const aiResponse = await aiFetch({
      prompt: code,
      system_prompt: AI_CODEAUDIT_SYSTEM_PROMPT_V2,
    });

    if (!aiResponse.ok) {
      throw new Error(`AI service returned ${aiResponse.status}`);
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

    if (findingError) {
      console.error('Failed to insert ai_findings:', findingError);
      throw new Error('Failed to save audit findings');
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

function normalizeSeverity(value: unknown): string {
  const valid = ['critical', 'high', 'medium', 'low', 'info'];
  if (typeof value === 'string' && valid.includes(value.toLowerCase())) return value.toLowerCase();
  return 'medium';
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
