
## Konsep: Findings as RAG Feed

```
Audit baru → Findings → Embed → Store ke 0G → jadi context audit berikutnya
```

Dua mode retrieval:
- **Saat audit**: ambil findings mirip sebagai context
- **Akumulasi**: makin banyak audit, makin kaya knowledge base-nya

---

## Implementasi Step by Step

### 1. Schema Finding yang Disimpan

Dulu tentuin dulu struktur datanya, karena ini yang di-embed dan di-retrieve:

```typescript
interface AnnotatedFinding {
  id: string                    // uuid
  contractHash: string          // keccak256 of source
  contractName?: string
  
  // core finding
  vulnerabilityType: string     // "Reentrancy", "Integer Overflow", dll
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  swcId?: string                // "SWC-107"
  
  // untuk RAG retrieval
  codeSnippet: string           // potongan kode yang vulnerable
  functionContext: string       // full function yang mengandung bug
  explanation: string           // kenapa ini vulnerable
  
  // annotation
  lineStart: number
  lineEnd: number
  
  // metadata
  timestamp: number
  auditId: string
  isVerified: boolean           // manual review flagged?
}
```

### 2. Pipeline Saat Menyimpan Finding

```typescript
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk"
import { OpenAI } from "openai" // atau voyage-code-2

async function storeFindingToRAG(finding: AnnotatedFinding) {
  // Step 1: Buat teks yang akan di-embed
  // gabungin fields yang semantically penting
  const embeddingText = `
    Vulnerability: ${finding.vulnerabilityType}
    SWC: ${finding.swcId ?? "N/A"}
    Severity: ${finding.severity}
    
    Vulnerable Code:
    ${finding.codeSnippet}
    
    Full Function Context:
    ${finding.functionContext}
    
    Explanation: ${finding.explanation}
  `.trim()

  // Step 2: Generate embedding
  const embedding = await embedText(embeddingText)

  // Step 3: Buat finding record lengkap dengan embedding
  const record = {
    ...finding,
    embedding,           // vector float[]
    embeddingText,       // teks yang di-embed (untuk debug)
  }

  // Step 4: Upload ke 0G Storage
  const rootHash = await uploadTo0GStorage(record)

  // Step 5: Simpan rootHash + metadata ke vector index
  // (bisa pakai Qdrant/Weaviate yang indexnya juga di-persist ke 0G)
  await vectorDB.upsert({
    id: finding.id,
    vector: embedding,
    payload: {
      rootHash,           // pointer ke 0G Storage
      vulnerabilityType: finding.vulnerabilityType,
      severity: finding.severity,
      swcId: finding.swcId,
      contractHash: finding.contractHash,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      timestamp: finding.timestamp,
    }
  })

  return rootHash
}
```

### 3. Upload ke 0G Storage

```typescript
import { ZgFile, Indexer, getFlowContract } from "@0glabs/0g-ts-sdk"
import { ethers } from "ethers"

const INDEXER_RPC = "https://indexer-storage-testnet-standard.0g.ai"
const FLOW_ADDRESS = "0xbD2C3F0E65eDF5582141C35969d66e205E58745D" // testnet

async function uploadTo0GStorage(data: object): Promise<string> {
  const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai")
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
  
  // Serialize finding jadi bytes
  const content = Buffer.from(JSON.stringify(data))
  
  // Buat ZgFile dari buffer
  const file = await ZgFile.fromBuffer(content, "application/json")
  const [tree, err] = await file.merkleTree()
  if (err) throw err

  const rootHash = tree!.rootHash()  // ini identifier-nya di 0G

  // Upload via Indexer
  const indexer = new Indexer(INDEXER_RPC)
  const flowContract = getFlowContract(FLOW_ADDRESS, signer)
  
  const [tx, uploadErr] = await indexer.upload(file, 0, provider, signer, flowContract)
  if (uploadErr) throw uploadErr

  console.log(`Stored finding: ${rootHash}, tx: ${tx}`)
  return rootHash
}
```

### 4. Pipeline Saat Retrieve (Waktu Audit Baru)

