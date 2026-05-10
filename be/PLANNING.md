# ZeroVuln Backend — API Planning (Supabase)

Smart Contract AI Copilot. BE pakai **Supabase** (Postgres + Auth + Storage + Edge Functions). Tujuan dokumen ini: roadmap implementasi API yang nyalain semua flow di `UI-Mockup-Full.html` (scope: codegen, audit, auto-fix, gas-opt — **tanpa deploy on-chain, tanpa chat, tanpa tabel optimizations, tanpa version history**) + **Hacker Annotation Pipeline** (kontributor manusia nge-annotate smart contract, admin approve, jadi dataset training AI).

---

## 1. Stack & Justifikasi

| Layer | Pilihan | Catatan |
|---|---|---|
| Database | Supabase Postgres | Metadata, indexing, query relasional |
| Auth | **Header-based wallet** | FE kirim `X-Wallet-Address: 0x...` di setiap request. **Tidak ada signature verification, tidak ada SIWE, tidak ada JWT** untuk MVP/hackathon. |
| Live update | **FE polling** | Tidak pakai websocket / Supabase Realtime. FE re-hit endpoint GET berulang (interval 2–3 detik) sampai `audits.status='succeeded'`/`'failed'`. |
| Orkestrator | Supabase Edge Functions (Deno) | Stateless glue. Proxy ke 0G Compute & 0G Storage |
| **AI Compute** | **0G Compute Network** | Semua inference (codegen, audit, auto-fix, gas-opt) jalan di sini. Job-based, asynchronous |
| **Storage artifact** | **0G Storage** | Source code snapshot, reasoning trace, AI output. Hash anchor opsional di 0G chain |

**Pembagian tugas**:
- **Supabase** = "control plane" (auth, metadata, query). Tidak menyimpan content besar — cuma URI pointer.
- **0G Compute** = "AI brain". Edge Function dispatch job ke 0G, simpan `compute_job_id` di Supabase, poll/subscribe sampai selesai.
- **0G Storage** = "content layer". Setiap output AI (reasoning trace, generated code, audit JSON, gas-opt diff) di-upload ke 0G → Supabase cuma simpan `storage_uri` (`0g://...`) + `content_hash`.

**Kenapa Supabase + 0G**: 0G handle compute & storage on-chain verifiable (sesuai branding "verified on 0G"). Supabase handle yang bukan core selling point: relasional query — yang lambat/mahal kalau dipaksa via on-chain.

### 1.2 Auth model (header-based)

Satu-satunya validasi auth: **ada/tidaknya** header `X-Wallet-Address` di request.

```
X-Wallet-Address: 0x<lowercase hex>
```

Aturan:
- **Endpoint protected**: middleware cek header. Kalau ada (format valid) → boleh akses. Kalau kosong/invalid → `401 missing wallet`. Tidak ada signature verification, tidak ada SIWE, tidak ada JWT.
- **Endpoint public** (kalau ada): tidak cek header sama sekali.
- Setelah header lolos, server upsert `users` (auto-insert row baru kalau wallet belum pernah masuk DB) lalu set `request.user_id` untuk filter `owner_id` di query downstream.
- Admin endpoint (review/approve/reject) tambahin satu cek lagi: `users.is_admin = true`. Endpoint protected lainnya **tidak** cek role.

**Catatan**: model ini **trust client** — FE bisa ngirim wallet address apapun dan back-end percaya. OK untuk hackathon/demo, **tidak boleh dipakai produksi** (tidak ada bukti kepemilikan wallet).

PostgREST RLS tidak dipakai karena tidak ada `auth.uid()` Supabase-native. Semua endpoint melalui Edge Function (atau server-side proxy) yang melakukan filter `WHERE owner_id = <user_id>` manual pakai service role key.

### 1.1 Environment (testnet-first)

Hackathon scope: **0G Galileo Testnet (chain id 16602)** — dipakai untuk Compute & Storage saja (tanpa deploy contract user).

