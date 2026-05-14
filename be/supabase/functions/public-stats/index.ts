import { json, serverError, supabase, corsPreflight } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Total Reward Distributed (sum of reward_amount for approved findings)
    const { data: findingsData, error: findingsError } = await supabase
      .from('auditor_findings')
      .select('reward_amount')
      .eq('review_status', 'approved');

    if (findingsError) throw findingsError;

    const total_reward_distributed = findingsData.reduce((acc, curr) => acc + (Number(curr.reward_amount) || 0), 0);

    // 2. Total Submitted Findings
    const { count: total_submitted_findings, error: countError } = await supabase
      .from('auditor_findings')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    // 3. Total Smart Contracts Audited/Secured
    const { count: total_smart_contracts_secured, error: contractsError } = await supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true });

    if (contractsError) throw contractsError;

    // 4. Total Auditors (Users with at least one finding)
    // To get unique contributors, we can fetch all contributor_ids and use a Set
    const { data: contributorsData, error: contributorsError } = await supabase
      .from('auditor_findings')
      .select('contributor_id');

    if (contributorsError) throw contributorsError;

    const unique_auditors = new Set(contributorsData.map(f => f.contributor_id)).size;

    const stats = {
      total_reward_distributed,
      total_submitted_findings: total_submitted_findings || 0,
      total_smart_contracts_secured: total_smart_contracts_secured || 0,
      total_active_auditors: unique_auditors,
    };

    return json(stats);
  } catch (error) {
    console.error('Error fetching public stats:', error);
    return serverError(error instanceof Error ? error.message : 'Unknown error occurred');
  }
});
