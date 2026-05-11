import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase } from '../_shared/supabase.ts';
import { submitComputeJob, getComputeJob } from '../_shared/og-storage.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

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

async function handleCodegen(req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { contract_id, prompt } = body;

  if (!contract_id || typeof contract_id !== 'string') {
    return badRequest('contract_id is required');
  }
  if (!prompt || typeof prompt !== 'string') {
    return badRequest('prompt is required');
  }

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, uuid, owner_id, is_catalog, content_inline')
    .eq('uuid', contract_id)
    .single();

  if (contractError || !contract) return notFound('Contract not found');
  if (contract.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
  if (contract.is_catalog) return badRequest('Cannot codegen on catalog contract');

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contract.id,
      kind: 'codegen',
      status: 'pending',
      model: Deno.env.get('AI_MODEL'),
      prompt_template: 'codegen',
    })
    .select()
    .single();

  if (auditError || !audit) return serverError('Failed to create audit record');

  try {
    const systemPrompt = 'You are a smart contract code generator. Generate Solidity code based on the user request. Return JSON array with fields: title, description, and the generated code in description field.';
    const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}\n\n${contract.content_inline || ''}`;

    const job = await submitComputeJob(fullPrompt);

    await supabase
      .from('audits')
      .update({
        status: 'running',
        og_compute_job_id: job.job_id,
        started_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    return json({ audit_id: audit.uuid }, 202);
  } catch (e) {
    await supabase
      .from('audits')
      .update({ status: 'failed', error: String(e) })
      .eq('id', audit.id);

    return serverError('Failed to submit codegen job');
  }
}

async function handleAudit(req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { contract_id } = body;

  if (!contract_id || typeof contract_id !== 'string') {
    return badRequest('contract_id is required');
  }

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, uuid, owner_id, is_catalog, content_inline')
    .eq('uuid', contract_id)
    .single();

  if (contractError || !contract) return notFound('Contract not found');
  if (contract.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
  if (contract.is_catalog) return badRequest('Cannot audit catalog contract');

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contract.id,
      kind: 'audit',
      status: 'pending',
      model: Deno.env.get('AI_MODEL'),
      prompt_template: 'security_audit',
    })
    .select()
    .single();

  if (auditError || !audit) return serverError('Failed to create audit record');

  try {
    const systemPrompt = `You are a smart contract security auditor. Analyze the Solidity code for vulnerabilities. Return a JSON array of findings, each with:
- title: string (e.g., "reentrancy", "access-control")
- severity: "critical" | "high" | "medium" | "low" | "info"
- description: string (detailed explanation)
- file_path: string (optional)
- line_start: number (optional)
- line_end: number (optional)
- function_name: string (optional)
- confidence: number (0-1)
- remediation: { before: string, after: string, explanation: string } (optional)`;

    const fullPrompt = `${systemPrompt}\n\nContract code:\n\`\`\`solidity\n${contract.content_inline || ''}\n\`\`\``;

    const job = await submitComputeJob(fullPrompt);

    await supabase
      .from('audits')
      .update({
        status: 'running',
        og_compute_job_id: job.job_id,
        started_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    return json({ audit_id: audit.uuid }, 202);
  } catch (e) {
    await supabase
      .from('audits')
      .update({ status: 'failed', error: String(e) })
      .eq('id', audit.id);

    return serverError('Failed to submit audit job');
  }
}

async function handleAutoFix(req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
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
    .select('id, contract_id, contracts(id, uuid, owner_id, is_catalog, content_inline)')
    .eq('id', finding.audit_id)
    .single();
  if (auditContractError || !auditContract) return notFound('Parent audit not found');
  const contract = auditContract.contracts as unknown as { id: number; uuid: string; owner_id: number; is_catalog: boolean; content_inline: string };
  if (contract.owner_id !== auth.user_id) return badRequest('Contract does not belong to user');
  if (contract.is_catalog) return badRequest('Cannot auto-fix catalog contract');

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      contract_id: contract.id,
      kind: 'auto_fix',
      status: 'pending',
      model: Deno.env.get('AI_MODEL'),
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

    const fullPrompt = `${systemPrompt}\n\nContract code:\n\`\`\`solidity\n${contract.content_inline || ''}\n\`\`\`\n\nVulnerability to fix:\n${finding.description || 'Fix the identified issue'}`;

    const job = await submitComputeJob(fullPrompt);

    await supabase
      .from('audits')
      .update({
        status: 'running',
        og_compute_job_id: job.job_id,
        started_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    await supabase
      .from('ai_findings')
      .update({ status: 'fixed' })
      .eq('uuid', ai_finding_id);

    return json({ audit_id: audit.uuid }, 202);
  } catch (e) {
    await supabase
      .from('audits')
      .update({ status: 'failed', error: String(e) })
      .eq('id', audit.id);

    return serverError('Failed to submit auto-fix job');
  }
}

async function handleGasOpt(req: Request, auth: { user_id: number }, body: Record<string, unknown>) {
  const { contract_id } = body;

  if (!contract_id || typeof contract_id !== 'string') {
    return badRequest('contract_id is required');
  }

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, uuid, owner_id, is_catalog, content_inline')
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
      model: Deno.env.get('AI_MODEL'),
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

    const fullPrompt = `${systemPrompt}\n\nContract code:\n\`\`\`solidity\n${contract.content_inline || ''}\n\`\`\``;

    const job = await submitComputeJob(fullPrompt);

    await supabase
      .from('audits')
      .update({
        status: 'running',
        og_compute_job_id: job.job_id,
        started_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    return json({ audit_id: audit.uuid }, 202);
  } catch (e) {
    await supabase
      .from('audits')
      .update({ status: 'failed', error: String(e) })
      .eq('id', audit.id);

    return serverError('Failed to submit gas optimization job');
  }
}
