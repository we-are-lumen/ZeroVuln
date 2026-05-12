# ZeroVuln Backend

Supabase Edge Functions (Deno) + Postgres untuk platform audit smart contract ZeroVuln. Backend ini mengintegrasikan **0G Storage** untuk persistensi dataset hasil approve, dan **0G Compute** sebagai job queue untuk inferensi AI (codegen, audit, auto-fix, gas optimization).

## Struktur

```
be/
├── supabase/
│   ├── config.toml                # Konfigurasi Supabase CLI (local + remote)
│   ├── migrations/                # Skema SQL berurutan (init → expired_at → source_code jsonb)
│   └── functions/
│       ├── _shared/
│       │   ├── supabase.ts        # Auth (X-Wallet-Address), helper response, supabase admin client
│       │   ├── og-storage.ts      # 0G Storage upload/download + 0G Compute job submit/get
│       │   └── mod.ts             # Re-export
│       ├── me/                    # GET /me — profil user + admin flag
│       ├── contracts/             # CRUD kontrak user (is_catalog=false)
│       ├── contract_catalog/      # Katalog kontrak target audit (public list + admin write)
│       ├── ai/                    # Trigger inferensi: ai-codegen | ai-audit | ai-auto-fix | ai-gas-opt
│       ├── audits/                # List + detail audit (polling target)
│       ├── ai-findings/           # GET / PATCH status finding hasil AI
│       ├── auditor-findings/      # CRUD finding user (kontribusi) + submit
│       └── admin/                 # Review queue, approve (upload dataset ke 0G), reject
├── package.json                   # Dependency npm (untuk supabase deploy)
├── deno.json                      # Konfigurasi Deno + import map
├── .env.example                   # Template env (jangan commit .env asli)
├── API_FE_DOCS.md                 # Detail request/response untuk integrasi FE
└── CLAUDE.md                      # Catatan 0G agent skills (referensi internal)
```

## Tech Stack

- **Supabase Edge Functions** (Deno runtime 2.x) sebagai HTTP layer
- **Postgres** (Supabase managed) sebagai sumber kebenaran data
- **0G Storage** via `@0gfoundation/0g-ts-sdk@1.2.8` untuk simpan dataset hasil approve
- **0G Compute Broker** (HTTP) untuk submit job inferensi AI
- **ethers v6** untuk signer 0G Chain (testnet, chain id `16602`)

## Autentikasi

Tidak pakai Supabase Auth. Identitas user di-derive dari header **wallet EVM**:

```http
Authorization: Bearer <SUPABASE_ANON_KEY>
X-Wallet-Address: 0x....40hex
```

`resolveUser()` di `_shared/supabase.ts`:

1. Validasi format wallet `0x` + 40 hex.
2. Cek terhadap `ADMIN_WALLETS` (comma-separated env) → set `is_admin`.
3. `upsert` ke `public.users` (`onConflict: wallet_address`) → returning row.
4. Jika wallet baru promote jadi admin, update kolom `is_admin`.

Identifier publik di API selalu `uuid` (kolom `uuid` di setiap tabel). Foreign key internal pakai `bigint id`.

## Skema Database (ringkas)

Lihat `supabase/migrations/` untuk versi otoritatif. Setelah migrasi terbaru:

- **users**: `id`, `uuid`, `wallet_address` (unique), `is_admin`, timestamps.
- **contracts**: `id`, `uuid`, `owner_id`, `is_catalog`, `name`, `status`, `language` (default `solidity`), `source_code jsonb[]` (array of `{ path, code }`), `gas_estimate`, `reward_per_finding`, `expired_at` (required), timestamps.
- **audits**: `id`, `uuid`, `contract_id`, `status` (`pending|running|succeeded|failed`), `kind` (`codegen|audit|auto_fix|gas_opt`), `prompt_template`, `summary`, `started_at`, `completed_at`, timestamps.
- **ai_findings**: `id`, `uuid`, `audit_id`, `severity`, `title`, `description`, `line_start`, `line_end`, `confidence`, `gas_saved`, `status` (`open|fixed|dismissed|accepted`), `reasoning_trace jsonb`, `remediation jsonb`, timestamps.
- **auditor_findings**: `id`, `uuid`, `contributor_id`, `contract_id` (harus reference contract `is_catalog=true` — diperiksa trigger `auditor_findings_check_catalog`), `severity`, `title`, `description`, `line_start`, `line_end`, `review_status` (`draft|submitted|approved|rejected`), `submitted_at`, `decided_at`, `dataset_uri`, `dataset_hash`, timestamps.

RLS aktif untuk semua tabel, tapi semua akses lewat edge function pakai **service role key** sehingga RLS di-bypass; otorisasi dipaksakan di layer aplikasi (cek `owner_id` / `is_admin` / `is_catalog`).

## Endpoint

Resource → file: lihat tabel di bawah. Detail body & contoh cURL ada di [`API_FE_DOCS.md`](./API_FE_DOCS.md).

| Resource             | Edge Function            | Method/Path                                                                                  |
| -------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| User profile         | `me`                     | `GET /me`                                                                                    |
| User contracts       | `contracts`              | `GET / POST /contracts`, `GET / PATCH / DELETE /contracts/:uuid`                             |
| Catalog (public)     | `contract_catalog`       | `GET /contract_catalog`, `GET /contract_catalog/:uuid`                                       |
| Catalog (admin)      | `contract_catalog`       | `GET / POST /contract_catalog/admin`, `GET / PATCH /contract_catalog/admin/:uuid`            |
| AI trigger           | `ai`                     | `POST /ai-codegen`, `/ai-audit`, `/ai-auto-fix`, `/ai-gas-opt` → return `202 {audit_id}`     |
| Audits               | `audits`                 | `GET /audits?contract_id=&status=`, `GET /audits/:uuid` (polling target, embed `ai_findings`) |
| AI findings          | `ai-findings`            | `GET / PATCH /ai-findings/:uuid`                                                             |
| Auditor (kontributor)| `auditor-findings`       | `GET / POST /auditor-findings`, `GET / PATCH /auditor-findings/:uuid`, `PATCH …/submit`      |
| Admin review         | `admin`                  | `GET /admin/auditor-findings?review_status=`, `POST …/:uuid/approve` \| `…/reject`           |

