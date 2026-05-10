# ZeroVuln Backend — API Planning (Supabase)

Smart Contract AI Copilot. BE pakai **Supabase** (Postgres + Auth + Storage + Edge Functions). Tujuan dokumen ini: roadmap implementasi API yang nyalain semua flow di `UI-Mockup-Full.html`.

---

## 1. Stack & Justifikasi

| Layer | Pilihan | Catatan |
|---|---|---|
| Database | Supabase Postgres | Metadata, indexing, query relasional, RLS per-wallet |
| Auth | Supabase Auth + custom SIWE | Wallet-based. JWT via custom signer |
| Realtime | Supabase Realtime | Subscribe ke `audits`, `deploys` untuk progress UI |
| Orkestrator | Supabase Edge Functions (Deno) | Stateless glue. Proxy ke 0G Compute & 0G Storage |
| **AI Compute** | **0G Compute Network** | Semua inference (codegen, audit, auto-fix, gas-opt, chat) jalan di sini. Job-based, asynchronous |
| **Storage artifact** | **0G Storage** | Source code snapshot, reasoning trace, AI output, deploy artifacts. Hash on-chain anchor di 0G chain |
| **On-chain** | **0G Galileo Testnet (chain id 16602)** | Deploy target + anchor hash audit/reasoning. Mainnet di-swap pasca-hackathon |

**Pembagian tugas**:
- **Supabase** = "control plane" (auth, metadata, query, realtime push). Tidak menyimpan content besar — cuma URI pointer.
- **0G Compute** = "AI brain". Edge Function dispatch job ke 0G, simpan `compute_job_id` di Supabase, poll/subscribe sampai selesai.
- **0G Storage** = "content layer". Setiap output AI (reasoning trace, generated code, audit JSON) di-upload ke 0G → Supabase cuma simpan `storage_uri` (`0g://...`) + `content_hash`.

**Kenapa Supabase + 0G**: 0G handle compute & storage on-chain verifiable (sesuai branding "verified on 0G" di Screen 07). Supabase handle yang bukan core selling point: relasional query, RLS, realtime push — yang lambat/mahal kalau dipaksa via on-chain.

### 1.1 Environment (testnet-first)

Hackathon scope: **0G Galileo Testnet (chain id 16602)**. Semua endpoint, anchor contract, faucet, dan storage node pakai testnet.

| Var | Value (testnet) |
|---|---|
| `OG_CHAIN_ID` | `16602` |
| `OG_RPC_URL` | `https://evmrpc-testnet.0g.ai` |
| `OG_EXPLORER` | `https://chainscan-galileo.0g.ai` |
| `OG_STORAGE_INDEXER` | `https://indexer-storage-testnet-turbo.0g.ai` |
| `OG_COMPUTE_BROKER` | endpoint testnet broker (sesuai SDK 0g-serving-broker) |
| `OG_FAUCET` | `https://faucet.0g.ai` (untuk top-up hot wallet server) |

UI badge "verified on 0G" + copy "0G mainnet" di Screen 06/07 perlu di-update jadi "0G Galileo Testnet" supaya konsisten. Switch ke mainnet = ganti env vars + redeploy anchor contract; tidak ada perubahan schema.

---

## 2. Mapping UI ↔ API

| Screen | Endpoint utama |
|---|---|
| 00 Landing | — |
| 01 Empty / 02 Dashboard | `GET /workspaces` |
| 03 Code-gen | `POST /workspaces`, `POST /ai/codegen`, `GET /templates` |
| 04 Workspace | `GET /workspaces/:id`, `GET /workspaces/:id/files`, `PATCH /files/:id`, `POST /ai/audit`, `POST /ai/auto-fix`, `POST /ai/chat` |
| 05 Gas-opt | `POST /ai/gas-opt`, `POST /optimizations/:id/accept` |
| 06 Deploy progress | `POST /deploys`, `GET /deploys/:id` (realtime) |
| 07 Public trail | `GET /public/contracts/:address` (no auth) |
| 08 Audit detail | `GET /audits/:id`, `GET /findings/:id` |
| 09 Settings | `GET/PATCH /me/settings` |
| 10 Errors | error handling cross-cutting |
| Modal wallet | `POST /auth/siwe/nonce`, `POST /auth/siwe/verify` |

---

## 3. Data Model (Supabase tables)

Semua tabel pakai `id uuid pk`, `created_at`, `updated_at`. RLS aktif.

### `users`
- `wallet_address text unique`
- `agent_id text` — primary AI agent identity
- `settings jsonb` — model preference, royalty defaults, auto-audit, notifications

