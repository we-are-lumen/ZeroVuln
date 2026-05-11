# ZeroVuln Backend — API Planning (Supabase)

Smart Contract AI Copilot. BE pakai **Supabase** (Postgres + Auth + Storage + Edge Functions). Tujuan dokumen ini: roadmap implementasi API yang nyalain semua flow di `UI-Mockup-Full.html` (scope: codegen, audit, auto-fix, gas-opt — **tanpa deploy on-chain, tanpa chat, tanpa tabel optimizations, tanpa version history**) + **kontributor training** (auditor manusia; admin approve → dataset). Temuan AI vs auditor **dipisah**: tabel **`ai_findings`** dan **`auditor_findings`**.

**Model data disederhanakan (tanpa workspace / tanpa tabel `files`)**: tiap **smart contract** = **satu row** di tabel **`contracts`**. Ada dua jenis: (**1**) kontrak **copilot milik user** (`is_catalog=false`, owner = wallet yang upload/generate) dipakai codegen/audit/gas-opt; (**2**) kontrak **katalog admin** (`is_catalog=true`) dipublish admin sebagai bahan latihan/training — **POV kontributor / “hacker” cuma melihat list katalog ini**, bukan kontrak yang dibuat user lain.

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
- **0G Storage** = "content layer". Output AI: reasoning **per `ai_findings`**, remediation, snapshot kode — di-upload ke 0G → Postgres simpan pointer/hash (`0g://...`, kolom di `ai_findings` / `auditor_findings` / `contracts`).

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
| 01 Empty / 02 Dashboard | `GET /contracts` |
| 03 Code-gen | `POST /contracts` (smart contract baru), `POST /ai/codegen` dengan `contract_id` |
| 04 Editor | `GET /contracts/:id`, `PATCH /contracts/:id` (update source), `POST /ai/audit`, `POST /ai/auto-fix` |
| 05 Gas-opt | `POST /ai/gas-opt` dengan `contract_id` (hasil = audit baru + **`ai_findings`** dengan diff di `remediation`) |

| 08 Audit detail | `GET /audits/:id` (include `ai_findings`), `GET /ai-findings/:id` |
| 09 Settings | `GET/PATCH /me/settings` |
| 10 Errors | error handling cross-cutting |
| Modal wallet | (FE only — connect wallet di client, simpan address di state, kirim sebagai header `X-Wallet-Address` ke semua request) |
| Hacker — browse target | `GET /contracts/catalog` (hanya **`is_catalog=true`**, bukan kontrak user) |
| Hacker Inbox (queue) | `GET /auditor-findings` (filter `contributor_id` dari header) |
| Hacker Editor | `POST /auditor-findings`, `PATCH /auditor-findings/:id`, `POST /auditor-findings/:id/submit` (`contract_id` harus katalog admin) |
| Admin — katalog untuk kontributor | `POST/PATCH /admin/contracts/catalog`, optional `GET` mirror |
| Admin Review Queue | `GET /admin/auditor-findings?review_status=submitted` |
| Admin Decision | `POST /admin/auditor-findings/:id/approve`, `POST /admin/auditor-findings/:id/reject` |
| Dataset Export | `GET /admin/dataset/export` |

> Screen 06 (Deploy progress), Screen 07 (Public trail), dan chat panel di Screen 04 di luar scope rilis ini.

---

## 3. Data Model (Supabase tables)

Semua tabel pakai `id uuid pk`, `created_at`, `updated_at`. RLS aktif.

### `users`
- `wallet_address text unique`
- `is_admin bool default false` — admin punya akses review queue & approve/reject. Bootstrap dari env `ADMIN_WALLETS` saat user pertama kali muncul. **Tidak ada role hacker/user** — siapapun (yang bukan admin) boleh mengisi **`auditor_findings`** maupun fitur copilot biasa. 1 wallet bisa dua jalur tanpa switch role di backend.

### `contracts`
Satu row = **satu smart contract**, **satu file** source — tidak ada nested `files`.

