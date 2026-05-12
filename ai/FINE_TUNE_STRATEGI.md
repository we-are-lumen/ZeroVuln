# Rencana Fine‑Tuning Qwen dengan LoRA (mengacu .0g‑skills)

## Ringkasan
Tujuan: fine‑tune model Qwen dengan LoRA menggunakan dataset dari 0G storage, lalu deploy inference. Rekomendasi runtime inference: Python (FastAPI) sebagai service utama; Node.js hanya sebagai gateway bila perlu.

## Referensi skill 0G (repo)
- Storage download/upload: be/.0g-skills/skills/storage/download-file/SKILL.md dan be/.0g-skills/skills/storage/upload-file/SKILL.md
- Fine‑tuning pattern: be/.0g-skills/skills/compute/fine-tuning/SKILL.md
- Cross-layer compute+storage pattern: be/.0g-skills/patterns/COMPUTE.md dan be/.0g-skills/patterns/STORAGE.md

## Asumsi teknis singkat
- 0G storage: S3‑compatible atau HTTP (pakai kredensial dari 0G skill).  
- Base model: Qwen (compatible HF).  
- Training infra: GPU atau cloud GPU.  
- Kita simpan adapter LoRA ke 0G (adapter-only preferensi).

## Data pipeline (sesuai skill storage)
- **Akses**: gunakan pola auth & credential dari `storage/download-file` skill. Simpan secrets di env/vault.  
- **Stream & shards**: stream JSONL dari 0G, buat shard dan simpan kembali ke 0G (lihat upload-file).  
- **Verifikasi**: gunakan sampling + tokenization checks (pakai `datasets` map).  
- **Split**: buat shards train/val/test dan simpan ke 0G untuk reproducibility.

## Preprocessing (praktis)
- Tokenizer: `QwenTokenizerFast` atau tokenizer kompatibel.  
- Convert ke `datasets.Dataset` dan cache (arrow).  
- Long contexts: sliding window atau chunking sesuai task.

## Setup LoRA (mengacu fine-tuning skill)
- Libraries: `transformers`, `datasets`, `accelerate`, `peft`, `bitsandbytes`, `safetensors`.  
- Example LoRA config (start): `r=8`, `alpha=16`, `dropout=0.1`, lr=1e-4, fp16/bf16, epochs 1–5.  
- Use `accelerate launch train_lora.py` pattern dari `compute/fine-tuning` skill.  
- Checkpoint: `peft.save_pretrained` upload ke 0G via upload pattern.

## Training script — tanggung jawab
- Load base model quantized (bnb 8-bit jika perlu).  
- Wrap model dengan `peft.LoraConfig` + `get_peft_model`.  
- Data loader via `datasets` streaming shards dari 0G.  
- Training loop atau `Trainer` + validation + save adapter ke 0G.

## Evaluasi & Safety
- Metrics: perplexity + task-specific (accuracy/F1/ROUGE).  
- Kualitas: run set prompt cases, safety checks (moderation filter).  
- Logging: simpan eval artifacts ke 0G.

## Deployment (Inference)
- Rekomendasi: Python FastAPI service.
  - Load base (quantized) + adapter via `PeftModel.from_pretrained`.
  - Endpoint: batch prompts, run `model.generate(...)` under `torch.no_grad()`.
  - Use GPU device mapping (`device_map="auto"`) dan memory optim (bnb).
- Alternatif: Node.js gateway memanggil Python endpoint. Hindari menjalankan LoRA/Qwen langsung di Node jika model besar.

## Ops & Observability (sesuai patterns)
- Secrets: environment / vault (ikuti `storage` skill praktik).  
- Monitoring: expose Prometheus metrics + logs.  
- CI/CD: build Docker image, push ke registry, deploy via k8s/managed GPU.

## Actionable checklist (prioritas)
- [ ] Pastikan akses 0G & test download streaming (ikuti `download-file` skill).  
- [ ] Tulis preprocessing pipeline & simpan shards ke 0G (ikuti `upload-file` pattern).  
- [ ] Implement `train_lora.py` sesuai `compute/fine-tuning` SKILL.  
- [ ] Jalankan training; simpan adapter ke 0G.  
- [ ] Buat `FastAPI` inference service yang load base+adapter.  
- [ ] Containerize + deploy + monitoring.

## File & perintah untuk menyimpan plan
Simpan sebagai `be/FINETUNING_PLAN.md`.

---

Untuk langkah berikutnya, mau saya:
- generate contoh `train_lora.py` lengkap dan `requirements.txt`, atau  
- generate minimal `FastAPI` inference + `Dockerfile`?