### `workspaces`
- `owner_id fk users`
- `name text`, `slug text`
- `status enum('draft','audited','deployed')`
- `current_version_id fk workspace_versions`
- `agent_id text`, `storage_uri text` (0G storage pointer)

### `workspace_versions`
- `workspace_id fk`
- `version text` ("v0.4")
- `parent_version_id fk` (history chain)
- `gas_estimate bigint`, `compile_status text`, `compiler_version text`

### `files`
- `version_id fk workspace_versions`
- `path text` ("contract.sol", "test.sol", "deploy.config", "README.md")
- `og_storage_uri text` — `0g://contracts/<workspace_id>/<version>/<path>`
- `content_hash text` — keccak256 untuk integrity check
- `content_inline text nullable` — cache kecil (≤ 8KB) untuk render cepat tanpa fetch 0G
- `language text`, `size_bytes int`

### `audits`
- `workspace_id fk`, `version_id fk`
- `kind enum('audit','re-audit','gas-opt','codegen','auto-fix')`
- `status enum('pending','running','succeeded','failed')`
- `agent_id text`, `model text`, `prompt_template text`
- `og_compute_job_id text` — 0G Compute job id (untuk poll status & retrieve result)
- `og_compute_provider text` — node/provider yang execute job di 0G network
- `reasoning_uri text` — `0g://reasoning/<audit_id>/trace.json`
- `reasoning_hash text` — keccak256 dari reasoning artifact (untuk verify)
- `findings_uri text` — `0g://findings/<audit_id>/findings.json`
- `anchor_tx_hash text` — tx 0G testnet yang anchor `reasoning_hash`
- `confidence numeric`
- `summary text`
- `started_at`, `completed_at`

### `findings`
- `audit_id fk`
- `severity enum('critical','high','medium','low','info')`
- `title text` ("reentrancy", "missing access control")
- `file_path text`, `line_start int`, `line_end int`, `function_name text`
- `description text`
- `confidence numeric`
- `status enum('open','fixed','dismissed','accepted')`
- `reasoning_trace jsonb` — inline steps untuk render cepat di Screen 08
- `reasoning_uri text` — full trace di `0g://reasoning/<audit_id>/<finding_id>.json`
- `reasoning_hash text` — keccak anchor
- `remediation jsonb` (`{before, after, explanation}`)
- `anchor_tx_hash text nullable` — per-finding anchor (kalau diperlukan granular)

### `optimizations`
- `audit_id fk` (kind=gas-opt)
- `label text` ("storage packing", "custom errors", "cache storage reads")
- `description text`
- `gas_saved bigint`
- `diff_uri text` — `0g://gas-opt/<audit_id>/<opt_id>.json` (berisi before/after + explanation)
- `diff_hash text` — keccak anchor
- `accepted bool`

### `deploys`
- `workspace_id fk`, `version_id fk`
- `network text` ("0g-testnet-galileo"), `chain_id int` (16602)
- `status enum('queued','compiling','signing','broadcasting','registering','generating-trail','succeeded','failed','cancelled')`
- `contract_address text`
- `tx_hash text`, `block_number bigint`
- `royalty_enabled bool`, `royalty_config jsonb` (`{dev_pct, agent_pct, treasury_pct, fraction}`)
- `bytecode_uri text` — `0g://bytecode/<workspace_id>/<version>.bin`
- `bytecode_hash text`, `bytecode_size int`
- `trail_uri text` — `0g://trails/<contract_address>/manifest.json` (bundled audit history publik)
- `steps jsonb` — array `{step, status, meta, ts}` untuk progress (Screen 06)

### `deploy_steps` (alternatif normalisasi `steps` di atas — pilih salah satu)

### `templates`
- `category text` ("defi","nft","token","utility")
- `name text`, `description text`
- `seed_prompt text`, `code_seed text`

### `chat_messages`
- `workspace_id fk`, `user_id fk`
- `role enum('user','agent')`, `content text`
- `audit_id fk nullable`, `metadata jsonb`

### `auth_nonces` (SIWE)
- `wallet_address text`, `nonce text`, `expires_at`, `used bool`

### `royalty_settlements` (untuk Screen 07 tab settlements)
- `deploy_id fk`, `block_number`, `amount numeric`, `tx_hash text`, `recipient text`, `share_label text`

---

## 4. RLS Policy (ringkas)

