# ZeroVuln API Docs (FE)

This document is for integrating the frontend with Supabase Edge Functions.

## 1) Base URL

- Production: `https://<PROJECT_REF>.supabase.co/functions/v1`
- Local: `http://127.0.0.1:54321/functions/v1`

## 2) Auth Header (Required)

Send these two headers in all protected requests:

```http
Authorization: Bearer <SUPABASE_ANON_KEY>
X-Wallet-Address: 0x1234567890abcdef1234567890abcdef12345678
```

Notes:
- `X-Wallet-Address` must be in EVM format: `0x` + 40 hex characters.
- Public API identifiers use `uuid` (not the internal DB integer `id`).

### Env Ready-To-Use

```bash
export PROJECT_REF="kqhhscjatrodmtprccce"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxaGhzY2phdHJvZG10cHJjY2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NjA5MzMsImV4cCI6MjA5NDAzNjkzM30.YExGppnWmcf8o6rEJFrgsY4x2zJNVP-Pmh3S7jT7Q28"
export X_WALLET_ADDRESS="0x8540784B5FCcEb3045d1bc1f74919C7c41C12Fd6"
export BASE_URL="https://${PROJECT_REF}.supabase.co/functions/v1"
```

## 3) Error Shape

General error return format:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "..."
  }
}
```

## 4) Endpoint Detail (Request Body)

`Path params` always use public UUIDs.

### 4.1 Contracts (User-owned)

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

All AI endpoints below are **synchronous** (not polling). The handler waits for a response from the AI inference service, then writes to the DB before responding.

General response: status `200` with a payload containing `audit_id`, `contract_id`, and parsing results.

#### `POST /ai-codegen`
- Query params: none
- Request body:
```json
{
  "prompt": "create a simple ERC20",
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `prompt: string`
- Optional fields:
  - `contract_id?: string` (UUID of an existing contract owned by the user, not a catalog contract). If not sent, the handler creates a new draft contract.
- Response body (example):
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
- The handler also updates `contracts.source_code` with the generated code and creates `ai_findings` (1 per `mitigations` item).

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
  - `code: string` (raw Solidity source to be audited)
- Optional fields:
  - `prompt?: string` (additional instructions; default: "Audit this Solidity contract for security vulnerabilities.")
  - `contract_id?: string` (UUID of an existing contract owned by the user). If not sent, the handler creates a new draft contract containing the provided `code`.
- Response body (example):
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
- Findings are stored in the `ai_findings` table (not `auditor_findings`).

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
  - Creates a new audit of kind=`auto_fix` for the same contract.
  - Submits a compute job to 0G (async on the 0G side), updates the audit to `running`, and marks `ai_finding.status = 'fixed'`.
- Response: `202` with body `{ "audit_id": "<audit_uuid>" }`.

#### `POST /ai-gas-opt`
- Query params: none
- Request body:
```json
{
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `contract_id: string` (UUID of a contract owned by the user, not a catalog contract)
- Behavior:
  - Creates a new audit of kind=`gas_opt`, submits a compute job to 0G, and updates the audit to `running`.
- Response: `202` with body `{ "audit_id": "<audit_uuid>" }`.

### 4.4 Audits

#### `GET /audits`
- Query params (optional):
  - `contract_id=<contract_uuid>`
  - `status=<pending|running|succeeded|failed>`
- Request body: none
- Response: list of audits for the user's contract (excluding catalog), each item containing `uuid, status, kind, summary, started_at, completed_at, created_at, updated_at, contracts(...), ai_findings(count)`.

#### `GET /audits/:audit_uuid`
- Query params: none
- Request body: none
- Notes:
  - For async endpoints (`ai-auto-fix`, `ai-gas-opt`), use polling until `status` becomes `succeeded` or `failed`.
  - For `ai-codegen` & `ai-audit`, the handler sets `succeeded`/`failed` before responding — polling is usually not necessary.
  - Response includes `ai_findings`.

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

### 4.6 Auditor Findings (User Contribution)

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
  - `contract_id: string` (UUID of a **catalog** contract — must be a catalog contract due to DB triggers)
  - `title: string`
  - `severity: "critical" | "high" | "medium" | "low" | "info"`
  - `description: string`
  - `line_start: number` (>=1)
  - `line_end: number` (>= line_start)
- Behavior: finding is immediately created with `review_status = "submitted"` and `submitted_at = now()`.

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
  - `contract_id?: string` (must be a catalog contract)
  - `title?: string`
  - `severity?: "critical" | "high" | "medium" | "low" | "info"`
  - `description?: string`
  - `line_start?: number` (>=1)
  - `line_end?: number` (>= line_start)
- Cannot be updated if `review_status` is already `approved` or `rejected`.

#### `PATCH /auditor-findings/:auditor_finding_uuid/submit`
- Query params: none
- Request body: none
- Behavior: changes `review_status` to `submitted` and sets `submitted_at`. Only allowed from `draft` or `submitted` status.

### 4.7 Admin Review

All these endpoints require an admin user (`users.is_admin = true`).

#### `GET /admin/auditor-findings`
- Query params (optional):
  - `review_status=<draft|submitted|approved|rejected>`
- Request body: none
- Default behavior: if the query is not sent, the backend defaults to `review_status=submitted`.
- Response includes joins: `contracts(...)`, `users:contributor_id(...)`.

#### `POST /admin/auditor-findings/:auditor_finding_uuid/approve`
- Query params: none
- Request body: none
- Behavior:
  - Validates `review_status = "submitted"` & catalog contract reference.
  - Updates `review_status = "approved"`, `decided_at = now()`.
  - Best-effort upload of JSONL dataset record to 0G Storage; sets `dataset_uri` & `dataset_hash` in the finding.

#### `POST /admin/auditor-findings/:auditor_finding_uuid/reject`
- Query params: none
- Request body: none
- Behavior: Validates `review_status = "submitted"`, updates status to `rejected` + `decided_at = now()`.

### 4.8 Me

#### `GET /me`
- Query params: none
- Request body: none
- Response: `{ id, uuid, wallet_address, is_admin, created_at, updated_at }`.

### 4.9 Public Stats (Unauthenticated)

#### `GET /public-stats`
- Query params: none
- Request body: none
- Response (example):
```json
{
  "total_reward_distributed": 5000,
  "total_submitted_findings": 124,
  "total_smart_contracts_secured": 42,
  "total_active_auditors": 18
}
```
- This endpoint is **public**, and does not require `Authorization` or `X-Wallet-Address` headers.

## 5) Polling Pattern (FE)

Only applies to async AI endpoints:

1. Call `/ai-auto-fix` or `/ai-gas-opt` → receive `audit_id` (status `202`).
2. Poll `GET /audits/:audit_uuid` every 2–3 seconds.
3. Stop when `status` is `succeeded` or `failed`.

`/ai-codegen` and `/ai-audit` are synchronous — they provide the results directly in the response (status `200`).

## 6) cURL Template

```bash
curl -X GET "${BASE_URL}/me" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

## 7) cURL for all APIs

Set the required UUIDs:

```bash
export CONTRACT_UUID="<contract_uuid>"
export AUDIT_UUID="<audit_uuid>"
export AI_FINDING_UUID="<ai_finding_uuid>"
export AUDITOR_FINDING_UUID="<auditor_finding_uuid>"
export CATALOG_CONTRACT_UUID="<catalog_contract_uuid>"
```

### 7.1 Contracts (User-owned)

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
    "prompt": "create a simple ERC20",
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