- `is_catalog boolean default false` — **`false`**: kontrak **copilot** milik user (`owner_id` = pembuat); **`true`**: **katalog admin** (bahan untuk kontributor; dibuat/diubah lewat endpoint admin; **tidak** boleh dipakai sebagai target codegen/audit user biasa di MVP ini).
- `owner_id fk users` — untuk `is_catalog=true` biasanya admin yang menjaga row; untuk user contract = pemilik wallet.
- `name text nullable` — label opsional di UI (default bisa tanggal / "Untitled")
- `status enum('draft','audited')`
- `storage_uri text` (0G aggregate pointer kalau dipakai)
- `gas_estimate bigint`, `compile_status text`, `compiler_version text`
- **Source tunggal** (setara `contract.sol`):
  - `og_storage_uri text` — `0g://sources/<contract_id>/contract.sol`
  - `content_hash text` — keccak256 untuk integrity check
  - `content_inline text nullable` — cache kecil (≤ 8KB) untuk render cepat tanpa fetch 0G
  - `language text` default `solidity`, `size_bytes int`

### `audits`
- `contract_id fk`
- `status enum('pending','running','succeeded','failed')`
- `model text`, `prompt_template text` — nilai yang dipakai job itu (untuk jejak audit); pemilihan model **bukan** dari preferensi user — tetap dari konfigurasi server (env / konstanta Edge Function).
- `og_compute_job_id text` — 0G Compute job id (untuk poll status & retrieve result)
- `og_compute_provider text` — node/provider yang execute job di 0G network
- `summary text nullable` — ringkasan agregat job (opsional; **bukan** reasoning/detail per temuan)
- `started_at`, `completed_at`

### `ai_findings` (output inferensi — audit / gas-opt / auto-fix)

Satu row = satu temuan dari model AI untuk satu **`audit_id`**.

- `audit_id fk audits` — **wajib**
- `severity enum('critical','high','medium','low','info')`
- `title text` — judul temuan ("reentrancy", …)
- `description text` — narasi AI
- `file_path text`, `line_start int`, `line_end int`, `function_name text`
- `confidence numeric`
- `gas_saved bigint nullable` — jika dari alur **`POST /ai-gas-opt`**
- `status enum('open','fixed','dismissed','accepted')` — lifecycle remediation
- **Reasoning (tidak di `audits`)**: `reasoning_trace jsonb`, `reasoning_uri text` — `0g://reasoning/<ai_finding_id>/trace.json`, `reasoning_hash text`
- `anchor_tx_hash text nullable` — opsional anchor **`reasoning_hash`** on-chain
- `remediation jsonb` (`{before, after, explanation}`) — termasuk diff gas-opt

### `auditor_findings` (input auditor manusia untuk dataset)

Satu row = satu kontribusi auditor terhadap **kontrak katalog admin**. Tidak ada FK ke `audits`.

- `contributor_id fk users`
- `contract_id fk contracts` — **wajib**, **`is_catalog=true`**
- `severity enum('critical','high','medium','low','info')`
- `title text` — label / kategori vuln (mis. `access-control`, `none`)
- `description text` — root cause panjang
- `review_status enum('draft','submitted','approved','rejected')`
- `submitted_at`, `decided_at`
- Setelah admin approve — artifact dataset:
  - `code_uri text nullable` — `0g://contributions/<auditor_finding_id>/source.sol`
  - `code_hash text nullable`
  - `analysis_uri text nullable` — `0g://contributions/<auditor_finding_id>/analysis.md`
  - `analysis_hash text nullable`
  - `dataset_uri text nullable` — `0g://dataset/auditor-findings/<auditor_finding_id>.jsonl`
  - `dataset_hash text nullable`

**Storage strategy auditor**: `draft`/`submitted` → Postgres (`description`, dll.); source Solidity dari row **`contracts`** katalog. Upload 0G + baris dataset **saat approve**.

### `dataset_snapshots` (versi kumulatif export untuk training)

