# ZeroVuln API Docs (FE)

Dokumen ini untuk integrasi frontend ke Supabase Edge Functions.

## 1) Base URL

- Production: `https://<PROJECT_REF>.supabase.co/functions/v1`
- Local: `http://127.0.0.1:54321/functions/v1`

## 2) Auth Header (wajib)

Kirim dua header ini di semua request protected:

```http
Authorization: Bearer <SUPABASE_ANON_KEY>
X-Wallet-Address: 0x1234567890abcdef1234567890abcdef12345678
```

Catatan:
- `X-Wallet-Address` wajib format EVM `0x` + 40 hex.
- Identifier publik API pakai `uuid` (bukan `id` integer internal DB).

### Env Ready-To-Use

```bash
export PROJECT_REF="kqhhscjatrodmtprccce"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxaGhzY2phdHJvZG10cHJjY2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NjA5MzMsImV4cCI6MjA5NDAzNjkzM30.YExGppnWmcf8o6rEJFrgsY4x2zJNVP-Pmh3S7jT7Q28"
export X_WALLET_ADDRESS="0x8540784B5FCcEb3045d1bc1f74919C7c41C12Fd6"
export BASE_URL="https://${PROJECT_REF}.supabase.co/functions/v1"
```

## 3) Error Shape

Umumnya error return format:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "..."
  }
}
```

## 4) Endpoint Detail (Request Body)

`Path params` selalu pakai UUID publik.

### 4.1 Contracts (milik user)

#### `GET /contracts`
- Query params: none
- Request body: none

#### `POST /contracts`
- Query params: none
- Request body:
```json
{
  "name": "My Contract",
  "source_code": [
    {
      "path": "Contract.sol",
      "code": "pragma solidity ^0.8.0; contract A {}"
    }
  ],
  "language": "solidity",
  "expired_at": "2026-12-31T23:59:59Z"
}
```
- Body required fields:
  - `source_code: object[] (JSON array of objects)`
- Body optional fields:
  - `name?: string`
  - `language?: string` (default: `solidity`)
  - `expired_at?: string (ISO datetime)`

#### `GET /contracts/:contract_uuid`
- Query params: none
- Request body: none

#### `PATCH /contracts/:contract_uuid`
- Query params: none
- Request body (partial):
```json
{
  "name": "New Name",
  "source_code": [
    { "path": "Contract.sol", "code": "updated solidity source..." }
  ],
  "language": "solidity",
  "status": "draft",
  "expired_at": "2027-01-31T23:59:59Z"
}
```
- Body optional fields:
  - `name?: string`
  - `source_code?: object[]`
  - `language?: string`
  - `status?: "draft" | "audited"`
  - `expired_at?: string (ISO datetime)`

#### `DELETE /contracts/:contract_uuid`
- Query params: none
- Request body: none

### 4.2 Catalog Contracts

#### `GET /contract_catalog`
- Query params: none
- Request body: none

#### `GET /contract_catalog/:contract_uuid`
- Query params: none
- Request body: none

#### `GET /contract_catalog/admin`
- Query params: none
- Request body: none

#### `GET /contract_catalog/admin/:contract_uuid`
- Query params: none
- Request body: none

#### `POST /contract_catalog/admin`
- Query params: none
- Request body:
```json
{
  "name": "Target A",
  "source_code": [
    { "path": "Target.sol", "code": "pragma solidity ^0.8.0; contract Target {}" }
  ],
  "language": "solidity",
  "expired_at": "2026-12-31T23:59:59Z",
  "reward_per_finding": 0
}
```
- Body required fields:
  - `source_code: object[]`
- Body optional fields:
  - `name?: string`
  - `language?: string` (default: `solidity`)
  - `expired_at?: string (ISO datetime)`
  - `reward_per_finding?: number` (default: `0`)

#### `PATCH /contract_catalog/admin/:contract_uuid`
- Query params: none
- Request body (partial):
```json
{
  "name": "Updated Target Name",
  "source_code": [
    { "path": "Target.sol", "code": "updated solidity source..." }
  ],
  "language": "solidity",
  "expired_at": "2027-01-31T23:59:59Z",
  "reward_per_finding": 5
}
```
- Body optional fields:
  - `name?: string`
  - `source_code?: object[]`
  - `language?: string`
  - `expired_at?: string (ISO datetime)`
  - `reward_per_finding?: number`

### 4.3 AI Trigger

Semua endpoint AI di bawah ini bersifat **synchronous** (bukan polling). Handler menunggu response dari AI inference service, lalu menulis ke DB sebelum membalas.

Response umum: status `200` dengan payload berisi `audit_id`, `contract_id`, dan hasil parsing.

#### `POST /ai-codegen`
- Query params: none
- Request body:
```json
{
  "prompt": "buat ERC20 sederhana",
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `prompt: string`
- Optional fields:
  - `contract_id?: string` (UUID kontrak existing milik user, bukan catalog). Jika tidak dikirim, handler membuat draft contract baru.
- Response body (contoh):
```json
{
  "contract_id": "<contract_uuid>",
  "audit_id": "<audit_uuid>",
  "generated_code": "pragma solidity ...",
  "mitigations": [
    {
      "name": "Reentrancy",
      "reason": "applies ReentrancyGuard...",
      "start_line": 12,
      "end_line": 20
    }
  ]
}
```
- Handler juga update `contracts.source_code` dengan kode yang di-generate dan membuat `ai_findings` (1 per item `mitigations`).

#### `POST /ai-audit`
- Query params: none
- Request body:
```json
{
  "code": "pragma solidity ^0.8.0; contract A { ... }",
  "prompt": "Audit this contract.",
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `code: string` (raw Solidity source untuk diaudit)
- Optional fields:
  - `prompt?: string` (instruksi tambahan; default: "Audit this Solidity contract for security vulnerabilities.")
  - `contract_id?: string` (UUID kontrak existing milik user). Jika tidak dikirim, handler membuat draft contract baru berisi `code` tersebut.
- Response body (contoh):
```json
{
  "contract_id": "<contract_uuid>",
  "audit_id": "<audit_uuid>",
  "code_fixed": "pragma solidity ... // fixed",
  "findings": [
    {
      "uuid": "<ai_finding_uuid>",
      "severity": "high",
      "title": "Reentrancy",
      "description": "Step 1: ...\nStep 2: ...",
      "line_start": 42,
      "line_end": 50,
      "confidence": 0.92,
      "status": "open"
    }
  ]
}
```
- Findings disimpan di tabel `ai_findings` (bukan `auditor_findings`).

#### `POST /ai-auto-fix`
- Query params: none
- Request body:
```json
{
  "ai_finding_id": "<ai_finding_uuid>"
}
```
- Required fields:
  - `ai_finding_id: string`
- Behavior:
  - Membuat audit baru kind=`auto_fix` untuk contract yang sama.
  - Submit compute job ke 0G (async di sisi 0G), update audit ke `running`, dan menandai `ai_finding.status = 'fixed'`.
- Response: `202` dengan body `{ "audit_id": "<audit_uuid>" }`.

#### `POST /ai-gas-opt`
- Query params: none
- Request body:
```json
{
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `contract_id: string` (UUID kontrak milik user, bukan catalog)
- Behavior:
  - Membuat audit baru kind=`gas_opt`, submit compute job ke 0G, update audit ke `running`.
- Response: `202` dengan body `{ "audit_id": "<audit_uuid>" }`.

### 4.4 Audits

#### `GET /audits`
- Query params (optional):
  - `contract_id=<contract_uuid>`
  - `status=<pending|running|succeeded|failed>`
- Request body: none
- Response: list audit untuk contract milik user (catalog excluded), tiap item berisi `uuid, status, kind, summary, started_at, completed_at, created_at, updated_at, contracts(...), ai_findings(count)`.

#### `GET /audits/:audit_uuid`
- Query params: none
- Request body: none
- Notes:
  - Untuk endpoint async (`ai-auto-fix`, `ai-gas-opt`), dipakai polling sampai `status` jadi `succeeded` atau `failed`.
  - Untuk `ai-codegen` & `ai-audit`, handler sudah set `succeeded`/`failed` sebelum response — polling biasanya tidak perlu.
  - Response include `ai_findings`.

### 4.5 AI Findings

#### `GET /ai-findings/:ai_finding_uuid`
- Query params: none
- Request body: none

#### `PATCH /ai-findings/:ai_finding_uuid`
- Query params: none
- Request body:
```json
{
  "status": "accepted"
}
```
- Allowed values: `open | fixed | dismissed | accepted`

### 4.6 Auditor Findings (user kontribusi)

#### `GET /auditor-findings`
- Query params: none
- Request body: none

#### `POST /auditor-findings`
- Query params: none
- Request body:
```json
{
  "contract_id": "<catalog_contract_uuid>",
  "title": "reentrancy",
  "severity": "high",
  "description": "...",
  "line_start": 42,
  "line_end": 50
}
```
- Required fields:
  - `contract_id: string` (UUID **catalog** contract — wajib catalog karena trigger DB)
  - `title: string`
  - `severity: "critical" | "high" | "medium" | "low" | "info"`
  - `description: string`
  - `line_start: number` (>=1)
  - `line_end: number` (>= line_start)
- Behavior: finding langsung dibuat dengan `review_status = "submitted"` dan `submitted_at = now()`.

#### `GET /auditor-findings/:auditor_finding_uuid`
- Query params: none
- Request body: none

#### `PATCH /auditor-findings/:auditor_finding_uuid`
- Query params: none
- Request body (partial):
```json
{
  "contract_id": "<catalog_contract_uuid>",
  "title": "access-control",
  "severity": "medium",
  "description": "updated analysis",
  "line_start": 10,
  "line_end": 20
}
```
- Body optional fields:
  - `contract_id?: string` (harus catalog contract)
  - `title?: string`
  - `severity?: "critical" | "high" | "medium" | "low" | "info"`
  - `description?: string`
  - `line_start?: number` (>=1)
  - `line_end?: number` (>= line_start)
- Tidak bisa update kalau `review_status` sudah `approved` atau `rejected`.

#### `PATCH /auditor-findings/:auditor_finding_uuid/submit`
- Query params: none
- Request body: none
- Behavior: ubah `review_status` jadi `submitted` dan set `submitted_at`. Hanya bisa dari `draft` atau `submitted`.

### 4.7 Admin Review

Semua endpoint ini butuh user admin (`users.is_admin = true`).

#### `GET /admin/auditor-findings`
- Query params (optional):
  - `review_status=<draft|submitted|approved|rejected>`
- Request body: none
- Default behavior: kalau query tidak dikirim, backend pakai `review_status=submitted`.
- Response include join: `contracts(...)`, `users:contributor_id(...)`.

#### `POST /admin/auditor-findings/:auditor_finding_uuid/approve`
- Query params: none
- Request body: none
- Behavior:
  - Validasi `review_status = "submitted"` & contract referensi catalog.
  - Update `review_status = "approved"`, `decided_at = now()`.
  - Best-effort upload JSONL dataset record ke 0G Storage; set `dataset_uri` & `dataset_hash` di finding.

#### `POST /admin/auditor-findings/:auditor_finding_uuid/reject`
- Query params: none
- Request body: none
- Behavior: Validasi `review_status = "submitted"`, update jadi `rejected` + `decided_at = now()`.

### 4.8 Me

#### `GET /me`
- Query params: none
- Request body: none
- Response: `{ id, uuid, wallet_address, is_admin, created_at, updated_at }`.

### 4.9 Public Stats (Unauthenticated)

#### `GET /public-stats`
- Query params: none
- Request body: none
- Response (contoh):
```json
{
  "total_reward_distributed": 5000,
  "total_submitted_findings": 124,
  "total_smart_contracts_secured": 42,
  "total_active_auditors": 18
}
```
- Endpoint ini **public**, tidak memerlukan header `Authorization` maupun `X-Wallet-Address`.

## 5) Polling Pattern (FE)

Hanya berlaku untuk endpoint AI async:

1. Call `/ai-auto-fix` atau `/ai-gas-opt` → dapat `audit_id` (status `202`).
2. Poll `GET /audits/:audit_uuid` tiap 2–3 detik.
3. Stop saat `status` adalah `succeeded` atau `failed`.

`/ai-codegen` dan `/ai-audit` synchronous — langsung balas hasil di response (status `200`).

## 6) cURL Template

```bash
curl -X GET "${BASE_URL}/me" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

## 7) cURL Semua API

Set UUID yang dibutuhkan:

```bash
export CONTRACT_UUID="<contract_uuid>"
export AUDIT_UUID="<audit_uuid>"
export AI_FINDING_UUID="<ai_finding_uuid>"
export AUDITOR_FINDING_UUID="<auditor_finding_uuid>"
export CATALOG_CONTRACT_UUID="<catalog_contract_uuid>"
```

### 7.1 Contracts (milik user)

#### GET /contracts
```bash
curl -X GET "${BASE_URL}/contracts" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### POST /contracts
```bash
curl -X POST "${BASE_URL}/contracts" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Contract",
    "source_code": [
      { "path": "Contract.sol", "code": "pragma solidity ^0.8.0; contract A {}" }
    ],
    "language": "solidity",
    "expired_at": "2026-12-31T23:59:59Z"
  }'
```

#### GET /contracts/:contract_uuid
```bash
curl -X GET "${BASE_URL}/contracts/${CONTRACT_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### PATCH /contracts/:contract_uuid
```bash
curl -X PATCH "${BASE_URL}/contracts/${CONTRACT_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Name",
    "source_code": [
      { "path": "Contract.sol", "code": "pragma solidity ^0.8.0; contract A { uint x; }" }
    ],
    "status": "draft"
  }'
```

#### DELETE /contracts/:contract_uuid
```bash
curl -X DELETE "${BASE_URL}/contracts/${CONTRACT_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

### 7.2 Catalog Contracts

#### GET /contract_catalog
```bash
curl -X GET "${BASE_URL}/contract_catalog" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### GET /contract_catalog/:contract_uuid
```bash
curl -X GET "${BASE_URL}/contract_catalog/${CATALOG_CONTRACT_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### GET /contract_catalog/admin
```bash
curl -X GET "${BASE_URL}/contract_catalog/admin" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### GET /contract_catalog/admin/:contract_uuid
```bash
curl -X GET "${BASE_URL}/contract_catalog/admin/${CATALOG_CONTRACT_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### POST /contract_catalog/admin
```bash
curl -X POST "${BASE_URL}/contract_catalog/admin" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Target A",
    "source_code": [
      { "line": 1, "code": "pragma solidity ^0.8.0; contract Target {}" }
    ],
    "language": "solidity",
    "expired_at": "2026-12-31T23:59:59Z",
    "reward_per_finding": 0
  }'
```

#### PATCH /contract_catalog/admin/:contract_uuid
```bash
curl -X PATCH "${BASE_URL}/contract_catalog/admin/${CATALOG_CONTRACT_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Target",
    "source_code": [
      { "path": "Target.sol", "code": "pragma solidity ^0.8.0; contract Target { uint x; }" }
    ],
    "language": "solidity",
    "expired_at": "2027-01-31T23:59:59Z",
    "reward_per_finding": 5
  }'
```

### 7.3 AI Trigger

#### POST /ai-codegen
```bash
curl -X POST "${BASE_URL}/ai-codegen" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "buat ERC20 sederhana",
    "contract_id": "'"${CONTRACT_UUID}"'"
  }'
```

#### POST /ai-audit
```bash
curl -X POST "${BASE_URL}/ai-audit" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "pragma solidity ^0.8.0; contract Vulnerable { ... }",
    "prompt": "Audit this contract for security issues.",
    "contract_id": "'"${CONTRACT_UUID}"'"
  }'
```

#### POST /ai-auto-fix
```bash
curl -X POST "${BASE_URL}/ai-auto-fix" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "ai_finding_id": "'"${AI_FINDING_UUID}"'"
  }'
```

#### POST /ai-gas-opt
```bash
curl -X POST "${BASE_URL}/ai-gas-opt" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_id": "'"${CONTRACT_UUID}"'"
  }'
```

### 7.4 Audits

#### GET /audits
```bash
curl -X GET "${BASE_URL}/audits?contract_id=${CONTRACT_UUID}&status=running" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### GET /audits/:audit_uuid
```bash
curl -X GET "${BASE_URL}/audits/${AUDIT_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

### 7.5 AI Findings

#### GET /ai-findings/:ai_finding_uuid
```bash
curl -X GET "${BASE_URL}/ai-findings/${AI_FINDING_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### PATCH /ai-findings/:ai_finding_uuid
```bash
curl -X PATCH "${BASE_URL}/ai-findings/${AI_FINDING_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "accepted"
  }'
