import { Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import 'dotenv/config';

const ROOT_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// cd scripts
//   npm install
//   0g-compute-cli setup-network && 0g-compute-cli login
//   0g-compute-cli deposit --amount 3                                                                                    
//   0g-compute-cli transfer-fund --provider 0x... --amount 2 --service fine-tuning                                                               
//   npm run pull-and-fine-tune -- --limit 200

interface Args {
  outFile: string;
  limit: number;
  verified: boolean;
  fineTune: boolean;
  cliBin: string;
  provider: string;
  model: string;
  configPath: string;
  modelOutDir: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  pythonBin: string;
  mergeScript: string;
  hfBaseModel: string;
  hfRepoId: string;
  hfToken: string;
  hfPrivate: boolean;
  skipPush: boolean;
}

const HF_BASE_MODEL_DEFAULTS: Record<string, string> = {
  'Qwen2.5-0.5B-Instruct': 'Qwen/Qwen2.5-0.5B-Instruct',
  'Qwen3-32B': 'Qwen/Qwen3-32B',
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    outFile: './datasets/from_0g.jsonl',
    limit: 200,
    verified: true,
    fineTune: false,
    cliBin: process.env.OG_COMPUTE_CLI || '0g-compute-cli',
    provider: process.env.OG_PROVIDER || '',
    model: process.env.OG_MODEL || '',
    configPath: process.env.OG_CONFIG_PATH || '',
    modelOutDir: process.env.OG_MODEL_OUT_DIR || './fine_tuned_model',
    pollIntervalMs: parseInt(process.env.OG_POLL_INTERVAL_MS || '15000', 10),
    pollTimeoutMs: parseInt(process.env.OG_POLL_TIMEOUT_MS || `${60 * 60 * 1000}`, 10),
    pythonBin: process.env.PYTHON_BIN || 'python3',
    mergeScript: process.env.MERGE_SCRIPT || './merge_and_push.py',
    hfBaseModel: process.env.HF_BASE_MODEL || '',
    hfRepoId: process.env.HF_REPO_ID || '',
    hfToken: process.env.HF_TOKEN || '',
    hfPrivate: (process.env.HF_PRIVATE || '').toLowerCase() === 'true',
    skipPush: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-file') args.outFile = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--no-verify') args.verified = false;
    else if (a === '--fine-tune') args.fineTune = true;
    else if (a === '--cli-bin') args.cliBin = argv[++i];
    else if (a === '--provider') args.provider = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--config-path') args.configPath = argv[++i];
    else if (a === '--model-out-dir') args.modelOutDir = argv[++i];
    else if (a === '--poll-interval-ms') args.pollIntervalMs = parseInt(argv[++i], 10);
    else if (a === '--poll-timeout-ms') args.pollTimeoutMs = parseInt(argv[++i], 10);
    else if (a === '--python-bin') args.pythonBin = argv[++i];
    else if (a === '--merge-script') args.mergeScript = argv[++i];
    else if (a === '--hf-base-model') args.hfBaseModel = argv[++i];
    else if (a === '--hf-repo-id') args.hfRepoId = argv[++i];
    else if (a === '--hf-token') args.hfToken = argv[++i];
    else if (a === '--hf-private') args.hfPrivate = true;
    else if (a === '--skip-push') args.skipPush = true;
  }
  return args;
}

function runProcess(bin: string, cliArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[spawn] ${bin} ${cliArgs.join(' ')}`);
    const child = spawn(bin, cliArgs, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited with code ${code}`));
    });
  });
}

async function mergeAndPush(
  args: Args,
  taskId: string,
  decryptedZipPath: string,
): Promise<void> {
  if (args.skipPush) {
    console.log('[merge-push] skipped (--skip-push).');
    return;
  }
  if (!args.hfRepoId) throw new Error('Missing --hf-repo-id (or HF_REPO_ID env)');
  if (!args.hfToken) throw new Error('Missing --hf-token (or HF_TOKEN env)');

  const scriptPath = path.resolve(args.mergeScript);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`merge script not found: ${scriptPath}`);
  }

  const workDir = path.resolve(args.modelOutDir, `task-${taskId}`);
  const mergedOut = path.resolve(workDir, 'merged');

  const hfBase = args.hfBaseModel || HF_BASE_MODEL_DEFAULTS[args.model] || args.model;
  if (!hfBase.includes('/')) {
    throw new Error(
      `HuggingFace base model "${hfBase}" is not a valid repo id (expected "org/name"). ` +
        `Set --hf-base-model or HF_BASE_MODEL env (e.g. Qwen/${args.model}).`,
    );
  }

  const cliArgs = [
    scriptPath,
    '--adapter-zip', decryptedZipPath,
    '--work-dir', workDir,
    '--base-model', hfBase,
    '--merged-out', mergedOut,
    '--repo-id', args.hfRepoId,
    '--hf-token', args.hfToken,
  ];
  if (args.hfPrivate) cliArgs.push('--private');

  await runProcess(args.pythonBin, cliArgs);
  console.log(`[merge-push] pushed to https://huggingface.co/${args.hfRepoId}`);
}

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizeUri(uri: string): string {
  const u = uri.trim();
  return u.startsWith('0g://') ? u.slice('0g://'.length) : u;
}