- `workspaces`, `workspace_versions`, `files`, `audits`, `findings`, `optimizations`, `deploys`, `chat_messages`: SELECT/UPDATE/DELETE hanya ke `owner_id = auth.uid()`.
- `templates`: SELECT public, write hanya service role.
- Public trail page (Screen 07): pakai endpoint **`/public/contracts/:address`** yang bypass RLS via Edge Function service role, dan hanya expose data yang `deploys.status = 'succeeded'`.
- `auth_nonces`: tidak ada akses client; service role only.

---

## 5. Endpoints (REST via Supabase + Edge Functions)

Akses tabel CRUD sederhana → langsung pakai PostgREST yang Supabase generate. Endpoint custom (auth, AI orchestration, deploy, public trail) → Edge Functions.

### Auth (Edge Functions)
- `POST /functions/v1/auth-siwe-nonce` body: `{wallet_address}` → `{nonce}`
- `POST /functions/v1/auth-siwe-verify` body: `{message, signature}` → `{access_token, user}`. Bikin row di `users` kalau belum ada.

### Workspaces (PostgREST)
- `GET /rest/v1/workspaces?owner_id=eq.<id>`
- `POST /rest/v1/workspaces`
- `GET /rest/v1/workspaces?id=eq.<id>&select=*,workspace_versions(*),files(*),audits(*,findings(*))`
- `PATCH /rest/v1/workspaces?id=eq.<id>`

### Files
- `GET /rest/v1/files?version_id=eq.<id>`
- `PATCH /rest/v1/files?id=eq.<id>` body: `{content}` (auto-bump `workspace_versions` via DB trigger)

### Templates
- `GET /rest/v1/templates`

### AI Orchestration (Edge Functions — async pattern)

Pola umum: client `POST` → server bikin row `audits.status='pending'` + dispatch ke 0G Compute → return `audit_id` → client subscribe Supabase Realtime ke row tsb sampai `status='succeeded'`. Sumber data UI inference overlay (Screen 04 audit / Screen 03 codegen).

- `POST /functions/v1/ai-codegen` body: `{workspace_id?, prompt, template_id?}` → `{audit_id, workspace_id, version_id}`. Hasil: file `contract.sol` ter-generate.
- `POST /functions/v1/ai-audit` body: `{workspace_id, version_id}` → `{audit_id}`. Generate findings.
- `POST /functions/v1/ai-auto-fix` body: `{finding_id}` → `{audit_id}` (kind=auto-fix). Patch sebagai child finding/version baru.
- `POST /functions/v1/ai-gas-opt` body: `{workspace_id, version_id}` → `{audit_id, optimizations[]}`.
- `POST /functions/v1/ai-chat` body: `{workspace_id, message}` → stream balasan (SSE) atau simpan ke `chat_messages`.
- `POST /rest/v1/optimizations?id=eq.<id>` PATCH `{accepted: true}` → trigger DB merge ke version baru.

### Deploys (Edge Functions)
- `POST /functions/v1/deploys` body: `{workspace_id, version_id, royalty_enabled, royalty_config}` → `{deploy_id}`. Server walk through steps, update `deploys.steps` realtime.
- `GET /rest/v1/deploys?id=eq.<id>` + Realtime subscribe.
- `POST /functions/v1/deploys/:id/cancel`

### Public Trail (no auth)
- `GET /functions/v1/public-contract?address=0x...` → semua audits + findings + optimizations + royalty config + settlements untuk address itu.
- `GET /functions/v1/verify-reasoning?audit_id=...` → re-fetch reasoning dari 0G Storage + verify hash.

### Settings
- `GET /rest/v1/users?id=eq.<auth.uid()>` (atau `/me` view)
- `PATCH /rest/v1/users?id=eq.<auth.uid()>` body: `{settings, agent_id}`

---

## 6. Edge Function: AI Job Orchestration via 0G Compute

Pola yang dipakai semua endpoint AI (codegen, audit, auto-fix, gas-opt, chat). Edge Function = orchestrator stateless; semua heavy work jalan di 0G.

### 6.1 Sequence

