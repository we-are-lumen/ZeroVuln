# ZeroVuln

ZeroVuln adalah repo hackathon untuk fine-tuning dan inference AI yang membantu menghasilkan smart contract Solidity dengan keamanan extra.

## Struktur Utama

- `ai/` - modul fine-tuning, model merge, dan inference API.
- `be/` - backend, serverless functions, dan Supabase/migration logic.

## AI Inference Docker Workflow

Folder `ai/` sekarang memiliki Docker runtime yang dapat mengunduh model dari Hugging Face repo `althof3/zeroVuln` pada startup.

### Build image

```bash
cd ai
docker build -t zerovuln-inference .
```

### Run container

```bash
docker run --rm -p 8000:8000 \
  -e HF_TOKEN="$HF_TOKEN" \
  -e MODEL_REPO=althof3/zeroVuln \
  zerovuln-inference
```

### Opsi lokal jika model sudah ada

```bash
docker run --rm -p 8000:8000 \
  -v "$(pwd)/ai/merged_model:/app/merged_model:ro" \
  zerovuln-inference
```

## Referensi Dokumentasi

- `ai/README.md` - detail setup fine-tuning, merge model, dan FastAPI inference.
- `ai/Dockerfile` - runtime image yang mendownload model dari Hugging Face.

## Catatan

- Pastikan `HF_TOKEN` tersedia jika repositori Hugging Face bersifat privat atau butuh akses token.
- `ai/merged_model/` tidak perlu dikomit jika model sudah ditarik langsung dari Hugging Face.