- `version text` ("v0.1", "v0.2", …)
- `manifest_uri text` — `0g://dataset/snapshots/<version>/manifest.json` (list `auditor_finding_id` berstatus `approved` + `dataset_uri` + `hash`)
- `manifest_hash text`
- `bundle_uri text` — `0g://dataset/snapshots/<version>/dataset.jsonl` (gabungan semua **`auditor_findings`** approved)
- `bundle_hash text`
- `auditor_finding_count int` — jumlah row **`auditor_findings`** `approved` yang masuk snapshot
- `created_by fk users` (admin)
- `notes text`

---

## 4. Authorization (server-side filter, no RLS)

Karena auth lewat header tanpa signature, **PostgREST tidak di-expose ke publik**. Semua akses lewat Edge Function pakai service role key, dan filter di-apply manual di server berdasarkan `users.id` yang di-resolve dari `X-Wallet-Address`.

Aturan akses:

- `contracts`:
  - **Dashboard copilot**: `GET .../contracts` → `owner_id = <user_id>` **dan** `is_catalog = false`.
  - **Katalog kontributor**: `GET .../contracts/catalog` → semua authenticated user boleh baca `is_catalog = true` (read-only). Kontrak user lain **tidak** muncul di sini.
  - **Penulisan katalog**: hanya admin (`POST/PATCH .../admin/contracts/catalog`).
- `audits`: hanya jika `contracts.owner_id = <user_id>` **dan** `contracts.is_catalog = false` (via `contract_id`).
- `ai_findings`: hanya jika parent **`audits`** mengarah ke kontrak milik caller (`contracts.owner_id = <user_id>`).
- `auditor_findings`:
  - Caller biasa — SELECT/INSERT/UPDATE rownya sendiri (`contributor_id = <user_id>`) **selama `review_status` ∈ {`draft`,`submitted`}**. **`contract_id` → `is_catalog=true`** (cek setiap write). Tidak boleh edit setelah `approved`/`rejected`.
  - **Admin**: SELECT semua untuk queue; UPDATE `review_status` / `decided_at` / URI hash dataset.
  - SELECT publik (anonim) opsional: hanya `review_status='approved'` — preview dataset.
- `dataset_snapshots`: SELECT public, INSERT/UPDATE hanya admin.

---

## 5. Endpoints (Edge Functions)

Semua endpoint via Edge Function. Tidak ada PostgREST publik. Tiap request **wajib** bawa header `X-Wallet-Address` (kecuali endpoint yang di-mark public). Middleware resolve user dari header sebelum handler jalan.

### Smart contracts (copilot — milik user)
- `GET /functions/v1/contracts` — list **`is_catalog=false`** dan **`owner_id`** = caller (dashboard user).
- `POST /functions/v1/contracts` body: `{name?}` → **`is_catalog=false`**, owner = caller.
- `GET /functions/v1/contracts/:id` — detail + audits + **`ai_findings`** terkait audit itu; **tolak** jika bukan milik caller atau jika `is_catalog=true` (pakai endpoint katalog).
- `PATCH /functions/v1/contracts/:id` — sama syarat ownership + non-catalog; update source → re-upload 0G.

### Katalog admin (untuk POV kontributor / hacker)
- `GET /functions/v1/contracts/catalog` — list kontrak **`is_catalog=true`** saja (semua wallet authenticated). **Tidak** menyertakan kontrak upload user.
- `GET /functions/v1/contracts/catalog/:id` — baca detail + source (read-only) untuk UI kontributor.

### Admin — kelola katalog
- `POST /functions/v1/admin/contracts/catalog` body: `{name?, content}` → buat row **`is_catalog=true`** (`owner_id` = admin atau policy internal konsisten).
- `PATCH /functions/v1/admin/contracts/catalog/:id` — ubah nama/source katalog.

### AI Orchestration (Edge Functions — async pattern)

Pola umum: client `POST` → server bikin row `audits.status='pending'` + dispatch ke 0G Compute → return `audit_id` → **client polling** `GET /functions/v1/audits/:id` setiap 2–3 detik sampai `status='succeeded'`/`'failed'` (response menyertakan **`ai_findings`** terbaru). Sumber data UI inference overlay (Screen 04 audit / Screen 03 codegen / Screen 05 gas-opt).

