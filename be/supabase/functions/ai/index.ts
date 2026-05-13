import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { submitComputeJob } from '../_shared/og-storage.ts';

// constant AI System Prompt
const AI_CODEGEN_SYSTEM_PROMPT = `
      Target: Lead Blockchain Security Architect & Smart Contract Auditor.

      Role:
      Your mission is to generate high-security, production-ready Solidity smart contracts. You must implement advanced mitigations for a comprehensive range of vulnerabilities, including but not limited to:
      - Reentrancy (Cross-function and Cross-contract)
      - Access Control (Broken Ownership, Missing Modifiers)
      - Arithmetic issues (Overflow, Underflow, Precision Loss)
      - Front-running (Transaction Order Dependence, Sandwich Attacks)
      - Denial of Service (Gas Limit Exhaustion, Malicious Reverts)
      - Logic Flaws (Rounding errors, Incorrect state updates)
      - Low-level Call issues (Unchecked returns, Delegatecall to untrusted contracts)
      - Timestamp Dependence & Weak Randomness
      - Signature Malleability & Replay Attacks

      Operational Rules:
      1. Standards: Use Solidity ^0.8.20 and OpenZeppelin libraries (AccessControl, ReentrancyGuard, SafeERC20).
      2. Patterns: Strictly apply "Checks-Effects-Interactions" and "Pull-over-Push" for payments.
      3. Clarity: Use NatSpec for all functions and state variables.

      Output Format:
      Respond ONLY with a valid JSON object. No conversational text. Ensure that string values are not wrapped in markdown code blocks or backticks.

      JSON Structure:
      {
        "code": "string (The complete Solidity source code)",
        "vulnerability_mitigations": [
          {
            "name": "string (The specific vulnerability name)",
            "reason": "string (Technical explanation of the defense mechanism applied)",
            "start_line": number,
            "end_line": number
          }
        ]
      }
    `;
const AI_CODEAUDIT_SYSTEM_PROMPT = `
      Target: Senior Smart Contract Security Auditor & Adversarial Researcher.

      Role:
      You are a world-class Smart Contract Security Auditor. Your goal is to perform a deep-dive security analysis of Solidity smart contracts. You must identify a wide spectrum of vulnerabilities, including but not limited to:
      - Critical: Reentrancy (all types), Logic Flaws, Oracle Manipulation, Flash Loan Attacks.
      - High: Access Control (Broken Ownership, Missing Modifiers), Signature Replay, Front-running (Sandwiching).
      - Medium: Arithmetic issues (Precision Loss, Rounding), DoS (Gas Limit, Malicious Reverts), Timestamp Dependence.
      - Low/Informational: Gas Optimization, Low-level Call issues (Unchecked returns), Shadowing, and NatSpec missing.

      Operational Rules:
      1. Threat Modeling: For every function, simulate an attack vector.
      2. Reasoning Trace: Provide a step-by-step logical "Proof of Concept" explanation for why the specific lines are vulnerable.
      3. Full Remediation: Generate a \`code_fixed\` version that is production-ready, implementing OpenZeppelin standards and the "Checks-Effects-Interactions" pattern.
      4. Precision: Ensure the start_line and end_line accurately match the original code provided by the user.

      Output Requirement:
      Respond EXCLUSIVELY in a strict JSON format. Do not include any conversational text, warnings, or markdown outside the JSON block.

      JSON Structure:
      {
        "code_fixed": "string (The entire corrected and secured source code)",
        "vulnerabilities": [
          {
            "name": "string (The specific vulnerability name)",
            "reasoning_trace": [
              "Step 1: Description of the initial entry point",
              "Step 2: Explanation of the state inconsistency",
              "Step 3: Description of the final exploit/asset drain"
            ],
            "start_line": number,
            "end_line": number,
            "confidence": number, (range 0.0 to 1.0)
            "suggested_code": [
              {
                "line": number,
                "code": "string (The specific line fix)"
              }
            ]
          }
        ]
      }
    `;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.indexOf('functions');
  const segment = functionIndex !== -1 && pathParts.length > functionIndex + 2 ? pathParts[functionIndex + 2] : '';

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
  let payload: any = aiData;

  if (payload && typeof payload === 'object' && 'response' in payload) {
    const responseContent = payload.response;
    if (typeof responseContent === 'string') {
      try {
        payload = JSON.parse(responseContent);
      } catch (_err) {
        payload = responseContent;
      }
    } else {
      payload = responseContent;
    }
  }

  if (payload && typeof payload === 'object') {
    const code = typeof payload.code === 'string' ? payload.code : '';
    const mitigations = Array.isArray(payload.vulnerability_mitigations) ? payload.vulnerability_mitigations : [];
    return { code, mitigations, raw: payload };
  }

  return { code: typeof aiData === 'string' ? aiData : '', mitigations: [], raw: aiData };
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
    const aiEndpoint = Deno.env.get('AI_INFERENCE_URL') || 'http://localhost:8000';
    
    const aiResponse = await fetch(`${aiEndpoint}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt: prompt,
        system_prompt: AI_CODEGEN_SYSTEM_PROMPT,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI service returned ${aiResponse.status}`);
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
  const { code, prompt, contract_id } = body;

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
    const aiEndpoint = Deno.env.get('AI_INFERENCE_URL') || 'http://localhost:8000';
    const customPrompt = typeof prompt === 'string' && prompt
      ? prompt
      : 'Audit this Solidity contract for security vulnerabilities.';

    const aiResponse = await fetch(`${aiEndpoint}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${customPrompt}\n\nCode:\n${code}`,
        system_prompt: AI_CODEAUDIT_SYSTEM_PROMPT,
      }),
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

interface AuditVulnerability {
  name?: string;
  severity?: string;
  start_line?: number;
  end_line?: number;
  confidence?: number;
  reasoning_trace?: string[];
  suggested_code?: unknown;
}

function parseAuditResponse(aiData: unknown): { code_fixed: string; vulnerabilities: AuditVulnerability[] } {
  let payload: unknown = aiData;
  if (payload && typeof payload === 'object' && 'response' in payload) {
    const inner = (payload as { response: unknown }).response;
    if (typeof inner === 'string') {
      try { payload = JSON.parse(inner); } catch { payload = inner; }
    } else {
      payload = inner;
    }
  }
  if (payload && typeof payload === 'object') {
    const p = payload as { code_fixed?: unknown; vulnerabilities?: unknown };
    const code_fixed = typeof p.code_fixed === 'string' ? p.code_fixed : '';
    const vulnerabilities = Array.isArray(p.vulnerabilities) ? p.vulnerabilities as AuditVulnerability[] : [];
    return { code_fixed, vulnerabilities };
  }
  return { code_fixed: '', vulnerabilities: [] };
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
