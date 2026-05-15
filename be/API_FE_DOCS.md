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
export SUPABASE_ANON_KEY="eyJh..."
export X_WALLET_ADDRESS="0x8540..."
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
- Response: array of user-owned (non-catalog) contracts. Each item: `uuid, name, source_code, is_catalog, status, hash_sc, gas_estimate, language, reward_per_finding, expired_at, created_at, updated_at, audits[{ uuid, status, kind, created_at }]`.

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
- Response: the contract (`uuid, name, source_code, owner_id, is_catalog, status, hash_sc, gas_estimate, language, reward_per_finding, expired_at, created_at, updated_at`) joined with nested `audits[{ uuid, status, kind, summary, started_at, completed_at, created_at, ai_findings[{ uuid, severity, title, description, line_start, line_end, confidence, gas_saved, status, reasoning_trace, remediation, attack_trace, created_at }] }]`. Returns 404 if the contract is a catalog contract.

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
  - `hash_sc?: string`
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
  - `total_reward?: number` (default: `0`)
- Behavior: after the DB row is inserted, the handler calls the on-chain contract to set `reward_per_finding` for this catalog UUID. If the on-chain call fails, the DB row is rolled back and the request returns `500`.

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
- Behavior: after the DB row is updated, the handler calls the on-chain contract to update `reward_per_finding` for this catalog UUID (using the new value if provided, otherwise the existing value). If the on-chain call fails, the DB update is rolled back to the previous values and the request returns `500`.

### 4.3 AI Trigger

All AI endpoints below are **synchronous**. The handler waits for a response from the AI inference service, writes the results to the database, and then responds with the data immediately.

The AI function exposes two sub-routes under the `ai` function: `POST /ai/ai-codegen` and `POST /ai/ai-audit`. Both require auth headers.

General response: status `200` with a payload containing `audit_id`, `contract_id`, and findings/code.

#### `POST /ai/ai-codegen`
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
  - `contract_id?: string` (UUID of an existing contract owned by the user, not a catalog contract). If not sent, the handler creates a new draft contract named `Generated Contract - YYYY-MM-DD`.
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
      "end_line": 20,
      "excerpt": "...exact code lines from generated_code..."
    }
  ]
}
```
- Behavior notes:
  - The handler updates `contracts.source_code` with the generated code (split into line blocks).
  - If the contract still has a default name (e.g. the auto-generated `Generated Contract - YYYY-MM-DD`), the handler also renames it to the contract name derived from the generated Solidity (`contract Name`).
  - Inserts one `ai_findings` row per mitigation. When no valid mitigations are returned, a single placeholder finding `Mitigations unavailable` is inserted.

#### `POST /ai/ai-audit`
- Query params: none
- Request body:
```json
{
  "code": "pragma solidity ^0.8.0; contract A { ... }",
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `code: string` (raw Solidity source to be audited)
- Optional fields:
  - `contract_id?: string` (UUID of an existing contract owned by the user, not a catalog contract). If not sent, the handler creates a new draft contract named `Audited Contract - YYYY-MM-DD` containing the provided `code`.
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
      "status": "open",
      "attack_trace": { "...": "..." },
      "remediation": { "...": "..." }
    }
  ]
}
```
- Behavior notes:
  - Re-audit semantics: when `contract_id` is provided, any prior `audits` of `kind=audit` and their `ai_findings` for that contract are deleted, and `contracts.source_code` is replaced with the supplied `code`.
  - Findings are stored in the `ai_findings` table (not `auditor_findings`).
  - For findings with severity `critical|high|medium`, an `attack_trace` object is always present (falling back to a stub trace if the model omits it).
  - `remediation` is either a normalized `{ mode: "line", line, replacement_line }` / `{ mode: "function", function_name, replacement_function }` object, or `{ patch: {...} }`, or `null` if the model produced nothing applicable.


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
  - All AI endpoints are synchronous, so polling is not required. The result is returned directly in the trigger response.
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
  - Validates `review_status = "submitted"`, that the referenced contract is a catalog contract, and that the submitter has a wallet address.
  - Updates `review_status = "approved"`, `decided_at = now()`, and sets `reward_amount` from the catalog's `reward_per_finding`.
  - If `reward_per_finding > 0`, calls the on-chain contract to allocate the reward to the submitter. If the on-chain call fails, the DB update is rolled back to `submitted` (with `decided_at = null`, `reward_amount = 0`) and the request returns `500`.
  - Best-effort upload of a JSONL dataset record to 0G Storage; on success, sets `dataset_uri` & `dataset_hash` on the finding.

#### `POST /admin/auditor-findings/:auditor_finding_uuid/reject`
- Query params: none
- Request body: none
- Behavior: Validates `review_status = "submitted"`, updates status to `rejected` + `decided_at = now()`.

### 4.8 Me

#### `GET /me`
- Query params: none
- Request body: none
- Response: `{ id, uuid, wallet_address, is_admin, created_at, updated_at }`.

#### `GET /me/profile`
- Query params: none
- Request body: none
- Response: the user record (`uuid, wallet_address, is_admin, created_at, updated_at`) joined with `auditor_findings` authored by the user (`uuid, contract_id, severity, title, description, review_status, submitted_at, decided_at, line_start, line_end, dataset_uri, dataset_hash, reward_amount, created_at, updated_at`).

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
- Computation:
  - `total_reward_distributed`: sum of `auditor_findings.reward_amount` where `review_status = "approved"`.
  - `total_submitted_findings`: total count of rows in `auditor_findings` (all statuses).
  - `total_smart_contracts_secured`: total count of rows in `contracts` (user-owned + catalog).
  - `total_active_auditors`: number of distinct `contributor_id` values across `auditor_findings`.
- This endpoint is **public**, and does not require `Authorization` or `X-Wallet-Address` headers.

## 5) AI Flow (Synchronous)

All AI requests (`codegen`, `audit`) follow a simple Request/Response pattern. The client waits for the response, which includes the `audit_id` and the generated results.

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
      { "path": "Target.sol", "code": "pragma solidity ^0.8.0; contract Target {}" }
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

#### POST /ai/ai-codegen
```bash
curl -X POST "${BASE_URL}/ai/ai-codegen" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "create a simple ERC20",
    "contract_id": "'"${CONTRACT_UUID}"'"
  }'
```

#### POST /ai/ai-audit
```bash
curl -X POST "${BASE_URL}/ai/ai-audit" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "pragma solidity ^0.8.0; contract Vulnerable { ... }",
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

#### GET /me/profile
```bash
curl -X GET "${BASE_URL}/me/profile" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

### 7.9 Public Stats

#### GET /public-stats
```bash
curl -X GET "${BASE_URL}/public-stats"
```