async function downloadRootHashToString(
  indexer: Indexer,
  rootHash: string,
  verified: boolean,
): Promise<string> {
  const tmp = path.join(os.tmpdir(), `0g-${rootHash}-${process.pid}-${Date.now()}.jsonl`);
  try {
    const err = await indexer.download(rootHash, tmp, verified);
    if (err) throw err;
    return fs.readFileSync(tmp, 'utf-8');
  } catch (e: any) {
    throw new Error(`0G download failed for ${rootHash}: ${e?.message ?? e}`);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

async function downloadLegacyPathToString(storageNode: string, p: string): Promise<string> {
  const url = `${storageNode.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP download failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function appendNormalizedJsonl(stream: fs.WriteStream, raw: string): number {
  let count = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    stream.write(trimmed + '\n');
    count++;
  }
  return count;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(cliBin: string, cliArgs: string[], opts: { silent?: boolean } = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    if (!opts.silent) {
      console.log(`[0g-cli] ${cliBin} ${cliArgs.join(' ')}`);
    }
    const child = spawn(cliBin, cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      stdout += s;
      if (!opts.silent) process.stdout.write(s);
    });
    child.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      stderr += s;
      if (!opts.silent) process.stderr.write(s);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function extractTaskId(stdout: string): string | null {
  // Examples from docs: "Created Task ID: 6b607314-88b0-4fef-91e7-43227a54de57"
  const m =
    stdout.match(/Task\s*ID\s*[:=]\s*([0-9a-fA-F-]{8,})/i) ||
    stdout.match(/\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/);
  return m ? m[1] : null;
}

const TERMINAL_FAIL = new Set(['failed', 'cancelled', 'canceled', 'error']);

function extractStatus(stdout: string): string | null {
  // CLI prints a table with a "Progress" column; also accept "Status".
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => /\b(progress|status)\b/i.test(l) && /[A-Za-z]/.test(l));
  if (line) {
    // Pick the last word-ish token on the line (e.g., "Progress: Delivered" or "│ Progress │ Delivered │")
    const tokens = line.split(/[\s│|:]+/).filter(Boolean);
    const last = tokens[tokens.length - 1];
    if (last && /^[A-Za-z]+$/.test(last)) return last;
  }
  // Fallback: search for any known state keyword in stdout.
  const states = [
    'Finished',
    'UserAcknowledged',
    'Delivered',
    'Delivering',
    'Trained',
    'Training',
    'SetUp',
    'SettingUp',
    'Init',
    'Failed',
    'Cancelled',
    'Canceled',
  ];
  for (const s of states) {
    const re = new RegExp(`\\b${s}\\b`);
    if (re.test(stdout)) return s;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollUntil(
  args: Args,
  taskId: string,
  target: (status: string) => boolean,
  label: string,
): Promise<string> {
  const start = Date.now();
  let lastPrinted = '';
  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed > args.pollTimeoutMs) {
      throw new Error(`[0g-cli] timed out waiting for ${label} (taskId=${taskId})`);
    }
    const res = await runCli(
      args.cliBin,
      ['fine-tuning', 'get-task', '--provider', args.provider, '--task', taskId],
      { silent: true },
    );
    if (res.code !== 0) {
      console.warn(`[0g-cli] get-task exit=${res.code}, retrying...\n${res.stderr}`);
      await sleep(args.pollIntervalMs);
      continue;
    }
    const status = extractStatus(res.stdout);
    if (status && status !== lastPrinted) {
      console.log(`[0g-cli] taskId=${taskId} status=${status}`);
      lastPrinted = status;
    }
    if (status && TERMINAL_FAIL.has(status.toLowerCase())) {
      console.error(res.stdout);
      throw new Error(`[0g-cli] task ended in terminal failure: ${status}`);
    }
    if (status && target(status)) return status;
    await sleep(args.pollIntervalMs);
  }
}

async function runFineTuneOn0gCompute(args: Args): Promise<void> {
  if (!args.provider) throw new Error('Missing --provider (or OG_PROVIDER env)');
  if (!args.model) throw new Error('Missing --model (or OG_MODEL env)');
  if (!args.configPath) throw new Error('Missing --config-path (or OG_CONFIG_PATH env)');

  const datasetPath = path.resolve(args.outFile);
  const configPath = path.resolve(args.configPath);
  if (!fs.existsSync(datasetPath)) throw new Error(`Dataset not found: ${datasetPath}`);
  if (!fs.existsSync(configPath)) throw new Error(`Config not found: ${configPath}`);

  // 1) create-task
  const createRes = await runCli(args.cliBin, [
    'fine-tuning',
    'create-task',
    '--provider', args.provider,
    '--model', args.model,
    '--dataset-path', datasetPath,
    '--config-path', configPath,
  ]);
  if (createRes.code !== 0) {
    throw new Error(`[0g-cli] create-task failed (code=${createRes.code})`);
  }
  const taskId = extractTaskId(createRes.stdout);
  if (!taskId) {
    throw new Error('[0g-cli] could not extract Task ID from create-task output');
  }
  console.log(`[0g-cli] taskId=${taskId}`);

  // 2) poll until Delivered (48h ack window starts here)
  await pollUntil(
    args,
    taskId,
    (s) =>
      s === 'Delivered' ||
      s === 'UserAcknowledged' ||
      s === 'Finished',
    'Delivered',
  );

  // 3) acknowledge-model (must be a file path, not directory)
  fs.mkdirSync(path.resolve(args.modelOutDir), { recursive: true });
  const encryptedPath = path.resolve(args.modelOutDir, `task-${taskId}.encrypted`);
  const ackRes = await runCli(args.cliBin, [
    'fine-tuning',
    'acknowledge-model',
    '--provider', args.provider,
    '--task-id', taskId,
    '--data-path', encryptedPath,
  ]);
  if (ackRes.code !== 0) {
    throw new Error(`[0g-cli] acknowledge-model failed (code=${ackRes.code})`);
  }

  // 4) poll until Finished (~1 minute)
  await pollUntil(args, taskId, (s) => s === 'Finished', 'Finished');

  // 5) decrypt-model
  const decryptedPath = path.resolve(args.modelOutDir, `task-${taskId}.zip`);
  const decRes = await runCli(args.cliBin, [
    'fine-tuning',
    'decrypt-model',
    '--provider', args.provider,
    '--task-id', taskId,
    '--encrypted-model', encryptedPath,
    '--output', decryptedPath,
  ]);
  if (decRes.code !== 0) {
    throw new Error(`[0g-cli] decrypt-model failed (code=${decRes.code})`);
  }

  console.log(`[0g-cli] fine-tune complete. encrypted=${encryptedPath} decrypted=${decryptedPath}`);

  // 6) unzip + merge_and_unload + push to HuggingFace
  await mergeAndPush(args, taskId, decryptedPath);
}

async function main(): Promise<void> {
  const args = parseArgs();

  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const storageIndexer = process.env.OG_STORAGE_INDEXER || 'https://indexer-storage-turbo.0g.ai';
  const storageNode = process.env.OG_STORAGE_NODE || storageIndexer;

  fs.mkdirSync(path.dirname(path.resolve(args.outFile)), { recursive: true });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const indexer = new Indexer(storageIndexer);

  const { data, error } = await supabase
    .from('auditor_findings')
    .select('uuid, dataset_uri')
    .eq('review_status', 'approved')
    .not('dataset_uri', 'is', null)
    .order('decided_at', { ascending: false, nullsFirst: false })
    .limit(args.limit);

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  if (!data || data.length === 0) {
    console.log('No approved auditor_findings with dataset_uri.');
    return;
  }

  const out = fs.createWriteStream(args.outFile, { flags: 'a' });
  let ok = 0;
  let failed = 0;
  let totalLines = 0;

  try {
    for (const row of data) {
      const uuid = String((row as any).uuid ?? '');
      const datasetUri = (row as any).dataset_uri as string | null;
      if (!uuid || !datasetUri) continue;

      const normalized = normalizeUri(datasetUri);

      try {
        const raw = ROOT_HASH_RE.test(normalized)
          ? await downloadRootHashToString(indexer, normalized, args.verified)
          : await downloadLegacyPathToString(storageNode, normalized);
        const lines = appendNormalizedJsonl(out, raw);
        totalLines += lines;
        ok++;
        console.log(`appended ${lines} line(s) from ${uuid}`);
      } catch (e: any) {
        failed++;
        console.error(`FAIL ${uuid} (${normalized}): ${e?.message ?? e}`);
      }
    }
  } finally {
    await new Promise<void>((resolve) => out.end(resolve));
  }

  console.log(`\nDone. ok=${ok} failed=${failed} total=${data.length} lines=${totalLines} -> ${args.outFile}`);

  if (args.fineTune) {
    if (totalLines === 0) {
      console.warn('[fine-tune] skipped: no lines were appended to the dataset.');
      return;
    }
    await runFineTuneOn0gCompute(args);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