| Var | Value (testnet) |
|---|---|
| `OG_CHAIN_ID` | `16602` |
| `OG_RPC_URL` | `https://evmrpc-testnet.0g.ai` |
| `OG_STORAGE_INDEXER` | `https://indexer-storage-testnet-turbo.0g.ai` |
| `OG_COMPUTE_BROKER` | endpoint testnet broker (sesuai SDK 0g-serving-broker) |
| `OG_FAUCET` | `https://faucet.0g.ai` (untuk top-up hot wallet server) |

---

## 2. Mapping UI ↔ API

| Screen | Endpoint utama |
|---|---|
| 00 Landing | — |
| 01 Empty / 02 Dashboard | `GET /workspaces` |
| 03 Code-gen | `POST /workspaces`, `POST /ai/codegen` |
| 04 Workspace | `GET /workspaces/:id`, `GET /workspaces/:id/files`, `PATCH /files/:id`, `POST /ai/audit`, `POST /ai/auto-fix` |
| 05 Gas-opt | `POST /ai/gas-opt` (hasil = audit baru kind=gas-opt + findings dengan diff di `remediation`) |

| 08 Audit detail | `GET /audits/:id`, `GET /findings/:id` |
| 09 Settings | `GET/PATCH /me/settings` |
| 10 Errors | error handling cross-cutting |
| Modal wallet | (FE only — connect wallet di client, simpan address di state, kirim sebagai header `X-Wallet-Address` ke semua request) |
| Hacker Inbox (queue) | `GET /annotations` (server filter `hacker_id` dari header) |
| Hacker Editor | `POST /annotations`, `PATCH /annotations/:id`, `POST /annotations/:id/submit` |
| Admin Review Queue | `GET /admin/annotations?status=eq.submitted` |
| Admin Decision | `POST /admin/annotations/:id/approve`, `POST /admin/annotations/:id/reject` |
| Dataset Export | `GET /admin/dataset/export` |

> Screen 06 (Deploy progress), Screen 07 (Public trail), dan chat panel di Screen 04 di luar scope rilis ini.

---

## 3. Data Model (Supabase tables)

Semua tabel pakai `id uuid pk`, `created_at`, `updated_at`. RLS aktif.

### `users`
- `wallet_address text unique`
- `is_admin bool default false` — admin punya akses review queue & approve/reject. Bootstrap dari env `ADMIN_WALLETS` saat user pertama kali muncul. **Tidak ada role hacker/user** — siapapun (yang bukan admin) boleh akses fitur annotation maupun fitur user biasa. 1 wallet bisa pakai dua mode (hacker / user) tanpa switch role di backend.

### `workspaces`
- `owner_id fk users`
- `name text`, `slug text`
- `status enum('draft','audited')`
- `agent_id text`, `storage_uri text` (0G storage pointer)
- `gas_estimate bigint`, `compile_status text`, `compiler_version text`

### `files`
- `workspace_id fk`
- `path text` ("contract.sol", "test.sol", "README.md")
- `og_storage_uri text` — `0g://contracts/<workspace_id>/<path>`
- `content_hash text` — keccak256 untuk integrity check
- `content_inline text nullable` — cache kecil (≤ 8KB) untuk render cepat tanpa fetch 0G
- `language text`, `size_bytes int`

### `audits`
- `workspace_id fk`
- `kind enum('audit','re-audit','gas-opt','codegen','auto-fix')`
- `status enum('pending','running','succeeded','failed')`
- `agent_id text`, `model text`, `prompt_template text`
- `og_compute_job_id text` — 0G Compute job id (untuk poll status & retrieve result)
- `og_compute_provider text` — node/provider yang execute job di 0G network
- `reasoning_uri text` — `0g://reasoning/<audit_id>/trace.json`
- `reasoning_hash text` — keccak256 dari reasoning artifact (untuk verify)
- `findings_uri text` — `0g://findings/<audit_id>/findings.json`
- `anchor_tx_hash text nullable` — opsional, anchor `reasoning_hash` di 0G testnet
- `confidence numeric`
- `summary text`
- `started_at`, `completed_at`