```
[Client] ──POST──▶ [Edge Function]
                       │ 1. validate JWT, RLS check
                       │ 2. INSERT audits(status='pending', kind=...)
                       │ 3. fetch context: files dari 0G Storage (atau content_inline)
                       │ 4. build prompt: template + system + workspace context + grounding
                       │ 5. dispatch ke 0G Compute:
                       │      ogCompute.submitJob({
                       │        model: 'claude-3.7-sonnet',
                       │        prompt, max_tokens, agent_id
                       │      }) → returns og_compute_job_id
                       │ 6. UPDATE audits SET og_compute_job_id, status='running'
                       └────── return {audit_id} ───▶ [Client]
                                                          │
                                                          └─ subscribe Realtime
                                                             (audits where id=audit_id)

[pg_cron 5s] ──▶ [poller Edge Function]
                       │ for each audits.status='running':
                       │   result = ogCompute.getJob(og_compute_job_id)
                       │   if result.status == 'completed':
                       │     a. parse output JSON
                       │     b. compile check (kalau kind=codegen/auto-fix) via solc-wasm
                       │     c. upload reasoning trace → 0G Storage
                       │          uri = 0g://reasoning/<audit_id>/trace.json
                       │          hash = keccak256(content)
                       │     d. upload findings/optimizations → 0G Storage
                       │     e. anchor hash on-chain:
                       │          anchorContract.anchor(audit_id, hash, uri)
                       │          → save anchor_tx_hash
                       │     f. INSERT findings/optimizations rows (with uri+hash)
                       │     g. UPDATE audits status='succeeded'
                       │   if result.status == 'failed':
                       │     UPDATE audits status='failed', error
                       │   if elapsed > 120s and status='running':
                       │     emit timeout event (Screen 10 error #1)
```

### 6.2 0G Compute integration detail

- **SDK**: pakai `@0glabs/0g-serving-broker` (TypeScript) atau direct REST kalau sudah expose. Wrapper di Edge Function: `lib/og-compute.ts`.
- **Model selection**: pull dari `users.settings.model` (default `claude-3.7-sonnet`). 0G Compute jalanin via decentralized provider network.
- **Auth ke 0G**: hot wallet server (private key di Supabase Vault) sign request payment + job submission.
- **Cost tracking**: simpan `og_compute_cost` per audit (untuk display di settings/billing nanti).
- **Streaming chat** (`ai-chat`): kalau 0G Compute support streaming response, proxy via SSE dari Edge Function. Kalau belum, fallback ke job-poll lalu return chunked.

### 6.3 0G Storage integration detail

- **SDK**: `@0glabs/0g-ts-sdk` untuk upload/download.
- **Upload helper**:
  ```ts
  async function ogUpload(namespace, key, content): {uri, hash}
  ```
  - Upload bytes ke 0G Storage node.
  - Return `0g://<namespace>/<key>` + `keccak256(content)`.
- **Download helper** (untuk verify reasoning):
  ```ts
  async function ogFetch(uri): {content, hash}
  ```
- **Encryption**: konten private (source code) di-encrypt symmetric (AES-GCM), key disimpan di Supabase Vault per-workspace. Reasoning/findings public-read jadi plain.

### 6.4 Compile validation

Validasi compile (codegen / auto-fix): `solc-js` (WASM) di Edge Function. Kalau fail:
- Retry sekali dengan prompt yang ditambahi error message.
- Kalau retry juga gagal → `audits.status='failed'`, return error → FE tampilkan Screen 10 error #5.

### 6.5 Error mapping

| 0G state | DB status | UI |
|---|---|---|
| job submission gagal | `audits.status='failed'` | Screen 10 generic error |
| job timeout (>60s) | tetap `running`, emit warning | Screen 10 error #1 ("0G Compute taking longer") |
| job timeout (>120s) | `audits.status='failed'` | Screen 10 error #1 dengan opsi retry |
| output invalid (compile/JSON) | `audits.status='failed'` setelah retry | Screen 10 error #5 |
| 0G Storage upload gagal | retry 3x, lalu `failed` | toast error |

---

## 7. Realtime Channels

- `realtime:public:audits:id=eq.<id>` — progress audit/codegen/gas-opt
- `realtime:public:deploys:id=eq.<id>` — deploy steps
- `realtime:public:findings:audit_id=eq.<id>` — findings muncul streaming
- `realtime:public:chat_messages:workspace_id=eq.<id>` — chat panel

---

## 8. Storage Layout — 0G Storage as primary

Semua artifact konten by default di **0G Storage** supaya match narasi "verified on 0G" + reasoning hash bisa di-verify on-chain (Screen 07/08 punya tombol *verify reasoning hash*).

| Namespace | Isi | Akses |
|---|---|---|
| `0g://contracts/<workspace_id>/<version>/<path>` | Source snapshot per-version | private (encrypted, key di Supabase Vault) |
| `0g://bytecode/<workspace_id>/<version>.bin` | Compiled bytecode | private |
| `0g://reasoning/<audit_id>/trace.json` | Reasoning trace AI (steps untuk Screen 08) | public-read, hash di-anchor on-chain |
| `0g://findings/<audit_id>/findings.json` | Full findings + remediation diff | public-read, anchored |
| `0g://gas-opt/<audit_id>/<opt_id>.json` | Optimization diff + explanation | public-read, anchored |
| `0g://trails/<contract_address>/manifest.json` | Bundled audit history untuk public trail page | public-read |
| `0g://chat/<workspace_id>/<message_id>.json` | Long chat responses (kalau >8KB) | private |

