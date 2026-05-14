import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { submitComputeJob } from '../_shared/og-storage.ts';

// constant AI System Prompt
const AI_CODEGEN_SYSTEM_PROMPT = "Target: Lead Blockchain Security Architect & Smart Contract Auditor.\nRole: Generate high-security Solidity smart contracts and provide a detailed forensic trace of an averted attack.\n\nOperational Rules:\n1. Standards: Solidity ^0.8.20, OpenZeppelin (AccessControl, ReentrancyGuard, SafeERC20).\n2. Patterns: Checks-Effects-Interactions, Pull-over-Push.\n3. Output Requirement: Valid JSON only. Do NOT use markdown code blocks, backticks, or any conversational text.\n\nCRITICAL WORKFLOW:\nStep 1: Generate a production-ready Solidity contract.\nStep 2: Identify specific mitigations within the code (line-by-line).\nStep 3: Simulate a 'Flow Tracing' of a failed hack attempt against this specific implementation.\n\nJSON Structure:\n{\n  \"code\": \"string (Single line string. Use \\n for newlines. Escape all internal quotes)\",\n  \"vulnerability_mitigations\": [\n    {\n      \"name\": \"string\",\n      \"reason\": \"string\",\n      \"start_line\": number,\n      \"end_line\": number\n    }\n  ]\n}\n\nConstraint: The response must be a single, raw JSON object. If you include any text outside the JSON braces, the system will fail.";
const AI_CODEAUDIT_SYSTEM_PROMPT = "Role: You are a Senior Smart Contract Auditor. Analyze the provided raw Solidity string for vulnerabilities and provide a production-ready fix.\n\nInput: A raw UTF-8 string of Solidity code.\n\nProtocol:\n1. Index: Internally treat the string as a list of lines starting at line 1.\n2. Audit: Identify Critical (Reentrancy, Logic), High (Access Control), Medium (Arithmetic, DoS), and Low (Gas, NatSpec) issues.\n3. Remediate: Create a `code_fixed` version using OpenZeppelin standards and the Checks-Effects-Interactions (CEI) pattern.\n4. Map: Track exactly which lines in the original code the vulnerabilities and fixes correspond to.\n\nOutput Rules (STRICT):\n* JSON ONLY. Your entire response must be a single, valid JSON object.\n* NO MARKDOWN WRAPPERS. Do not use `json or ` blocks.\n* Start your response directly with `{` and end with `}`.\n* NO CONVERSATIONAL TEXT.\n* LINE ACCURACY. `start_line` and `end_line` must match the 1-based index of the input string exactly.\n* VERBATIM FIX. `suggested_code` must be an exact substring/extract from your `code_fixed`.\n\nJSON Schema:\n\n```json\n{\n  \"code_fixed\": \"string (The raw string corrected and secured smart contract code)\",\n  \"vulnerabilities\": [\n    {\n      \"name\": \"string\",\n      \"reasoning_trace\": [\"string (Step-by-step PoC referencing line numbers)\"],\n      \"start_line\": number,\n      \"end_line\": number,\n      \"severity\": \"<critical or high or medium or low or info>\",\n      \"confidence\": number,\n      \"suggested_code\": \"string\"\n    }\n  ],\n  \"attack_trace\": {\n    \"traceId\": \"string (hex)\",\n    \"nodes\": [\n      {\n        \"id\": \"string\",\n        \"label\": \"string\",\n        \"type\": \"string\",\n        \"address\": \"string\"\n      }\n    ],\n    \"edges\": [\n      {\n        \"from\": \"string\",\n        \"to\": \"string\",\n        \"action\": \"string\",\n        \"value\": \"string (optional)\",\n        \"status\": \"string\"\n      }\n    ],\n    \"metadata\": {\n      \"blockNumber\": number,\n      \"confidence\": number,\n      \"vulnerability\": \"string\"\n    }\n  }\n}\n\n```";

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
  if (segment === 'ai-auto-fix') {
    return handleAutoFix(req, auth, body);
  }
  if (segment === 'ai-gas-opt') {
    return handleGasOpt(req, auth, body);
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

async function handleCodegen(_req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { prompt, contract_id } = body;

  if (!prompt || typeof prompt !== 'string') {
    return badRequest('prompt is required');
  }

  // Resolve contract: accept uuid from caller, otherwise create a fresh draft.
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
    const mitigations = parsed.mitigations;

    // Insert ai_findings for each vulnerability mitigation
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

    // Update contract with generated code as source_code line blocks
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
    // const aiEndpoint = Deno.env.get('AI_INFERENCE_URL') || 'http://localhost:8000';

    const aiResponse = await aiFetch({
      prompt: code,
      system_prompt: AI_CODEAUDIT_SYSTEM_PROMPT,
    });

    if (!aiResponse.ok) {
      throw new Error(`AI service returned ${aiResponse.status}`);
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
      .select('uuid, severity, title, description, line_start, line_end, confidence, status');

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
        attack_trace: parsed.attack_trace ?? null,
      })
      .eq('id', audit.id);

    return json({
      contract_id: contractUuid,
      audit_id: audit.uuid,
      code_fixed: parsed.code_fixed,
      findings: inserted,
      attack_trace: parsed.attack_trace,
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

interface AuditVulnerability {
  name?: string;
  severity?: string;
  start_line?: number;
  end_line?: number;
  confidence?: number;
  reasoning_trace?: string[];
  suggested_code?: unknown;
}

function parseAuditResponse(aiData: unknown): { code_fixed: string; vulnerabilities: AuditVulnerability[]; attack_trace: unknown } {
  const payload = extractAIContent(aiData);
  if (payload && typeof payload === 'object') {
    const p = payload as { code_fixed?: unknown; vulnerabilities?: unknown; attack_trace?: unknown };
    const code_fixed = typeof p.code_fixed === 'string' ? p.code_fixed : '';
    const vulnerabilities = Array.isArray(p.vulnerabilities) ? p.vulnerabilities as AuditVulnerability[] : [];
    const attack_trace = p.attack_trace ?? null;
    return { code_fixed, vulnerabilities, attack_trace };
  }
  return { code_fixed: '', vulnerabilities: [], attack_trace: null };
}

async function handleAutoFix(_req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { ai_finding_id } = body;

  if (!ai_finding_id || typeof ai_finding_id !== 'string') {
    return badRequest('ai_finding_id is required');
  }

  const { data: finding, error: findingError } = await supabase
    .from('ai_findings')
    .select('id, uuid, audit_id, description')
    .eq('uuid', ai_finding_id)
    .single();

  if (findingError || !finding) return notFound('AI finding not found');

  const { data: auditContract, error: auditContractError } = await supabase
    .from('audits')
    .select('id, contract_id, contracts(id, uuid, owner_id, is_catalog, source_code)')
    .eq('id', finding.audit_id)
    .single();
  if (auditContractError || !auditContract) return notFound('Parent audit not found');
  const contract = auditContract.contracts as unknown as { id: number; uuid: string; owner_id: number; is_catalog: boolean; source_code: unknown };
  if (contract.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
  if (contract.is_catalog) return badRequest('Cannot auto-fix catalog contract');

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contract.id,
      kind: 'auto_fix',
      status: 'pending',
    })
    .select()
    .single();

  if (auditError || !audit) return serverError('Failed to create audit record');

  try {
    const systemPrompt = `You are a smart contract security auto-fix assistant. Based on the vulnerability description, generate the fixed version of the code. Return a JSON array with:
- title: string
- severity: "critical" | "high" | "medium" | "low" | "info"
- description: string
- remediation: { before: string, after: string, explanation: string }`;

    const fullPrompt = `${systemPrompt}\n\nContract code:\n\`\`\`solidity\n${flattenSource(contract.source_code)}\n\`\`\`\n\nVulnerability to fix:\n${finding.description || 'Fix the identified issue'}`;

    await submitComputeJob(fullPrompt);

    await supabase
      .from('audits')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    await supabase
      .from('ai_findings')
      .update({ status: 'fixed' })
      .eq('uuid', ai_finding_id);

    return json({ audit_id: audit.uuid }, 202);
  } catch (e) {
    console.error('Auto-fix job failed:', e);
    await supabase
      .from('audits')
      .update({ status: 'failed' })
      .eq('id', audit.id);

    return serverError('Failed to submit auto-fix job');
  }
}

async function handleGasOpt(_req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { contract_id } = body;

  if (!contract_id || typeof contract_id !== 'string') {
    return badRequest('contract_id is required');
  }

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, uuid, owner_id, is_catalog, source_code')
    .eq('uuid', contract_id)
    .single();

  if (contractError || !contract) return notFound('Contract not found');
  if (contract.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
  if (contract.is_catalog) return badRequest('Cannot optimize catalog contract');

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contract.id,
      kind: 'gas_opt',
      status: 'pending',
    })
    .select()
    .single();

  if (auditError || !audit) return serverError('Failed to create audit record');

  try {
    const systemPrompt = `You are a smart contract gas optimization specialist. Analyze the Solidity code for gas optimization opportunities. Return a JSON array of findings, each with:
- title: string (e.g., "cache storage reads", "unnecessary storage writes")
- severity: "critical" | "high" | "medium" | "low" | "info"
- description: string (explanation of the optimization)
- gas_saved: number (estimated gas saved)
- remediation: { before: string, after: string, explanation: string }`;

    const fullPrompt = `${systemPrompt}\n\nContract code:\n\`\`\`solidity\n${flattenSource(contract.source_code)}\n\`\`\``;

    await submitComputeJob(fullPrompt);

    await supabase
      .from('audits')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    return json({ audit_id: audit.uuid }, 202);
  } catch (e) {
    console.error('Gas optimization job failed:', e);
    await supabase
      .from('audits')
      .update({ status: 'failed' })
      .eq('id', audit.id);

    return serverError('Failed to submit gas optimization job');
  }
}