Tambahan endpoint untuk polling:
- `GET /functions/v1/audits/:id` — return row `audits` + **`ai_findings`** terbaru untuk audit itu. **Jika `status='running'`**, handler **reconcile**: panggil 0G `getJob`, lalu upload artifact + update DB seperti §6.1 (satu request bisa menuntaskan job tanpa cron).
- `GET /functions/v1/ai-findings/:id` — detail satu **`ai_findings`** (cek akses lewat `audit_id` → `contracts.owner_id`).
- `GET /functions/v1/audits?contract_id=...&status=running` — opsional, list audit yang masih jalan untuk satu smart contract.

- `POST /functions/v1/ai-codegen` body: `{contract_id, prompt}` → `{audit_id}`. **`contract_id` harus `is_catalog=false` dan milik caller.** Menulis hasil ke source kontrak user itu.
- `POST /functions/v1/ai-audit` body: `{contract_id}` → `{audit_id}`. Syarat sama (**bukan** kontrak katalog).
- `POST /functions/v1/ai-auto-fix` body: `{ai_finding_id}` → `{audit_id}`. Harus merujuk **`ai_findings`** (bukan auditor). Patch source kontrak user; row **`ai_findings`** yang di-fix ditandai `status='fixed'`.
- `POST /functions/v1/ai-gas-opt` body: `{contract_id}` → `{audit_id}`. **`is_catalog=false`** + milik caller.

### Settings (Me)
- `GET /functions/v1/me` → row user berdasarkan header.
- `PATCH /functions/v1/me` body: `{settings?}`.

### Auditor findings (tabel `auditor_findings`)

Auditor memilih **kontrak katalog** (`GET /contracts/catalog`), lalu mengisi analisis — tidak menyentuh kontrak upload user lain.

- `GET /functions/v1/auditor-findings` — daftar row milik caller (semua `review_status`).
- `POST /functions/v1/auditor-findings` body: `{contract_id, title, severity, description}` — **`contract_id` → `is_catalog=true`**. INSERT `review_status='draft'`.
- `PATCH /functions/v1/auditor-findings/:id` — partial `{contract_id?, title?, severity?, description?}`; `contract_id` tetap harus katalog; hanya saat `review_status ∈ {draft,submitted}` dan pemilik row.
- `POST /functions/v1/auditor-findings/:id/submit` → `review_status='submitted'`, `submitted_at=now()`.

### Admin Review (`auditor_findings`)

Hanya `users.is_admin = true`.

- `GET /functions/v1/admin/auditor-findings?review_status=submitted` — antrian.
- `POST /functions/v1/admin/auditor-findings/:id/approve`:
  1. Load **`auditor_findings`** + **`contracts`** katalog; ambil source saat approve.
  2. Upload source → `0g://contributions/<auditor_finding_id>/source.sol`, set `code_uri` / `code_hash`.
  3. Upload `description` → `0g://contributions/<auditor_finding_id>/analysis.md`, set `analysis_uri` / `analysis_hash`.
  4. Build dataset row SFT, mis.:
     ```json
     {"messages":[
       {"role":"system","content":"You are a smart-contract security auditor. Identify the vulnerability category, severity, and explain the root cause."},
       {"role":"user","content":"<source_dari_kontrak_katalog>"},
       {"role":"assistant","content":"Category: <title>\nSeverity: <severity>\n\nRoot cause:\n<description>"}
     ]}
     ```
  5. Upload ke `0g://dataset/auditor-findings/<auditor_finding_id>.jsonl`, simpan `dataset_uri` / `dataset_hash`.
  6. UPDATE `review_status='approved'`, `decided_at=now()`.