**Postgres** simpan: `og_storage_uri`, `content_hash`, dan optional `content_inline` cache (≤8KB) — bukan content besar.

**Supabase Storage** opsional sebagai fallback cache kalau 0G gateway lambat saat demo (asset non-critical: avatar, og-image share).

### 8.1 Hash anchor flow

1. Edge Function upload artifact ke 0G Storage → dapat `og_storage_uri` + `content_hash` (keccak256).
2. Submit tx ke contract anchor di 0G testnet (Galileo):
   ```solidity
   function anchor(bytes32 audit_id, bytes32 content_hash, string uri)
   ```
3. Simpan `anchor_tx_hash` di row `audits` / `findings` / `optimizations`.
4. Tombol "verify reasoning hash" di FE: re-fetch dari 0G Storage, recompute keccak, compare ke `content_hash` on-chain. Verdict ✓ / ✗.

### 8.2 Trail manifest

Saat deploy `succeeded`, Edge Function bundle semua audit history workspace ke satu JSON manifest, upload ke `0g://trails/<contract_address>/manifest.json`. Public endpoint `/public-contract` baca dari sini → lebih cepat daripada query Supabase + N×fetch 0G saat user akses public trail.

---

## 9. Roadmap Implementasi (urutan pengerjaan)

### Phase 1 — Foundation (hari 1)
1. Init Supabase project + migration awal: `users`, `workspaces`, `workspace_versions`, `files`, `templates`, `auth_nonces`.
2. RLS policies basic.
3. Edge Function SIWE auth (`auth-siwe-nonce`, `auth-siwe-verify`).
4. Seed templates (6 template di Screen 03).

### Phase 2 — Workspace CRUD (hari 1–2)
5. Test PostgREST endpoints workspaces + files.
6. DB trigger auto-version: `UPDATE files` → bikin row baru `workspace_versions`.
7. Edge Function `ai-codegen` (mock dulu pakai static response → swap ke 0G).

### Phase 3 — AI Audit Pipeline (hari 2–3)
8. Tabel `audits`, `findings`, `optimizations`. RLS.
9. `ai-audit` Edge Function + integrasi 0G Compute.
10. `ai-auto-fix`, `ai-gas-opt` (reuse orchestration template).
11. `ai-chat` (streaming SSE).
12. Realtime subscriptions tested di FE.

### Phase 4 — Deploy & Trail (hari 3–4)
13. Tabel `deploys`, `royalty_settlements`. State machine steps.
14. Edge Function `deploys` POST — broadcast ke 0G testnet (Galileo) via RPC.
15. Public trail endpoint `public-contract`.
16. `verify-reasoning` endpoint (hash check vs 0G Storage).

### Phase 5 — Settings & Polish (hari 4–5)
17. Settings PATCH endpoint + validation (royalty splits sum=100).
18. Error mapping ke Screen 10 (timeout 60s, wallet rejected, network mismatch, no revenue pattern, invalid AI output).
19. Rate limit Edge Functions (1 inference/15s/user).
20. Logging + audit trail untuk debugging hackathon demo.

---

## 10. Open Questions / Risk

- **0G Compute long-poll vs webhook**: kalau 0G belum support webhook, Edge Function harus polling — pakai Supabase Cron / pg_cron tiap 5s untuk check `audits.status='running'`.
- **On-chain anchor**: optional di MVP. Kalau dipakai, butuh hot wallet server-side untuk sign anchor tx → simpan key di Supabase Vault.
- **SIWE nonce expiry**: 5 menit cukup? confirm sama FE.
- **Royalty injection logic**: server-side bytecode rewrite atau client-side compile? Default: AI generate variant kontrak, server compile, return bytecode untuk wallet sign.
- **Public trail SSR**: Edge Function return JSON saja, FE render. Kalau perlu OG image (share link), butuh tambahan `og-image` Edge Function.

---

## 11. Definisi Selesai (DoD per endpoint)

Setiap endpoint dianggap selesai kalau:
- Schema migrasi committed.
- RLS policy ada test (positive + negative case).
- Happy path manual test sukses dari Postman/curl.
- Error cases yang relevan ke Screen 10 sudah return shape error standar: `{error: {code, message, detail}}`.
- Realtime channel (kalau applicable) verified subscribed dari FE stub.
