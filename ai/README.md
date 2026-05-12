# ZeroVuln AI

Modul fine-tuning Qwen2.5-0.5B-Instruct dengan LoRA untuk menghasilkan smart contract Solidity yang aman dari kelas kerentanan tertentu.

## Struktur

```
ai/
├── lora_adapter/output_model/   # Hasil training LoRA (adapter)
├── merged_model/                # Base model + LoRA yang sudah di-merge
├── load_lora.py                 # Script merge adapter ke base model
├── run_inference.py             # Script inferensi dari merged_model
├── requirements.txt
└── test.sol
```

## Setup

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 1. Generate `lora_adapter/`

`lora_adapter/output_model/` berisi adapter LoRA hasil fine-tune Qwen2.5-0.5B-Instruct pada dataset smart contract aman.

Konfigurasi adapter (lihat `adapter_config.json`):

- `base_model`: `Qwen/Qwen2.5-0.5B-Instruct`
- `peft_type`: `LORA`
- `r`: 8, `lora_alpha`: 32, `lora_dropout`: 0.1
- `target_modules`: `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`
- `task_type`: `CAUSAL_LM`

Training dijalankan di luar repo ini (mis. 0G compute job dengan path mount `/app/mnt/model`). Untuk reproduksi training secara lokal pakai `peft` + `transformers` + `trl`:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer
from datasets import load_dataset

base = "Qwen/Qwen2.5-0.5B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(base)
model = AutoModelForCausalLM.from_pretrained(base, torch_dtype="bfloat16", device_map="auto")

lora_cfg = LoraConfig(
    r=8, lora_alpha=32, lora_dropout=0.1, bias="none",
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora_cfg)

dataset = load_dataset("json", data_files="dataset.jsonl", split="train")

args = TrainingArguments(
    output_dir="./lora_adapter/output_model",
    num_train_epochs=3,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    learning_rate=2e-4,
    bf16=True,
    logging_steps=10,
    save_strategy="epoch",
)

trainer = SFTTrainer(model=model, tokenizer=tokenizer, train_dataset=dataset, args=args)
trainer.train()
trainer.save_model("./lora_adapter/output_model")
tokenizer.save_pretrained("./lora_adapter/output_model")
```

Format dataset (`dataset.jsonl`) — satu contoh per baris:

```json
{"messages": [
  {"role": "system", "content": "Generate a secure Solidity smart contract that is safe from the specified vulnerability."},
  {"role": "user", "content": "create a price oracle proxy that authenticates the caller without tx.origin"},
  {"role": "assistant", "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n..."}
]}
```

## 2. Generate `merged_model/`

Setelah `lora_adapter/output_model/` tersedia, gabungkan adapter ke base model:

```bash
python load_lora.py
```

Yang dilakukan `load_lora.py`:

1. Load `Qwen/Qwen2.5-0.5B-Instruct` (auto-download dari HF Hub jika belum ada).
2. Load adapter dari `./lora_adapter/output_model`.
3. `merge_and_unload()` → bobot LoRA dijahit ke base model.
4. Simpan ke `./merged_model/` beserta tokenizer.

Hasil: `merged_model/` berisi `model.safetensors`, `config.json`, `tokenizer.json`, dll. — model standalone yang tidak butuh `peft` lagi saat inferensi.

## 3. Inferensi

```bash
python run_inference.py
```

`run_inference.py` memuat `./merged_model` dan memakai system prompt:

> Generate a secure Solidity smart contract that is safe from the specified vulnerability.

Ubah `prompt` di bagian bawah file untuk request berbeda.

## 4. Inference API (FastAPI)

Service ini membungkus logic `run_inference.py` menjadi HTTP API.

### Jalankan lokal

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export MODEL_PATH=./merged_model
python -m uvicorn inference_app.main:app --host 0.0.0.0 --port 8000
```

Request:

```bash
curl -s http://localhost:8000/health

curl -s http://localhost:8000/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"Write a contract that interacts with non-standard ERC20 tokens like USDT"}'
```

Environment penting:

- `MODEL_PATH` (default `./merged_model` di lokal, `/app/merged_model` di Docker)
- `DEVICE_MAP` (default `auto`)
- `TORCH_DTYPE` (`bf16`, `fp16`, `fp32`)
- `SYSTEM_PROMPT` (default sama seperti `run_inference.py`)

### Jalankan via Docker

```bash
cd ai
docker build -t zerovuln-inference .
docker run --rm -p 8000:8000 \
  -e MODEL_PATH=/app/merged_model \
  -v "$(pwd)/merged_model:/app/merged_model:ro" \
  zerovuln-inference
```

### Jalankan via Docker (model di-embed ke image)

Ini akan meng-copy folder `./merged_model` ke dalam image saat build (image jadi besar).

```bash
cd ai
python load_lora.py

docker build --target with-model -t zerovuln-inference-with-model .
docker run --rm -p 8000:8000 zerovuln-inference-with-model
```

## 5. Pull dataset dari 0G Storage (root hash dari Postgres Supabase)

Script ini:
- Query table `auditor_findings` di Postgres Supabase (yang `review_status='approved'` dan `dataset_uri` terisi)
- Download konten dataset dari 0G Storage (support `dataset_uri` berupa `0x<rootHash>` atau `0g://<path>`)
- Simpan file JSONL ke local folder

Environment:

- `SUPABASE_DATABASE_URL` (atau `DATABASE_URL`) koneksi Postgres Supabase
- `OG_STORAGE_INDEXER` (default testnet turbo)
- `OG_STORAGE_NODE` (opsional; dipakai untuk `0g://<path>` mode)

Jalankan:

```bash
cd ai
python pull_datasets_from_0g.py --out-dir ./datasets/from_0g --limit 200
```

## Catatan

- `merged_model/` dan `lora_adapter/` umumnya tidak di-commit (besar). Tambahkan ke `.gitignore` bila perlu.
- Butuh GPU dengan dukungan bf16 untuk training; inferensi 0.5B bisa jalan di CPU (lambat) atau MPS/CUDA.