### Flow AI (polling pattern)

1. `POST /ai-*` → buat row `audits` status `pending` → submit ke 0G Compute Broker → update status `running` → return `202 { audit_id }`.
2. FE polling `GET /audits/:audit_id` setiap 2-3 detik sampai `status` ∈ `{succeeded, failed}`.
3. Saat `succeeded`, response sudah include array `ai_findings`.

> Saat ini handler `ai/index.ts` belum punya callback worker yang menulis hasil 0G Compute kembali ke DB; integrasi callback diperlukan untuk transisi `running → succeeded`.

### Flow Auditor → Dataset 0G

1. User `POST /auditor-findings` (auto `review_status=submitted`) di catalog contract.
2. Admin `GET /admin/auditor-findings` (default filter `submitted`).
3. Admin `POST /admin/auditor-findings/:uuid/approve`:
   - Set `review_status=approved`, `decided_at=now()`.
   - Slice `source_code` berdasarkan `line_start`/`line_end` → JSONL instruction/input/output.
   - Upload ke 0G Storage (namespace `datasets`, key `auditor-findings/<uuid>.jsonl`).
   - Simpan `dataset_uri` (root hash `0x…64hex` atau fallback `0g://…`) dan `dataset_hash` (tx hash atau SHA-256 fallback) di row.
4. Reject hanya update status, tanpa upload.

## Environment

Salin `.env.example` ke `.env` dan isi value yang aman. Untuk deployment Supabase, set sebagai **function secrets** (`supabase secrets set ...`).

| Variabel                    | Wajib | Keterangan                                                                   |
| --------------------------- | ----- | ---------------------------------------------------------------------------- |
| `SUPABASE_URL`              | ✓     | URL project Supabase                                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓     | Service role key (bypass RLS) — dipakai semua edge function                  |
| `ADMIN_WALLETS`             | ✓     | Comma-separated wallet `0x…` yang diberi `is_admin=true`                     |
| `OG_CHAIN_ID`               | -     | Default `16602` (0G testnet)                                                 |
| `OG_RPC_URL`                | -     | Default `https://evmrpc-testnet.0g.ai`                                       |
| `OG_STORAGE_INDEXER`        | -     | Default `https://indexer-storage-testnet-turbo.0g.ai`                        |
| `OG_STORAGE_NODE`           | -     | Fallback legacy `POST /upload`; defaults ke `OG_STORAGE_INDEXER`             |
| `OG_PRIVATE_KEY`            | ✓*    | Signer untuk upload via SDK. Tanpa ini, upload fallback ke legacy endpoint   |
| `OG_COMPUTE_BROKER`         | ✓*    | Endpoint HTTP broker 0G Compute. Tanpa ini, semua trigger AI akan error      |
| `AI_MODEL`                  | -     | Default `Qwen2.5-0.5B-Instruct` (override per submit)                        |

`*` wajib agar feature terkait fungsional; tanpa itu endpoint masih jalan tapi gagal saat eksekusi.

## Setup & Run

### Prasyarat
- Supabase CLI ≥ 2.x
- Deno ≥ 2.x
- Docker (untuk `supabase start` lokal)
- Node 18+ (hanya untuk `supabase deploy` via `npm run deploy`)

### Local

```bash
cd be
cp .env.example .env   # isi value
supabase start         # spin up Postgres + edge runtime
supabase functions serve --env-file .env
```

Base URL lokal: `http://127.0.0.1:54321/functions/v1`.

Reset DB + apply migrasi:

```bash
supabase db reset
```

### Deploy

```bash
# semua function
npm run deploy           # = supabase functions deploy

# atau per function
supabase functions deploy contracts
supabase functions deploy ai
# dst.

# secrets
supabase secrets set OG_PRIVATE_KEY=0x... OG_COMPUTE_BROKER=https://...
```

Pastikan migration sudah di-push ke remote:

```bash
supabase db push
```

## Routing Edge Function

Semua function di-deploy sebagai endpoint terpisah di `/functions/v1/<name>`. Internal di tiap `index.ts`, path setelah nama function dipakai untuk routing manual:

- `contracts/:uuid` → handler ambil segmen indeks ke-4 dari `/functions/v1/contracts/<uuid>`.
- `ai/index.ts` me-route berdasarkan `pathParts[functionIndex + 2]` (segment `ai-codegen|ai-audit|…`). Karena Supabase tidak punya path multiplexing native, function `ai` di-mount untuk semua 4 endpoint AI; deploy juga slug `ai-codegen`/`ai-audit`/`ai-auto-fix`/`ai-gas-opt` (atau pakai rewrite di FE) sehingga path mengandung segment tersebut.

## Error Shape

```json
{ "error": { "code": "BAD_REQUEST", "message": "..." } }
```

Code yang dipakai: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `INTERNAL_ERROR` (500).

## Referensi

- [`API_FE_DOCS.md`](./API_FE_DOCS.md) — kontrak request/response detail + cURL untuk semua endpoint.
- [`CLAUDE.md`](./CLAUDE.md) — index 0G agent skills (storage, compute, chain) bila perlu lookup pattern SDK.
- [`supabase/migrations/`](./supabase/migrations/) — sumber kebenaran skema DB.
