import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase } from '../_shared/supabase.ts';
import { submitComputeJob, getComputeJob, uploadToOgStorage } from '../_shared/og-storage.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.indexOf('functions');
  const id = functionIndex !== -1 && pathParts.length > functionIndex + 3 ? pathParts[functionIndex + 3] : null;

  if (req.method === 'GET' && id) {
    return handleGetAudit(auth, id);
  }

  if (req.method === 'GET' && !id) {
    const contractId = url.searchParams.get('contract_id');
    const status = url.searchParams.get('status');
    return handleListAudits(auth, contractId, status);
  }

  return badRequest('Method not allowed');
});

async function handleListAudits(auth: { user_id: string }, contractId: string | null, status: string | null) {
  let query = supabase
    .from('audits')
    .select('*, contracts(id, name, owner_id), ai_findings(count)')
    .eq('contracts.owner_id', auth.user_id);

  if (contractId) query = query.eq('contract_id', contractId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return serverError(error.message);
  return json(data);
}

async function handleGetAudit(auth: { user_id: string; is_admin: boolean }, id: string) {
  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .select(`
      *,
      contracts(id, name, owner_id, is_catalog, content_inline, og_storage_uri),
      ai_findings(
        id, severity, title, description, file_path, line_start, line_end,
        function_name, confidence, gas_saved, status, reasoning_trace,
        reasoning_uri, reasoning_hash, anchor_tx_hash, remediation, created_at
      )
    `)
    .eq('id', id)
    .single();

  if (auditError || !audit) return notFound('Audit not found');

  if (audit.contracts.owner_id !== auth.user_id && !auth.is_admin) return forbidden();
  if (audit.contracts.is_catalog) return forbidden();

  if (audit.status === 'running') {
    await reconcileRunningAudit(audit);
  }

  const { data: refreshedAudit, error: refreshError } = await supabase
    .from('audits')
    .select(`
      *,
      contracts(id, name, owner_id, is_catalog, content_inline, og_storage_uri),
      ai_findings(
        id, severity, title, description, file_path, line_start, line_end,
        function_name, confidence, gas_saved, status, reasoning_trace,
        reasoning_uri, reasoning_hash, anchor_tx_hash, remediation, created_at
      )
    `)
    .eq('id', id)
    .single();

  if (refreshError || !refreshedAudit) return serverError('Failed to refresh audit');
  return json(refreshedAudit);
}

async function reconcileRunningAudit(audit: Record<string, unknown>) {
  const jobId = audit.og_compute_job_id as string;
  if (!jobId) return;

  try {
    const job = await getComputeJob(jobId);

    if (job.status === 'completed' && job.output) {
      await processAiOutput(audit.id as string, audit.contract_id as string, audit.kind as string, job.output);
      await supabase
        .from('audits')
        .update({ status: 'succeeded', completed_at: new Date().toISOString() })
        .eq('id', audit.id);
    } else if (job.status === 'failed') {
      await supabase
        .from('audits')
        .update({ status: 'failed', error: job.error || 'Job failed', completed_at: new Date().toISOString() })
        .eq('id', audit.id);
    }
  } catch (e) {
    console.error('Error reconciling audit:', e);
  }
}

async function processAiOutput(auditId: string, contractId: string, kind: string, output: string) {
  let parsed: Array<Record<string, unknown>> = [];

  try {
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) || output.match(/(\[[\s\S]*\])/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } else {
      parsed = JSON.parse(output);
    }
  } catch {
    parsed = [{ title: 'Analysis', description: output, severity: 'info' }];
  }

  if (!Array.isArray(parsed)) parsed = [parsed];

  for (const finding of parsed) {
    const reasoningTrace = { prompt: output, model: Deno.env.get('AI_MODEL') };
    let reasoningUri = '';
    let reasoningHash = '';

    try {
      const result = await uploadToOgStorage('reasoning', `${crypto.randomUUID()}/trace.json`, JSON.stringify(reasoningTrace));
      reasoningUri = result.uri;
      reasoningHash = result.hash;
    } catch (e) {
      console.error('Failed to upload reasoning trace:', e);
    }

    await supabase.from('ai_findings').insert({
      audit_id: auditId,
      severity: finding.severity || 'info',
      title: finding.title || 'Untitled Finding',
      description: finding.description || '',
      file_path: finding.file_path || null,
      line_start: finding.line_start || null,
      line_end: finding.line_end || null,
      function_name: finding.function_name || null,
      confidence: finding.confidence || null,
      gas_saved: finding.gas_saved || null,
      status: 'open',
      reasoning_trace: reasoningTrace,
      reasoning_uri: reasoningUri,
      reasoning_hash: reasoningHash,
      remediation: finding.remediation || null,
    });

    if (kind === 'auto_fix' && (finding.remediation as any)?.after) {
      await supabase
        .from('contracts')
        .update({
          content_inline: (finding.remediation as any).after.length <= 8192 ? (finding.remediation as any).after : null,
        })
        .eq('id', contractId);
    }
  }
}