- `POST /functions/v1/admin/auditor-findings/:id/reject` → `review_status='rejected'`, `decided_at=now()`. Tidak upload ke 0G.
- `POST /functions/v1/admin-dataset-snapshot` body: `{version, notes?}` — bundle semua **`auditor_findings`** `review_status='approved'` jadi satu JSONL, upload ke 0G, buat row `dataset_snapshots`.
- `GET /functions/v1/admin-dataset-export?version=<v>` — return signed URL ke `bundle_uri` di 0G untuk di-download oleh training pipeline.

---

## 6. Edge Function: AI Job Orchestration via 0G Compute

Pola yang dipakai semua endpoint AI (codegen, audit, auto-fix, gas-opt). Edge Function = orchestrator stateless; semua heavy work jalan di 0G.

### 6.1 Sequence

```
[Client] ──POST──▶ [Edge Function]
                       │ 1. resolve user dari X-Wallet-Address header, cek contracts.owner_id
                       │ 2. INSERT audits(status='pending', ...)
                       │ 3. fetch context: source smart contract dari 0G Storage (atau content_inline)
                       │ 4. build prompt: template + system + source Solidity + grounding
                       │ 5. dispatch ke 0G Compute:
                       │      ogCompute.submitJob({
                       │        model: '<dari konfigurasi server>',
                       │        prompt, max_tokens
                       │      }) → returns og_compute_job_id
                       │ 6. UPDATE audits SET og_compute_job_id, status='running'
                       └────── return {audit_id} ───▶ [Client]
                                                          │
                                                          └─ poll GET /audits/:id setiap 2–3s
                                                             hingga status='succeeded' / 'failed'

[Client] ──GET /audits/:id──▶ [Edge Function — reconcile on read]
                       │ Jika audit ini masih status='running':
                       │   result = ogCompute.getJob(og_compute_job_id)
                       │   if completed:
                       │     a. parse output JSON
                       │     b. compile check jika output mengubah source Solidity (codegen / auto-fix) via solc-wasm
                       │     c. INSERT ai_findings rows (confidence, reasoning_trace,
                       │        gas_saved jika gas-opt; remediation sesuai output)
                       │     d. per row: upload reasoning → 0g://reasoning/<ai_finding_id>/trace.json;
                       │        UPDATE reasoning_uri, reasoning_hash (dan anchor_tx_hash jika dipakai)
                       │     e. UPDATE audits status='succeeded'
                       │   if failed / timeout (>120s): UPDATE audits status='failed', error
                       │ Selalu return audit + ai_findings terbaru (setelah reconcile jika running)
```

**Tanpa `pg_cron` / poller terpisah.** Audit **hanya** dimulai dari request user (analyze / codegen / dll.). Setelah itu FE yang polling; **setiap** `GET /audits/:id` yang mengenai baris `running` bertanggung jawab **sekali** mengecek 0G dan mem-finalkan DB bila job sudah selesai — jadi tidak perlu background scheduler.

### 6.2 0G Compute integration detail

- **SDK**: pakai `@0glabs/0g-serving-broker` (TypeScript) atau direct REST kalau sudah expose. Wrapper di Edge Function: `lib/og-compute.ts`.
- **Model**: satu nilai untuk seluruh deployment — dari env Edge Function (mis. `AI_MODEL`, default `claude-3.7-sonnet`). Tidak ada switch agent/model di UI atau kolom `agent_id` di DB. 0G Compute jalan via decentralized provider network.
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
- **Download helper** (untuk verify reasoning **`ai_findings`**):
  ```ts
  async function ogFetch(uri): {content, hash}
  ```
- **Encryption**: konten private (source code) di-encrypt symmetric (AES-GCM), key disimpan di Supabase Vault **per smart contract** (`contract_id`). Artifact reasoning **`ai_findings`** dan dataset **`auditor_findings`** (path publik di §8) sesuai tabel storage.

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

Tidak pakai websocket / Supabase Realtime / **pg_cron**. FE melakukan polling HTTP biasa; **sinkronisasi hasil 0G ke Postgres terjadi di dalam handler `GET /audits/:id`** selama audit masih `running` (lihat §6.1).

