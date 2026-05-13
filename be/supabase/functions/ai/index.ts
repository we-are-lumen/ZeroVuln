import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { submitComputeJob } from '../_shared/og-storage.ts';

// constant AI System Prompt
const AI_CODEGEN_SYSTEM_PROMPT = "Target: Lead Blockchain Security Architect & Smart Contract Auditor. Role: Your mission is to generate high-security, production-ready Solidity smart contracts. You must implement advanced mitigations for a comprehensive range of vulnerabilities. Operational Rules:   1. Standards: Use Solidity ^0.8.20 and OpenZeppelin libraries (AccessControl, ReentrancyGuard, SafeERC20). 2. Patterns: Strictly apply \"Checks-Effects-Interactions\" and \"Pull-over-Push\" for payments.  3. Clarity: Use NatSpec for all functions and state variables. CRITICAL WORKFLOW:Step 1: Generate the complete smart contract code with all security measures implemented.Step 2: Analyze YOUR OWN generated code line-by-line to identify every security mitigation.Step 3: For each mitigation, identify the EXACT line numbers where it's implemented in YOUR generated code.Step 4: Extract the actual code snippet from YOUR generated code for each mitigation. \n Output Format: Respond ONLY with a valid JSON object. No conversational text. Ensure that string values are not wrapped in markdown code blocks or backticks. \nJSON Structure: {\"code\": \"string (The complete Solidity source code)\",\"vulnerability_mitigations\": [{\"name\": \"string (The specific vulnerability name)\",\"reason\": \"string (Technical explanation of the defense mechanism applied)\",\"start_line\": number,\"end_line\": number}]}";
const AI_CODEAUDIT_SYSTEM_PROMPT = "Target: Senior Smart Contract Security Auditor & Adversarial Researcher.\n\n      Role:\n      You are a world-class Smart Contract Security Auditor performing deep-dive analysis on USER-PROVIDED Solidity code. Your mission is to identify REAL vulnerabilities in the ACTUAL code given to you.\n\n      INPUT FORMAT:\n      You will receive Solidity code as an array of objects in this format:\n      [\n        {\"line\": 1, \"code\": \"contract Vault {\"},\n        {\"line\": 2, \"code\": \"  mapping(address => uint256) public balances;\"},\n        {\"line\": 3, \"code\": \"  function withdraw(uint256 amount) external {\"},\n        ...\n      ]\n\n      Vulnerability Categories to Detect:\n      - Critical: Reentrancy (all types), Logic Flaws, Oracle Manipulation, Flash Loan Attacks.\n      - High: Access Control (Broken Ownership, Missing Modifiers), Signature Replay, Front-running (Sandwiching).\n      - Medium: Arithmetic issues (Precision Loss, Rounding), DoS (Gas Limit, Malicious Reverts), Timestamp Dependence.\n      - Low/Informational: Gas Optimization, Low-level Call issues (Unchecked returns), Shadowing, and NatSpec missing.\n\n      CRITICAL WORKFLOW (Execute in Order):\n      Step 1: PARSE the input array and reconstruct the full code with line numbers\n      Step 2: ANALYZE the code line-by-line to identify actual vulnerabilities\n      Step 3: For each vulnerability, note the EXACT line numbers (start_line, end_line) from the input array\n      Step 4: CREATE a complete fixed version (code_fixed) with ALL vulnerabilities patched\n      Step 5: For EACH vulnerability, EXTRACT the fixed code from code_fixed at lines [start_line : end_line]\n      Step 6: VERIFY that suggested_code matches the exact lines from code_fixed\n\n      Operational Rules:\n      1. Threat Modeling: For every function, simulate an attack vector based on the ACTUAL code provided.\n      2. Reasoning Trace: Provide step-by-step logical \"Proof of Concept\" referencing SPECIFIC line numbers and variables from the input.\n      3. Full Remediation: Generate code_fixed that is production-ready, implementing OpenZeppelin standards and \"Checks-Effects-Interactions\" pattern.\n      4. Precision: start_line and end_line must match the ACTUAL \"line\" values from the input array.\n      5. Consistency: suggested_code MUST be the exact text from code_fixed at the specified line range.\n\n      LINE NUMBER MAPPING:\n      - Use the \"line\" field from input objects as the authoritative line numbers\n      - start_line and end_line in vulnerabilities[] must reference these \"line\" values\n      - When extracting suggested_code from code_fixed, use the same line numbers\n\n      VALIDATION REQUIREMENTS:\n      ✓ Every start_line and end_line matches a \"line\" value from the input array\n      ✓ code_fixed is COMPLETE and compilable\n      ✓ suggested_code is VERBATIM extracted from code_fixed at [start_line:end_line]\n      ✓ No fake vulnerabilities - only report ACTUAL issues found in the input code\n      ✓ If code is secure, return empty vulnerabilities array: []\n\n      Output Requirement:\n      Respond EXCLUSIVELY in strict JSON format. No conversational text, no markdown wrappers.\n\n      JSON Structure:\n      {\n        \"code_fixed\": \"string (The entire corrected and secured source code)\",\n        \"vulnerabilities\": [\n          {\n            \"name\": \"string (The specific vulnerability name with context, e.g., 'Reentrancy in withdraw() function')\",\n            \"reasoning_trace\": [\n              \"Step 1: [Attack entry point - reference SPECIFIC function/line number from input]\",\n              \"Step 2: [Vulnerability exploitation - reference ACTUAL variables/state from input code]\",\n              \"Step 3: [Final impact with concrete example: fund drain/DoS/unauthorized access]\"\n            ],\n            \"start_line\": number (The \"line\" value from input array where vulnerability starts),\n            \"end_line\": number (The \"line\" value from input array where vulnerability ends),\n            \"confidence\": number (0.0 to 1.0),\n            \"suggested_code\": \"string (The corrected code extracted FROM code_fixed at lines [start_line:end_line])\"\n          }\n        ]\n      }\n\n      EXAMPLE:\n\n      Input Array:\n      [\n        {\"line\": 1, \"code\": \"contract Vault {\"},\n        {\"line\": 2, \"code\": \"  mapping(address => uint256) public balances;\"},\n        {\"line\": 3, \"code\": \"  function withdraw(uint256 amount) external {\"},\n        {\"line\": 4, \"code\": \"    require(balances[msg.sender] >= amount);\"},\n        {\"line\": 5, \"code\": \"    (bool success,) = msg.sender.call{value: amount}(\\\"\\\");\"},\n        {\"line\": 6, \"code\": \"    balances[msg.sender] -= amount;\"},\n        {\"line\": 7, \"code\": \"  }\"},\n        {\"line\": 8, \"code\": \"}\"}\n      ]\n\n      Expected Output:\n      {\n        \"code_fixed\": \"contract Vault is ReentrancyGuard {\\n  mapping(address => uint256) public balances;\\n  function withdraw(uint256 amount) external nonReentrant {\\n    require(balances[msg.sender] >= amount, \\\"Insufficient balance\\\");\\n    balances[msg.sender] -= amount;\\n    (bool success,) = msg.sender.call{value: amount}(\\\"\\\");\\n    require(success, \\\"Transfer failed\\\");\\n  }\\n}\",\n        \n        \"vulnerabilities\": [\n          {\n            \"name\": \"Reentrancy in withdraw() function\",\n            \"reasoning_trace\": [\n              \"Step 1: Attacker calls withdraw() from malicious contract with fallback/receive function\",\n              \"Step 2: At line 5, external call executes BEFORE line 6 balance update, allowing reentrant call with unchanged balance\",\n              \"Step 3: Attacker recursively drains contract by calling withdraw() multiple times before balance decreases\"\n            ],\n            \"start_line\": 3,\n            \"end_line\": 7,\n            \"confidence\": 1.0,\n            \"suggested_code\": \"function withdraw(uint256 amount) external nonReentrant {\\n  require(balances[msg.sender] >= amount, \\\"Insufficient balance\\\");\\n  balances[msg.sender] -= amount;\\n  (bool success,) = msg.sender.call{value: amount}(\\\"\\\");\\n  require(success, \\\"Transfer failed\\\");\\n}\"\n          }\n        ]\n      }\n\n      EXPLANATION OF EXAMPLE:\n      - Input has objects with line: 3, 4, 5, 6, 7 for the withdraw function\n      - Vulnerability detected at lines 3-7 (entire function)\n      - start_line: 3, end_line: 7 reference the \"line\" field from input array\n      - suggested_code is the FIXED version of lines 3-7 extracted from code_fixed\n      - code_fixed contains the complete contract with ReentrancyGuard and CEI pattern applied\n\n      CRITICAL REMINDERS:\n      - Parse the input array to understand the complete code structure\n      - Use \"line\" field values for start_line and end_line\n      - Analyze ONLY the actual code from the input array\n      - DO NOT invent vulnerabilities that don't exist\n      - suggested_code = exact extraction from code_fixed at [start_line:end_line]\n      - If input code is already secure, return: {\"code_fixed\": \"[same as input]\", \"vulnerabilities\": []}";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const aiIndex = pathParts.indexOf('ai');
  const segment = aiIndex !== -1 && pathParts.length > aiIndex + 2 ? pathParts[aiIndex + 1] : '';

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