### `findings`
- `audit_id fk`
- `severity enum('critical','high','medium','low','info')`
- `title text` ("reentrancy", "missing access control", atau label gas-opt seperti "storage packing")
- `file_path text`, `line_start int`, `line_end int`, `function_name text`
- `description text`
- `confidence numeric`
- `gas_saved bigint nullable` — diisi kalau finding berasal dari `audits.kind='gas-opt'`
- `status enum('open','fixed','dismissed','accepted')`
- `reasoning_trace jsonb` — inline steps untuk render cepat di Screen 08
- `reasoning_uri text` — full trace di `0g://reasoning/<audit_id>/<finding_id>.json`
- `reasoning_hash text` — keccak anchor
- `remediation jsonb` (`{before, after, explanation}`) — juga dipakai sebagai diff untuk gas-opt

### `annotations` (hacker-contributed labels untuk dataset training)

Satu row = satu kontribusi annotation oleh hacker terhadap satu smart contract. Hacker isi 4 field utama: **smart contract code**, **category**, **severity**, **root cause analysis** (long text). Lifecycle: `draft` → `submitted` → `approved` / `rejected`. Hanya yang `approved` masuk dataset.

**Storage strategy**: saat `draft`/`submitted`, semua konten (code + root_cause) disimpan di Postgres saja (`code` & `root_cause` columns). Upload ke 0G Storage **baru terjadi saat admin approve** — sekaligus generate dataset row.

- `hacker_id fk users` — kontributor (any user; tidak ada role check)
- `reviewer_id fk users nullable` — admin yang approve/reject
- `status enum('draft','submitted','approved','rejected')`
- `category text` — kategori vulnerability (e.g. `reentrancy`, `access-control`, `arithmetic-overflow`, `tx-origin`, `oracle-manipulation`, `gas-griefing`, `none`)
- `severity enum('critical','high','medium','low','info')`
- `code text` — smart contract source (disimpan inline di Postgres selama review)
- `root_cause text` — long-text root cause analysis tulisan hacker
- `code_uri text nullable` — `0g://annotations/<annotation_id>/source.sol` (terisi setelah approve)
- `code_hash text nullable` — keccak256 source (terisi setelah approve)
- `analysis_uri text nullable` — `0g://annotations/<annotation_id>/analysis.md` (terisi setelah approve)
- `analysis_hash text nullable` — keccak256 root_cause (terisi setelah approve)
- `review_notes text nullable` — catatan admin (alasan reject / komentar approval)
- `dataset_uri text nullable` — `0g://dataset/<annotation_id>.jsonl` (terisi setelah approve)
- `dataset_hash text nullable`
- `submitted_at`, `decided_at`

### `dataset_snapshots` (versi kumulatif export untuk training)

- `version text` ("v0.1", "v0.2", …)
- `manifest_uri text` — `0g://dataset/snapshots/<version>/manifest.json` (list semua `annotation_id` + `dataset_uri` + `hash`)
- `manifest_hash text`
- `bundle_uri text` — `0g://dataset/snapshots/<version>/dataset.jsonl` (gabungan semua approved annotations)
- `bundle_hash text`
- `annotation_count int`
- `created_by fk users` (admin)
- `notes text`

---

## 4. Authorization (server-side filter, no RLS)

Karena auth lewat header tanpa signature, **PostgREST tidak di-expose ke publik**. Semua akses lewat Edge Function pakai service role key, dan filter di-apply manual di server berdasarkan `users.id` yang di-resolve dari `X-Wallet-Address`.

Aturan akses:

- `workspaces` / `files` / `audits` / `findings`: filter `owner_id = <user_id>` di setiap query.
- `annotations`:
  - Caller (any user) — SELECT/INSERT/UPDATE rownya sendiri (`hacker_id = <user_id>`) **selama `status` ∈ {`draft`,`submitted`}**. Tidak boleh edit setelah `approved`/`rejected`. Tidak ada role-check — siapapun yang punya wallet boleh nge-annotate.
  - Admin (`is_admin = true`) — SELECT semua, UPDATE field `status` / `reviewer_id` / `review_notes` / `decided_at`.
  - SELECT public (anonim) hanya untuk row `status='approved'` — opsional preview dataset.