| Event | Polling endpoint | Interval | Stop condition |
|---|---|---|---|
| Audit/codegen/gas-opt/auto-fix progress | `GET /functions/v1/audits/:id` | 2–3 detik | `status` ∈ {`succeeded`,`failed`} |
| `ai_findings` di UI audit | (gabung di response `GET /audits/:id`) | sama | sama |
| Antrian auditor (admin) | `GET /functions/v1/admin/auditor-findings?review_status=submitted` | manual refresh atau 10 detik | — |

Catatan FE:
- Pakai exponential backoff sederhana kalau response lama (mis. 2s → 3s → 5s, cap 5s).
- Saat user pindah tab / unmount component → hentikan polling.
- Backend tidak perlu push apapun; semua state-of-truth di Postgres, FE tinggal re-fetch.

---

## 8. Storage Layout — 0G Storage as primary

Semua artifact konten by default di **0G Storage** supaya match narasi "verified on 0G" + **hash reasoning per `ai_findings`** bisa di-verify (opsional anchor on-chain). Metadata temuan AI di Postgres; trace full per **`ai_finding_id`** di 0G.

| Namespace | Isi | Akses |
|---|---|---|
| `0g://sources/<contract_id>/contract.sol` | Source Solidity — kontrak **user** dan **katalog admin** (latest state per row) | private (encrypted, key di Supabase Vault per `contract_id`) |
| `0g://reasoning/<ai_finding_id>/trace.json` | Reasoning AI untuk satu **`ai_findings`** (Screen 08) | public-read, anchor opsional per row |
| `0g://contributions/<auditor_finding_id>/source.sol` | Snapshot source katalog (upload **hanya saat approved**) | public-read |
| `0g://contributions/<auditor_finding_id>/analysis.md` | Root cause auditor (upload **hanya saat approved**) | public-read |
| `0g://dataset/auditor-findings/<auditor_finding_id>.jsonl` | Satu baris SFT per **`auditor_findings`** approved | private, signed URL admin |
| `0g://dataset/snapshots/<version>/dataset.jsonl` | Bundle cumulative approved auditor findings | private, akses lewat admin signed URL |
| `0g://dataset/snapshots/<version>/manifest.json` | Manifest list `auditor_finding_id` approved + hash | private |

**Postgres** simpan: `og_storage_uri`, `content_hash`, dan optional `content_inline` cache (≤8KB) — bukan content besar.

**Supabase Storage** opsional sebagai fallback cache kalau 0G gateway lambat saat demo (asset non-critical: avatar, og-image share).

### 8.1 Auditor findings → dataset training

End-to-end flow (tabel **`auditor_findings`**):

```
[Auditor] ─GET /contracts/catalog──▶ pilih target (is_catalog=true)
[Auditor] ─POST /auditor-findings──▶ [Edge Function]
   {contract_id, title,             │ INSERT auditor_findings(review_status='draft')
    severity, description}
                                      ▼
[Auditor] ─PATCH /auditor-findings/:id──▶ iterate
[Auditor] ─POST /auditor-findings/:id/submit──▶ review_status='submitted'

[Admin] ──GET /admin/auditor-findings?review_status=submitted──▶ queue
[Admin] ──POST /admin/auditor-findings/:id/approve──┐
                                          │ snapshot source katalog + upload artifacts
                                          │ → 0g://contributions/<auditor_finding_id>/…
                                          │ → 0g://dataset/auditor-findings/<auditor_finding_id>.jsonl
                                          │ UPDATE review_status='approved', decided_at
                                          ▼

[Admin] ──POST /admin/auditor-findings/:id/reject──▶ review_status='rejected', decided_at (no 0G)

[Admin] ──POST /admin-dataset-snapshot {version}──▶
            bundle approved auditor_findings → 0g://dataset/snapshots/<v>/dataset.jsonl
            INSERT dataset_snapshots row
[Admin] ──GET /admin-dataset-export?version=v───▶ signed URL (mis. `ai/load_lora.py`)
```