```

### 7.6 Auditor Findings

#### GET /auditor-findings
```bash
curl -X GET "${BASE_URL}/auditor-findings" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### POST /auditor-findings
```bash
curl -X POST "${BASE_URL}/auditor-findings" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_id": "'"${CATALOG_CONTRACT_UUID}"'",
    "title": "reentrancy",
    "severity": "high",
    "description": "state update after external call",
    "line_start": 42,
    "line_end": 50
  }'
```

#### GET /auditor-findings/:auditor_finding_uuid
```bash
curl -X GET "${BASE_URL}/auditor-findings/${AUDITOR_FINDING_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### PATCH /auditor-findings/:auditor_finding_uuid
```bash
curl -X PATCH "${BASE_URL}/auditor-findings/${AUDITOR_FINDING_UUID}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "access-control",
    "severity": "medium",
    "description": "missing onlyOwner on setter",
    "line_start": 10,
    "line_end": 20
  }'
```

#### PATCH /auditor-findings/:auditor_finding_uuid/submit
```bash
curl -X PATCH "${BASE_URL}/auditor-findings/${AUDITOR_FINDING_UUID}/submit" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

### 7.7 Admin Review

#### GET /admin/auditor-findings
```bash
curl -X GET "${BASE_URL}/admin/auditor-findings?review_status=submitted" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### POST /admin/auditor-findings/:auditor_finding_uuid/approve
```bash
curl -X POST "${BASE_URL}/admin/auditor-findings/${AUDITOR_FINDING_UUID}/approve" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### POST /admin/auditor-findings/:auditor_finding_uuid/reject
```bash
curl -X POST "${BASE_URL}/admin/auditor-findings/${AUDITOR_FINDING_UUID}/reject" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

### 7.8 Me

#### GET /me
```bash
curl -X GET "${BASE_URL}/me" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

### 7.9 Public Stats

#### GET /public-stats
```bash
curl -X GET "${BASE_URL}/public-stats"
```
