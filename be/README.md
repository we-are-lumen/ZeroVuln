<div align="center">

# ZeroVuln — Backend

**AI-Powered Smart Contract Auditing, Decentralized on 0G**

Supabase Edge Functions (Deno) + Postgres, wired into the 0G stack for verifiable AI compute and tamper-proof dataset storage.

[![Runtime](https://img.shields.io/badge/Runtime-Deno_2.x-black?logo=deno)](https://deno.land)
[![Platform](https://img.shields.io/badge/Platform-Supabase-3ECF8E?logo=supabase)](https://supabase.com)
[![Chain](https://img.shields.io/badge/Chain-0G_Testnet_16602-6c5ce7)](https://0g.ai)
[![Language](https://img.shields.io/badge/Lang-TypeScript-3178c6?logo=typescript)](https://www.typescriptlang.org)

[API Docs](./API_FE_DOCS.md) · [Migrations](./supabase/migrations) · [0G Skill Index](./CLAUDE.md)

</div>

---

## Why ZeroVuln

Smart contract bugs cost the industry **billions per year**. ZeroVuln turns the audit workflow into a closed loop:

1. **AI auditor** — generates, audits, auto-fixes, and gas-optimizes Solidity in seconds.
2. **Human auditors** — contribute curated findings against catalog contracts and earn rewards.
3. **0G layer** — every approved finding becomes a JSONL training sample, persisted on **0G Storage**; inference jobs run through **0G Compute** for verifiable, decentralized AI.

The result is a self-improving security dataset that lives outside any single vendor.

---

## Architecture at a Glance

```
                ┌────────────────────────────────────┐
   Wallet ─────▶│  Supabase Edge Functions (Deno)    │
   (X-Wallet)   │  me · contracts · ai · audits · …  │
                └────────────┬──────────────┬────────┘
                             │              │
                       ┌─────▼─────┐   ┌────▼──────────────┐
                       │ Postgres  │   │   0G Network       │
                       │ (RLS, svc │   │  • Compute Broker  │
                       │  role)    │   │  • Storage Indexer │
                       └───────────┘   │  • Chain (16602)   │
                                       └────────────────────┘
```

| Layer        | Tech                                                |
| ------------ | --------------------------------------------------- |
| HTTP         | Supabase Edge Functions on Deno 2.x                 |
| Database     | Postgres (Supabase managed, service-role access)    |
| AI Inference | 0G Compute Broker (HTTP) — codegen / audit / fix    |
| Dataset      | 0G Storage via `@0gfoundation/0g-ts-sdk@1.2.8`      |
| Signer       | `ethers` v6 on 0G testnet (`chainId: 16602`)        |

---

## Project Layout

```
be/
├── supabase/
│   ├── config.toml                # Supabase CLI config
│   ├── migrations/                # Ordered SQL schema (init → expired_at → source_code jsonb)
│   └── functions/
│       ├── _shared/
│       │   ├── supabase.ts        # Wallet auth, response helpers, admin client
│       │   ├── og-storage.ts      # 0G Storage upload/download + Compute job APIs
│       │   └── mod.ts
│       ├── me/                    # GET /me — wallet profile + admin flag
│       ├── contracts/             # User contracts CRUD (is_catalog=false)
│       ├── contract_catalog/      # Public catalog + admin-only writes
│       ├── ai/                    # Inference triggers: codegen | audit | auto-fix | gas-opt
│       ├── audits/                # List + detail (polling target, embeds findings)
│       ├── ai-findings/           # GET / PATCH AI finding status
│       ├── auditor-findings/      # Human-contributed findings + submit flow
│       └── admin/                 # Review queue, approve (→ 0G Storage), reject
├── package.json                   # npm scripts for `supabase deploy`
├── deno.json                      # Deno config + import map
├── .env.example                   # Env template
├── API_FE_DOCS.md                 # Full request/response contract for the FE
└── CLAUDE.md                      # Internal 0G agent-skill index
```

---

## Authentication — Wallet First

ZeroVuln **does not use Supabase Auth**. Identity is derived from the user's EVM wallet, passed as a header:

```http
Authorization: Bearer <SUPABASE_ANON_KEY>
X-Wallet-Address: 0x…40-hex
```

`resolveUser()` in `_shared/supabase.ts` does the following on every request:

1. Validate the wallet format (`0x` + 40 hex chars).
2. Check it against `ADMIN_WALLETS` (comma-separated env) → mark `is_admin`.
3. `upsert` into `public.users` on `wallet_address` → return the row.
4. Promote new admin wallets if needed.

All public identifiers in the API are the `uuid` column. Internal FKs use `bigint id`.

---

## Database Schema (Concise)

> Source of truth: [`supabase/migrations/`](./supabase/migrations).

| Table               | Key Columns                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`             | `uuid`, `wallet_address` (unique), `is_admin`                                                                                                                          |
| `contracts`         | `uuid`, `owner_id`, `is_catalog`, `name`, `status`, `language`, `source_code jsonb[]`, `gas_estimate`, `reward_per_finding`, `expired_at`                              |
| `audits`            | `uuid`, `contract_id`, `kind` (`codegen \| audit \| auto_fix \| gas_opt`), `status` (`pending \| running \| succeeded \| failed`), `summary`, `started_at`, `completed_at` |
| `ai_findings`       | `uuid`, `audit_id`, `severity`, `title`, `description`, `line_start/end`, `confidence`, `gas_saved`, `status`, `reasoning_trace`, `remediation`, `attack_trace`        |
| `auditor_findings`  | `uuid`, `contributor_id`, `contract_id` (must be `is_catalog=true`, enforced by trigger), `review_status`, `submitted_at`, `decided_at`, `dataset_uri`, `dataset_hash` |

RLS is enabled on every table, but edge functions run with the **service role key**, so authorization is enforced at the application layer (`owner_id` / `is_admin` / `is_catalog` checks).

---

## API Surface

Full request/response shapes and cURL examples live in [`API_FE_DOCS.md`](./API_FE_DOCS.md).

| Resource              | Function            | Method · Path                                                                                  |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| User profile          | `me`                | `GET /me`                                                                                      |
| User contracts        | `contracts`         | `GET / POST /contracts` · `GET / PATCH / DELETE /contracts/:uuid`                              |
| Catalog (public)      | `contract_catalog`  | `GET /contract_catalog` · `GET /contract_catalog/:uuid`                                        |
| Catalog (admin)       | `contract_catalog`  | `GET / POST /contract_catalog/admin` · `GET / PATCH /contract_catalog/admin/:uuid`             |
| AI triggers           | `ai`                | `POST /ai-codegen` · `/ai-audit` · `/ai-auto-fix` · `/ai-gas-opt` → `202 { audit_id }`         |
| Audits                | `audits`            | `GET /audits?contract_id=&status=` · `GET /audits/:uuid` (polling, embeds `ai_findings`)       |
| AI findings           | `ai-findings`       | `GET / PATCH /ai-findings/:uuid`                                                               |
| Auditor contributions | `auditor-findings`  | `GET / POST /auditor-findings` · `GET / PATCH /auditor-findings/:uuid` · `PATCH …/submit`      |
| Admin review          | `admin`             | `GET /admin/auditor-findings?review_status=` · `POST …/:uuid/approve` \| `…/reject`            |

### AI Flow — Async + Polling

```
POST /ai-*  ─▶  audits row created (pending)
            ─▶  job submitted to 0G Compute (running)
            ─▶  202 { audit_id }
                      │
FE polls every 2-3s   ▼
GET /audits/:uuid  ──▶ status: succeeded → ai_findings[] embedded
```

> The current `ai/index.ts` does not yet have a worker callback that writes 0G Compute results back to the DB. A callback bridge is the next milestone for `running → succeeded` transitions.

### Auditor → 0G Storage Flow

1. User `POST /auditor-findings` against a catalog contract (auto `review_status=submitted`).
2. Admin reviews the queue via `GET /admin/auditor-findings`.
3. **Approve** (`POST …/:uuid/approve`):
   - Set `review_status=approved`, `decided_at=now()`.
   - Slice `source_code` by `line_start` / `line_end` → produce a JSONL instruction/input/output sample.
   - Upload to **0G Storage** (namespace `datasets`, key `auditor-findings/<uuid>.jsonl`).
   - Persist `dataset_uri` (root hash `0x…64hex` or fallback `0g://…`) and `dataset_hash` (tx hash or SHA-256 fallback).
4. **Reject** only flips status — no upload.

---

## Environment

Copy `.env.example` to `.env`. For deployed environments, use `supabase secrets set …`.

| Variable                    | Required | Description                                                                |
| --------------------------- | :------: | -------------------------------------------------------------------------- |
| `SUPABASE_URL`              |    ✓     | Supabase project URL                                                       |
| `SUPABASE_SERVICE_ROLE_KEY` |    ✓     | Service role key — used by every edge function (bypasses RLS)              |
| `ADMIN_WALLETS`             |    ✓     | Comma-separated wallets to promote to `is_admin=true`                      |
| `OG_CHAIN_ID`               |    –     | Defaults to `16602` (0G testnet)                                           |
| `OG_RPC_URL`                |    –     | Defaults to `https://evmrpc-testnet.0g.ai`                                 |
| `OG_STORAGE_INDEXER`        |    –     | Defaults to `https://indexer-storage-testnet-turbo.0g.ai`                  |
| `OG_STORAGE_NODE`           |    –     | Legacy `POST /upload` fallback; defaults to `OG_STORAGE_INDEXER`           |
| `OG_PRIVATE_KEY`            |   ✓\*    | Signer for SDK uploads. Without it, uploads fall back to the legacy node   |
| `OG_COMPUTE_BROKER`         |   ✓\*    | 0G Compute broker HTTP endpoint. Required for any AI trigger to succeed    |
| `AI_MODEL`                  |    –     | Defaults to `Qwen2.5-0.5B-Instruct` (overridable per job)                  |

`*` Endpoints stay reachable without these, but the feature itself will fail at execution time.

---

## Quick Start

### Prerequisites
- Supabase CLI ≥ 2.x
- Deno ≥ 2.x
- Docker (for `supabase start`)
- Node 18+ (only needed for `supabase deploy` via `npm run deploy`)

### Run Locally

```bash
cd be
cp .env.example .env             # fill in values
supabase start                   # boots Postgres + edge runtime
supabase functions serve --env-file .env
```

Local base URL: `http://127.0.0.1:54321/functions/v1`

Reset the DB and re-apply migrations:

```bash
supabase db reset
```

### Deploy

```bash
# deploy every function
npm run deploy                   # = supabase functions deploy

# or per function
supabase functions deploy contracts
supabase functions deploy ai
# …

# set secrets
supabase secrets set OG_PRIVATE_KEY=0x… OG_COMPUTE_BROKER=https://…

# push migrations to remote
supabase db push
```

---

## Edge Function Routing

Every function deploys to its own slug at `/functions/v1/<name>`. Inside each `index.ts`, the path after the function name is used for manual routing:

- `contracts/:uuid` → handler reads segment index 4 from `/functions/v1/contracts/<uuid>`.
- `ai/index.ts` routes on `pathParts[functionIndex + 2]` (`ai-codegen | ai-audit | …`). Because Supabase has no native path multiplexing, the `ai` function is also deployed under the slugs `ai-codegen`, `ai-audit`, `ai-auto-fix`, and `ai-gas-opt` (or rewritten on the FE) so the segment is always present.

---

## Error Shape

Every error response follows this shape:

```json
{ "error": { "code": "BAD_REQUEST", "message": "…" } }
```

| Code             | HTTP |
| ---------------- | ---: |
| `UNAUTHORIZED`   |  401 |
| `FORBIDDEN`      |  403 |
| `NOT_FOUND`      |  404 |
| `BAD_REQUEST`    |  400 |
| `INTERNAL_ERROR` |  500 |

---

## References

- **[API_FE_DOCS.md](./API_FE_DOCS.md)** — full request/response contract + cURL for every endpoint.
- **[CLAUDE.md](./CLAUDE.md)** — index of 0G agent skills (storage, compute, chain) for SDK pattern lookups.
- **[supabase/migrations/](./supabase/migrations/)** — authoritative DB schema history.

---

<div align="center">

Built for the **0G Hackathon** · Powered by **Supabase + 0G Network**

</div>