**Catatan integrity**:
- Saat approve, server **wajib** re-fetch dari 0G dan recompute keccak256 → match dengan `code_hash` / `analysis_hash` di Postgres. Kalau tidak cocok → reject otomatis ("storage tampered").
- Setelah `review_status='approved'`, row tidak boleh di-edit oleh auditor (UPDATE diblok). Waktu keputusan di `decided_at`.
- Dataset snapshots immutable per `version`; revision = bikin version baru.

**Role**:
- Hanya ada flag `is_admin`. Tidak ada role hacker/user terpisah — siapapun (yang bukan admin) bisa menulis **`auditor_findings`**.
- Admin di-bootstrap via env `ADMIN_WALLETS` di Edge Function — saat user pertama kali muncul (auto-insert dari header), kalau wallet match list → set `is_admin=true`.

### 8.2 Hash anchor flow (opsional)

1. Edge Function upload artifact ke 0G Storage → dapat `og_storage_uri` + `content_hash` (keccak256).
2. (Opsional) Submit tx ke contract anchor di 0G testnet (Galileo), **per `ai_findings`**:
   ```solidity
   function anchor(bytes32 ai_finding_id, bytes32 reasoning_hash, string reasoning_uri)
   ```
3. Simpan `anchor_tx_hash` di row **`ai_findings`** yang bersangkutan, atau `dataset_snapshots` untuk bundle dataset — **bukan** di `audits`.
4. Tombol "verify reasoning" di FE: pilih **`ai_findings`** → re-fetch `0g://reasoning/<ai_finding_id>/trace.json`, recompute keccak, bandingkan dengan **`ai_findings.reasoning_hash`**. Verdict ✓ / ✗.

---

## 9. Roadmap Implementasi (urutan pengerjaan)

### Phase 1 — Foundation (hari 1)
1. Init Supabase project + migration awal: `users`, `contracts` (kolom `is_catalog`; tanpa `files`).
2. Edge Function middleware `resolveUser(req)` — baca `X-Wallet-Address`, upsert `users`, return `{user_id, role}`.
3. Bootstrap admin via env `ADMIN_WALLETS`.

### Phase 2 — Smart contract CRUD (hari 1–2)
5. Endpoint `/contracts` (user) + `/contracts/catalog` (read) + `/admin/contracts/catalog` (admin); patch user tidak boleh menyentuh `is_catalog=true`.
6. DB trigger atau logic di handler: saat source di row `contracts` berubah → re-upload ke 0G Storage, recompute `content_hash`, refresh `og_storage_uri`.
7. Edge Function `ai-codegen` (mock dulu pakai static response → swap ke 0G).

### Phase 3 — AI Audit Pipeline (hari 2–3)
8. Tabel `audits`, `ai_findings`. RLS.
9. `ai-audit` Edge Function + integrasi 0G Compute.
10. `ai-auto-fix`, `ai-gas-opt` (reuse orchestration template).
11. `GET /audits/:id` + `GET /ai-findings/:id`; response polling include **`ai_findings`** terbaru.

### Phase 4 — Auditor findings & dataset (hari 3–4)
12. Tabel **`auditor_findings`** (`contract_id` → katalog) + `dataset_snapshots`. Validasi server tiap write.
13. Edge Functions: `/auditor-findings`, `/admin/auditor-findings/...` (approve snapshot dari katalog).
14. Hash re-verify saat approve (fetch 0G, keccak compare, reject if mismatch).
15. `admin-dataset-snapshot` + `admin-dataset-export` (signed URL).

### Phase 5 — Settings & Polish (hari 4–5)
17. Settings PATCH endpoint + validation.
18. Error mapping ke Screen 10 (timeout 60s, wallet rejected, network mismatch, invalid AI output).
19. Rate limit Edge Functions (1 inference/15s/user, 5 submit **`auditor_findings`**/hari/wallet).
20. Logging + audit trail untuk debugging hackathon demo.

---

## 10. Open Questions / Risk

- **0G Compute completion**: status job dicek saat **client polling `GET /audits/:id`** (reconcile on read). Webhook dari 0G (kalau suatu saat ada) bisa jadi optimasi opsional; MVP tidak wajib cron background.
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