- `dataset_snapshots`: SELECT public, INSERT/UPDATE hanya admin.

---

## 5. Endpoints (Edge Functions)

Semua endpoint via Edge Function. Tidak ada PostgREST publik. Tiap request **wajib** bawa header `X-Wallet-Address` (kecuali endpoint yang di-mark public). Middleware resolve user dari header sebelum handler jalan.

### Workspaces
- `GET /functions/v1/workspaces` — list workspace milik wallet.
- `POST /functions/v1/workspaces` body: `{name, slug?}` → buat workspace baru, owner = caller.
- `GET /functions/v1/workspaces/:id` — detail workspace + files + audits + findings (cek `owner_id`).
- `PATCH /functions/v1/workspaces/:id` body partial.

### Files
- `GET /functions/v1/workspaces/:id/files`
- `PATCH /functions/v1/files/:id` body: `{content}` → re-upload ke 0G Storage, refresh `content_hash` & `og_storage_uri`.

### AI Orchestration (Edge Functions — async pattern)

Pola umum: client `POST` → server bikin row `audits.status='pending'` + dispatch ke 0G Compute → return `audit_id` → **client polling** `GET /functions/v1/audits/:id` setiap 2–3 detik sampai `status='succeeded'`/`'failed'` (lalu fetch `findings` sekali). Sumber data UI inference overlay (Screen 04 audit / Screen 03 codegen / Screen 05 gas-opt).

Tambahan endpoint untuk polling:
- `GET /functions/v1/audits/:id` — return row `audits` + `findings` terbaru.
- `GET /functions/v1/audits?workspace_id=...&status=running` — opsional, list audit yang masih jalan.

- `POST /functions/v1/ai-codegen` body: `{workspace_id?, prompt}` → `{audit_id, workspace_id}`. Hasil: file `contract.sol` ter-generate.
- `POST /functions/v1/ai-audit` body: `{workspace_id}` → `{audit_id}`. Generate findings.
- `POST /functions/v1/ai-auto-fix` body: `{finding_id}` → `{audit_id}` (kind=auto-fix). Patch langsung ditimpa ke file workspace, finding lama ditandai `status='fixed'`.
- `POST /functions/v1/ai-gas-opt` body: `{workspace_id}` → `{audit_id}` (kind=gas-opt). Hasil per item disimpan sebagai `findings` dengan `gas_saved` + `remediation` (diff before/after).

### Settings (Me)
- `GET /functions/v1/me` → row user berdasarkan header.
- `PATCH /functions/v1/me` body: `{settings?, agent_id?}`.

### Hacker Annotations

Bisa diakses oleh user manapun (tidak ada role gating) — 1 wallet boleh pakai fitur ini sambil tetap pakai fitur user biasa.

- `GET /functions/v1/annotations` — daftar annotation milik caller (semua status).
- `POST /functions/v1/annotations` body: `{code, category, severity, root_cause}` → INSERT row `status='draft'`. **Tidak upload ke 0G** — semua disimpan inline di Postgres (`code`, `root_cause` columns).
- `PATCH /functions/v1/annotations/:id` body partial: `{code?, category?, severity?, root_cause?}` → update kolom langsung. Hanya saat `status ∈ {draft,submitted}`.
- `POST /functions/v1/annotations/:id/submit` → set `status='submitted'`, `submitted_at=now()`, freeze field utama. Validasi: keempat field (code, category, severity, root_cause) wajib non-empty.

### Admin Review

Hanya `users.is_admin = true`.