```typescript
async function retrieveRelevantFindings(
  codeChunk: string,
  topK: number = 5
): Promise<AnnotatedFinding[]> {
  
  // Step 1: Embed kode yang mau dianalysis
  const queryEmbedding = await embedText(codeChunk)
  
  // Step 2: Cari finding paling mirip dari vector index
  const results = await vectorDB.search({
    vector: queryEmbedding,
    limit: topK,
    with_payload: true,
    // optional: filter by severity
    filter: {
      must: [{ key: "severity", match: { any: ["CRITICAL", "HIGH"] } }]
    }
  })
  
  // Step 3: Fetch full finding dari 0G Storage pakai rootHash
  const findings = await Promise.all(
    results.map(r => fetchFrom0GStorage(r.payload.rootHash))
  )
  
  return findings
}

async function fetchFrom0GStorage(rootHash: string): Promise<AnnotatedFinding> {
  const indexer = new Indexer(INDEXER_RPC)
  const [data, err] = await indexer.download(rootHash, true)
  if (err) throw err
  return JSON.parse(data.toString())
}
```

### 5. Inject ke Prompt Gemini

```typescript
async function analyzeWithRAG(contractSource: string) {
  const functions = parseSolidityFunctions(contractSource) // parse per-function
  const allFindings = []

  for (const fn of functions) {
    // Retrieve findings mirip dari RAG
    const similarFindings = await retrieveRelevantFindings(fn.code, 3)

    // Build RAG context
    const ragContext = similarFindings.map(f => `
      [${f.severity}] ${f.vulnerabilityType} (${f.swcId ?? "No SWC"})
      Pattern: ${f.codeSnippet}
      Why vulnerable: ${f.explanation}
    `).join("\n---\n")

    // Prompt ke Gemini dengan context
    const prompt = `
      You are a smart contract security auditor.
      
      ## Known Vulnerability Patterns (from past audits):
      ${ragContext}
      
      ## Analyze this function for vulnerabilities:
      \`\`\`solidity
      ${fn.code}
      \`\`\`
      
      Return JSON with exact line numbers relative to the full contract.
      Focus especially on patterns similar to the examples above.
    `

    const result = await callGemini(prompt)
    
    // Setelah dapat hasil, langsung store finding baru ke 0G
    for (const finding of result.vulnerabilities) {
      await storeFindingToRAG({
        ...finding,
        codeSnippet: extractLines(contractSource, finding.lineStart, finding.lineEnd),
        functionContext: fn.code,
        contractHash: keccak256(contractSource),
        timestamp: Date.now(),
        auditId: generateId(),
        isVerified: false,
      })
    }

    allFindings.push(...result.vulnerabilities)
  }

  return allFindings
}
```
``` typescript
import VoyageAI from "voyageai"

const voyage = new VoyageAI({ apiKey: process.env.VOYAGE_API_KEY })

async function embedText(text: string): Promise<number[]> {
  const result = await voyage.embed({
    input: text,
    model: "voyage-code-2",  // ditraining khusus untuk source code
  })
  return result.data[0].embedding  // float[]
}
```
---

## Arsitektur Final

```
┌─────────────────────────────────────────────────┐
│              Vector DB (Qdrant)                 │
│  - embedding vectors                            │
│  - metadata + rootHash pointer ke 0G            │
└──────────────┬──────────────────────────────────┘
               │ rootHash
┌──────────────▼──────────────────────────────────┐
│              0G Storage                         │
│  - full finding JSON (code snippet, explanation)│
│  - immutable, content-addressed                 │
└─────────────────────────────────────────────────┘
```

Vector DB cuma nyimpen **pointer** (rootHash) ke 0G — jadi ringan. Full data ada di 0G, verifiable dan permanent.

---

## Quick Start — Install SDK

```bash
npm install @0glabs/0g-ts-sdk ethers
# vector db local untuk dev
docker run -p 6333:6333 qdrant/qdrant
```

Mau gue bantu buatin boilerplate lengkapnya sebagai starter code?