# ZeroVuln AI

Inference API (FastAPI) untuk ZeroVuln.

Catatan: pipeline training / fine-tuning / merge model sudah dipindahkan ke folder [scripts/](file:///Users/althoframdhan/Documents/hackathon/ZeroVuln/scripts/).

## Struktur

```
ai/
├── requirements.txt
├── Dockerfile
└── inference_app/
    ├── __init__.py
    └── main.py
```

## Setup

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Inference API (FastAPI)

Service ini expose model via HTTP.

### Jalankan lokal

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export MODEL_REPO=althof3/zeroVuln
python -m uvicorn inference_app.main:app --host 0.0.0.0 --port 8000
```

Request:

```bash
curl -s http://localhost:8000/health

curl -s http://localhost:8000/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"Write a contract that interacts with non-standard ERC20 tokens like USDT", "system_prompt": "Generate a secure Solidity smart contract that is safe from the specified vulnerability."}'
```

Environment penting:

- `MODEL_REPO` (default `althof3/zeroVuln`)
- `MODEL_PATH` (opsional; jika mau load model dari folder lokal)
- `DEVICE_MAP` (default `auto`)
- `TORCH_DTYPE` (`bf16`, `fp16`, `fp32`)
- `SYSTEM_PROMPT` (default hardcoded di aplikasi)

### Jalankan via Docker

Container sekarang dapat mengunduh model dari Hugging Face repo saat startup. Gunakan `HF_TOKEN` yang valid untuk repo privat atau jika kuota akses diperlukan.

```bash
cd ai
docker build -t zerovuln-inference .
docker run --rm -p 8000:8000 \
  -e HF_TOKEN="$HF_TOKEN" \
  -e MODEL_REPO=althof3/zeroVuln \
  zerovuln-inference
```

### Opsi lokal / offline

Jika model sudah tersedia di lokal dan Anda ingin melewati unduhan runtime, pasang volume folder model lalu set `MODEL_PATH`.

```bash
cd ai
docker build -t zerovuln-inference .
docker run --rm -p 8000:8000 \
  -e MODEL_PATH=/app/model \
  -v "/abs/path/to/model:/app/model:ro" \
  zerovuln-inference
```

Pipeline pull dataset / fine-tune / merge / push model ada di folder [scripts/](file:///Users/althoframdhan/Documents/hackathon/ZeroVuln/scripts/).

## Catatan

- Inferensi 0.5B bisa jalan di CPU (lambat) atau MPS/CUDA.