- `GET /functions/v1/admin-annotations?status=submitted` — review queue.
- `POST /functions/v1/admin-annotation-approve` body: `{annotation_id, review_notes?}`:
  1. Read `code` & `root_cause` dari Postgres.
  2. Upload `code` → `0g://annotations/<id>/source.sol`, set `code_uri/code_hash`.
  3. Upload `root_cause` → `0g://annotations/<id>/analysis.md`, set `analysis_uri/analysis_hash`.
  4. Build dataset row format SFT:
     ```json
     {"messages":[
       {"role":"system","content":"You are a smart-contract security auditor. Identify the vulnerability category, severity, and explain the root cause."},
       {"role":"user","content":"<code>"},
       {"role":"assistant","content":"Category: <category>\nSeverity: <severity>\n\nRoot cause:\n<root_cause>"}
     ]}
     ```
  5. Upload ke `0g://dataset/<annotation_id>.jsonl`, simpan `dataset_uri/dataset_hash`.
  6. UPDATE `status='approved'`, `reviewer_id`, `decided_at`, `review_notes`.
- `POST /functions/v1/admin-annotation-reject` body: `{annotation_id, review_notes}` → `status='rejected'`, `decided_at`, `review_notes`. Tidak upload ke 0G, tidak generate dataset row.
- `POST /functions/v1/admin-dataset-snapshot` body: `{version, notes?}` — bundle semua `approved` annotations jadi satu JSONL, upload ke 0G, buat row `dataset_snapshots`.
- `GET /functions/v1/admin-dataset-export?version=<v>` — return signed URL ke `bundle_uri` di 0G untuk di-download oleh training pipeline.

---

## 6. Edge Function: AI Job Orchestration via 0G Compute

Pola yang dipakai semua endpoint AI (codegen, audit, auto-fix, gas-opt). Edge Function = orchestrator stateless; semua heavy work jalan di 0G.

### 6.1 Sequence

```
[Client] ──POST──▶ [Edge Function]
                       │ 1. resolve user dari X-Wallet-Address header, cek owner_id
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
                                                          └─ poll GET /audits/:id
                                                             setiap 2–3s hingga
                                                             status='succeeded' / 'failed'

[pg_cron 5s] ──▶ [poller Edge Function]
                       │ for each audits.status='running':
                       │   result = ogCompute.getJob(og_compute_job_id)
                       │   if result.status == 'completed':
                       │     a. parse output JSON
                       │     b. compile check (kalau kind=codegen/auto-fix) via solc-wasm
                       │     c. upload reasoning trace → 0G Storage
                       │          uri = 0g://reasoning/<audit_id>/trace.json
                       │          hash = keccak256(content)
                       │     d. upload findings (termasuk gas-opt items) → 0G Storage
                       │     e. (opsional) anchor hash on-chain:
                       │          anchorContract.anchor(audit_id, hash, uri)
                       │          → save anchor_tx_hash
                       │     f. INSERT findings rows (with uri+hash; gas_saved diisi untuk kind=gas-opt)
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

## 7. Live Update — FE Polling

Tidak pakai websocket / Supabase Realtime. FE melakukan polling HTTP biasa:

| Event | Polling endpoint | Interval | Stop condition |
|---|---|---|---|
| Audit/codegen/gas-opt/auto-fix progress | `GET /functions/v1/audits/:id` | 2–3 detik | `status` ∈ {`succeeded`,`failed`} |
| Findings streaming | (gabung di response `GET /audits/:id`) | sama | sama |
| Annotation review queue (admin) | `GET /functions/v1/admin-annotations?status=submitted` | manual refresh atau 10 detik | — |

Catatan FE:
- Pakai exponential backoff sederhana kalau response lama (mis. 2s → 3s → 5s, cap 5s).
- Saat user pindah tab / unmount component → hentikan polling.
- Backend tidak perlu push apapun; semua state-of-truth di Postgres, FE tinggal re-fetch.

---

## 8. Storage Layout — 0G Storage as primary

Semua artifact konten by default di **0G Storage** supaya match narasi "verified on 0G" + reasoning hash bisa di-verify (opsional anchor on-chain).

| Namespace | Isi | Akses |
|---|---|---|
| `0g://contracts/<workspace_id>/<path>` | Source file workspace (latest state) | private (encrypted, key di Supabase Vault) |
| `0g://reasoning/<audit_id>/trace.json` | Reasoning trace AI (steps untuk Screen 08) | public-read, hash di-anchor on-chain (opsional) |
| `0g://findings/<audit_id>/findings.json` | Full findings + remediation diff (termasuk gas-opt diff) | public-read, anchored (opsional) |
| `0g://annotations/<annotation_id>/source.sol` | Smart contract yang di-annotate (upload **hanya saat approved**) | public-read |
| `0g://annotations/<annotation_id>/analysis.md` | Root cause analysis (long text) — upload **hanya saat approved** | public-read |
| `0g://dataset/<annotation_id>.jsonl` | Single-row training sample (format SFT) | private, akses lewat admin signed URL |
| `0g://dataset/snapshots/<version>/dataset.jsonl` | Bundle dataset cumulative (semua approved) | private, akses lewat admin signed URL |
| `0g://dataset/snapshots/<version>/manifest.json` | Manifest list annotation_id + hash | private |

