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

  // Get user_id from auth (assumes auth is { user_id: number }; convert to UUID via lookup)
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', auth.user_id) // If auth.user_id is already UUID, otherwise adjust
    .single();

  if (userError || !user) return serverError('User not found');
  const userId = user.id;

  // Create or use existing contract
  let contractId: string;
  if (contract_id && typeof contract_id === 'string') {
    contractId = contract_id;
  } else {
    // Create new contract with is_catalog = false
    const { data: newContract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        owner_id: userId,
        is_catalog: false,
        name: `Generated Contract - ${new Date().toISOString().slice(0, 10)}`,
        language: 'solidity',
        status: 'draft',
      })
      .select('id')
      .single();

    if (contractError || !newContract) {
      return serverError('Failed to create contract');
    }
    contractId = newContract.id;
  }

  // Create audit record
  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contractId,
      kind: 'codegen',
      status: 'pending',
    })
    .select()
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
      const findings = mitigations.map((mitigation: any) => ({
        audit_id: audit.id,
        severity: 'info',
        title: mitigation.name || 'Vulnerability Mitigation',
        description: mitigation.reason || '',
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
        .eq('id', contractId);

      if (updateError) {
        console.error('Failed to update contract:', updateError);
      }
    }

    return json({ 
      contract_id: contractId,
      audit_id: audit.id,
      generated_code: generatedCode,
      mitigations
    }, 200);
  } catch (e) {
    console.error('Codegen job failed:', e);
    return serverError(`Codegen failed: ${String(e)}`);
  }
}

async function handleAudit(_req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { code, prompt } = body;

  if (!code || typeof code !== 'string') {
    return badRequest('code (raw smart contract string) is required');
  }

  // Get user_id from auth
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', auth.user_id)
    .single();

  if (userError || !user) return serverError('User not found');
  const userId = user.id;

  try {
    // Call AI inference endpoint with the raw code
    const aiEndpoint = Deno.env.get('AI_INFERENCE_URL') || 'http://localhost:8000';
    const customPrompt = prompt || 'Audit this Solidity contract for security vulnerabilities.';
    
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

    // Parse AI response
    let title = 'Security Audit Finding';
    let description = '';
    let severity: string = 'medium';

    if (typeof aiData === 'string') {
      description = aiData;
    } else if (typeof aiData.text === 'string') {
      description = aiData.text;
    } else if (aiData.choices && Array.isArray(aiData.choices) && aiData.choices[0]?.message?.content) {
      description = aiData.choices[0].message.content;
    } else if (aiData.description && typeof aiData.description === 'string') {
      description = aiData.description;
      if (aiData.title) title = aiData.title;
      if (aiData.severity) severity = aiData.severity;
    } else if (aiData && Object.keys(aiData).length > 0) {
      description = JSON.stringify(aiData);
    }

    // Validate severity
    const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
    if (!validSeverities.includes(severity)) {
      severity = 'medium';
    }

    // Insert directly to auditor_findings
    const { data: finding, error: findingError } = await supabase
      .from('auditor_findings')
      .insert({
        contributor_id: userId,
        contract_id: null, // No contract_id needed for raw code audit
        severity: severity,
        title: title,
        description: description,
        review_status: 'draft',
        code_uri: null,
        analysis_uri: null,
      })
      .select('id, uuid')
      .single();

    if (findingError || !finding) {
      console.error('Failed to insert auditor_finding:', findingError);
      return serverError('Failed to save audit finding');
    }

    return json({
      finding_id: finding.id,
      finding_uuid: finding.uuid,
      title: title,
      severity: severity,
      description: description,
      ai_response: aiData,
    }, 200);
  } catch (e) {
    console.error('Audit job failed:', e);
    return serverError(`Audit failed: ${String(e)}`);
  }
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
      prompt_template: 'auto_fix',
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
      prompt_template: 'gas_optimization',
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
