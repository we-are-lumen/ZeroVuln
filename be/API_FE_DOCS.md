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
  "source": {
    "code": "pragma solidity ^0.8.0; ...",
    "metadata": {}
  },
  "language": "solidity",
  "expired_at": "2026-12-31T23:59:59Z"
}
```
- Body required fields:
  - `source: object (JSON)`
  - `expired_at: string (ISO datetime)`
- Body optional fields:
  - `name?: string`
  - `language?: string` (default: `solidity`)

#### `GET /contracts/:contract_uuid`
- Query params: none
- Request body: none

#### `PATCH /contracts/:contract_uuid`
- Query params: none
- Request body (partial):
```json
{
  "name": "New Name",
  "source": {
    "code": "updated solidity source...",
    "metadata": {}
  },
  "status": "draft"
}
```
- Body optional fields:
  - `name?: string`
  - `source?: object (JSON)`
  - `status?: string`

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
  "source": {
    "code": "pragma solidity ^0.8.0; ...",
    "metadata": {}
  },
  "language": "solidity",
  "expired_at": "2026-12-31T23:59:59Z"
}
```
- Body fields:
  - `source: object (JSON, required)`
  - `expired_at: string (ISO datetime, required)`
  - `name?: string`
  - `language?: string` (default: `solidity`)

#### `PATCH /contract_catalog/admin/:contract_uuid`
- Query params: none
- Request body (partial):
```json
{
  "name": "Updated Target Name",
  "source": {
    "code": "updated solidity source...",
    "metadata": {}
  },
  "compile_status": "compiled",
  "compiler_version": "0.8.24"
}
```
- Body optional fields:
  - `name?: string`
  - `source?: object (JSON)`
  - `compile_status?: string`
  - `compiler_version?: string`
  - `expired_at?: string (ISO datetime)`

### 4.3 AI Trigger

Semua endpoint di bawah return `202`:

```json
{ "audit_id": "<audit_uuid>" }
```

#### `POST /ai-codegen`
- Query params: none
- Request body:
```json
{
  "contract_id": "<contract_uuid>",
  "prompt": "buat ERC20 sederhana"
}
```
- Required fields:
  - `contract_id: string`
  - `prompt: string`

#### `POST /ai-audit`
- Query params: none
- Request body:
```json
{
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `contract_id: string`

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

#### `POST /ai-gas-opt`
- Query params: none
- Request body:
```json
{
  "contract_id": "<contract_uuid>"
}
```
- Required fields:
  - `contract_id: string`

### 4.4 Audits

#### `GET /audits`
- Query params (optional):
  - `contract_id=<contract_uuid>`
  - `status=<pending|running|succeeded|failed>`
- Request body: none

#### `GET /audits/:audit_uuid`
- Query params: none
- Request body: none
- Notes:
  - Dipakai polling sampai `status` jadi `succeeded` atau `failed`.
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
- Allowed value (umum): `open | fixed | dismissed | accepted`
- Notes:
  - Saat `status=accepted`, backend akan upload snapshot reasoning finding ke 0G Storage dan mengisi `reasoning_uri` + `reasoning_hash` pada record finding.

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
  "description": "..."
}
```
- Required fields:
  - `contract_id: string`
  - `title: string`
  - `severity: "critical" | "high" | "medium" | "low" | "info"`
  - `description: string`

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
  "description": "updated analysis"
}
```
- Body optional fields:
  - `contract_id?: string`
  - `title?: string`
  - `severity?: "critical" | "high" | "medium" | "low" | "info"`
  - `description?: string`

#### `PATCH /auditor-findings/:auditor_finding_uuid/submit`
- Query params: none
- Request body: none

### 4.7 Admin Review

Semua endpoint ini butuh user admin.

#### `GET /admin/auditor-findings`
- Query params (optional):
  - `review_status=<draft|submitted|approved|rejected>`
- Request body: none
- Default behavior: kalau query tidak dikirim, backend pakai `review_status=submitted`.

#### `POST /admin/auditor-findings/:auditor_finding_uuid/approve`
- Query params: none
- Request body: none

#### `POST /admin/auditor-findings/:auditor_finding_uuid/reject`
- Query params: none
- Request body: none

### 4.8 Me / Settings

#### `GET /me`
- Query params: none
- Request body: none

#### `PATCH /me`
- Query params: none
- Request body:
```json
{
  "settings": {
    "theme": "dark"
  }
}
```
- Required fields:
  - `settings: object`

## 5) Polling Pattern (FE)

Untuk flow AI:

1. Call trigger (`/ai-audit`, `/ai-codegen`, dll) → dapat `audit_id`.
2. Poll `GET /audits/:audit_id` tiap 2-3 detik.
3. Stop saat `status` adalah `succeeded` atau `failed`.

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
    "source": {
      "code": "pragma solidity ^0.8.0; contract A {}",
      "metadata": {}
    },
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
    "source": {
      "code": "pragma solidity ^0.8.0; contract A { uint x; }",
      "metadata": {}
    },
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
    "source": {
      "code": "pragma solidity ^0.8.0; contract Target {}",
      "metadata": {}
    },
    "language": "solidity",
    "expired_at": "2026-12-31T23:59:59Z"
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
    "source": {
      "code": "pragma solidity ^0.8.0; contract Target { uint x; }",
      "metadata": {}
    },
    "compile_status": "compiled",
    "compiler_version": "0.8.24",
    "expired_at": "2027-01-31T23:59:59Z"
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
    "contract_id": "'"${CONTRACT_UUID}"'",
    "prompt": "buat ERC20 sederhana"
  }'
```

#### POST /ai-audit
```bash
curl -X POST "${BASE_URL}/ai-audit" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
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
    "description": "state update after external call"
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
    "description": "missing onlyOwner on setter"
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

### 7.8 Me / Settings

#### GET /me
```bash
curl -X GET "${BASE_URL}/me" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}"
```

#### PATCH /me
```bash
curl -X PATCH "${BASE_URL}/me" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "X-Wallet-Address: ${X_WALLET_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "theme": "dark"
    }
  }'
```