**Postgres** simpan: `og_storage_uri`, `content_hash`, dan optional `content_inline` cache (≤8KB) — bukan content besar.

**Supabase Storage** opsional sebagai fallback cache kalau 0G gateway lambat saat demo (asset non-critical: avatar, og-image share).

### 8.1 Hacker Annotation Pipeline (dataset training)

End-to-end flow:

```
[Hacker] ─POST /annotations────▶ [Edge Function]
   {code, category,                │ INSERT annotations(status='draft',
    severity, root_cause}          │   code, root_cause, category, severity)
                                   │ (no 0G upload yet — Postgres only)
                                   ▼
[Hacker] ─PATCH /annotations/:id─▶ iterate; UPDATE Postgres columns langsung
[Hacker] ─POST /annotations/:id/submit─▶ status='submitted', notify admin

[Admin] ──GET /admin-annotations?status=submitted──▶ review queue (read code + root_cause dari Postgres)
[Admin] ──POST /admin-annotation-approve──┐
                                          │ 1. read code + root_cause dari Postgres
                                          │ 2. upload code → 0g://annotations/<id>/source.sol
                                          │ 3. upload root_cause → 0g://annotations/<id>/analysis.md
                                          │ 4. build SFT row:
                                          │    {messages:[
                                          │      {role:"system","content":"You are a smart-contract security auditor..."},
                                          │      {role:"user","content":<code>},
                                          │      {role:"assistant","content":"Category: <category>\nSeverity: <severity>\n\nRoot cause:\n<root_cause>"}
                                          │    ]}
                                          │ 5. upload → 0g://dataset/<id>.jsonl
                                          │ 6. UPDATE status='approved', code_uri/hash, analysis_uri/hash,
                                          │      dataset_uri/hash, reviewer_id, decided_at
                                          ▼
                                     dataset row ready

[Admin] ──POST /admin-annotation-reject──┐
                                         │ UPDATE status='rejected', review_notes (no 0G upload)
                                         ▼
                                      reviewer flow done

[Admin] ──POST /admin-dataset-snapshot {version}──▶
            bundle semua approved → 0g://dataset/snapshots/<v>/dataset.jsonl
            INSERT dataset_snapshots row
[Admin] ──GET /admin-dataset-export?version=v───▶ signed URL untuk training pipeline (lihat ai/load_lora.py)
```

**Catatan integrity**:
- Saat approve, server **wajib** re-fetch dari 0G dan recompute keccak256 → match dengan `code_hash`/`annotation_hash` yang tersimpan di Postgres. Kalau tidak cocok → reject otomatis ("storage tampered").
- Setelah `approved`, row tidak boleh di-edit (RLS deny UPDATE selain admin yang bisa tambah `notes`). Audit trail lewat `decided_at`/`reviewer_id`.
- Dataset snapshots immutable per `version`; revision = bikin version baru.

**Role**:
- Hanya ada flag `is_admin`. Tidak ada role hacker/user terpisah — siapapun (yang bukan admin) bisa pakai fitur annotation.
- Admin di-bootstrap via env `ADMIN_WALLETS` di Edge Function — saat user pertama kali muncul (auto-insert dari header), kalau wallet match list → set `is_admin=true`.

### 8.2 Hash anchor flow (opsional)

1. Edge Function upload artifact ke 0G Storage → dapat `og_storage_uri` + `content_hash` (keccak256).
2. (Opsional) Submit tx ke contract anchor di 0G testnet (Galileo):
   ```solidity
   function anchor(bytes32 audit_id, bytes32 content_hash, string uri)
   ```
3. Simpan `anchor_tx_hash` di row `audits` / `findings` / `annotations` / `dataset_snapshots`.
4. Tombol "verify reasoning hash" di FE: re-fetch dari 0G Storage, recompute keccak, compare ke `content_hash` (di DB atau on-chain). Verdict ✓ / ✗.

---

## 9. Roadmap Implementasi (urutan pengerjaan)

### Phase 1 — Foundation (hari 1)
1. Init Supabase project + migration awal: `users`, `workspaces`, `files`.
2. Edge Function middleware `resolveUser(req)` — baca `X-Wallet-Address`, upsert `users`, return `{user_id, role}`.
3. Bootstrap admin via env `ADMIN_WALLETS`.

### Phase 2 — Workspace CRUD (hari 1–2)
5. Test PostgREST endpoints workspaces + files.
6. DB trigger on `files` UPDATE: re-upload ke 0G Storage, recompute `content_hash`, refresh `og_storage_uri`.
7. Edge Function `ai-codegen` (mock dulu pakai static response → swap ke 0G).

### Phase 3 — AI Audit Pipeline (hari 2–3)
8. Tabel `audits`, `findings`. RLS.
9. `ai-audit` Edge Function + integrasi 0G Compute.
10. `ai-auto-fix`, `ai-gas-opt` (reuse orchestration template).
11. `GET /audits/:id` endpoint untuk polling FE; verifikasi response include findings terbaru.

### Phase 4 — Hacker Annotation Pipeline (hari 3–4)
12. Tabel `annotations`, `dataset_snapshots`. Server-side filter dengan role gating (`hacker`/`admin`).
13. Edge Functions: `annotations` CRUD, `annotations/:id/submit`, `admin-annotation-approve`, `admin-annotation-reject`.
14. Hash re-verify saat approve (fetch 0G, keccak compare, reject if mismatch).
15. `admin-dataset-snapshot` + `admin-dataset-export` (signed URL).

### Phase 5 — Settings & Polish (hari 4–5)
17. Settings PATCH endpoint + validation.
18. Error mapping ke Screen 10 (timeout 60s, wallet rejected, network mismatch, invalid AI output).
19. Rate limit Edge Functions (1 inference/15s/user, 5 annotation submit/hari/hacker).
20. Logging + audit trail untuk debugging hackathon demo.

---

## 10. Open Questions / Risk

- **0G Compute long-poll vs webhook**: kalau 0G belum support webhook, Edge Function harus polling — pakai Supabase Cron / pg_cron tiap 5s untuk check `audits.status='running'`.
- **On-chain anchor**: opsional di MVP. Kalau dipakai, butuh hot wallet server-side untuk sign anchor tx → simpan key di Supabase Vault.
- **Header-based auth = trust client**: tidak ada signature verification. OK untuk hackathon, harus diganti ke SIWE/JWT sebelum produksi. Rate-limit per `X-Wallet-Address` jadi advisory, bukan security boundary.

---

## 11. Definisi Selesai (DoD per endpoint)

Setiap endpoint dianggap selesai kalau:
- Schema migrasi committed.
- Authorization check (header → user_id → owner/role filter) ada test (positive + negative case: header missing, wrong wallet, wrong role).
- Happy path manual test sukses dari Postman/curl dengan `X-Wallet-Address` header.
- Error cases yang relevan ke Screen 10 sudah return shape error standar: `{error: {code, message, detail}}`.
- Polling endpoint (kalau applicable) return state terbaru dengan satu request, FE bisa drive UI tanpa websocket.
