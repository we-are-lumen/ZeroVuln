<div align="center">
  <img src="https://i.ibb.co.com/wFx1JrdK/ZEROVULN.png" alt="ZeroVuln Logo" width="160">
  <p><strong>Next-Generation LLM Inference API & Decentralized Fine-Tuning for Smart Contract Security</strong></p>
  <p>ZeroVuln is an advanced security platform focused on fine-tuning LLMs using decentralized infrastructure to detect vulnerabilities and generate secure Solidity smart contracts.</p>
  <p>
    <a href="https://zerovuln.vercel.app/"><strong>🌐 Live Demo: zerovuln.vercel.app</strong></a>
  </p>
</div>

---

## 🚀 Powered by 0G (Decentralized AI Storage & Compute)

ZeroVuln leverages the **0G** ecosystem for a fully decentralized model fine-tuning pipeline. We pull audited Solidity security datasets from the **0G Storage** network, perform distributed training using **0G Compute (TEE)**, and seamlessly decrypt, merge, and distribute the fine-tuned model directly to Hugging Face.

### 📜 Proof of Work: 0G Fine-Tuning Execution

Below is the authentic execution log (*proof of work*) showcasing the entire process: pulling the dataset from 0G Storage, creating a training task on 0G Compute, downloading the encrypted LoRA model, merging it, and finally pushing it to HuggingFace (`althof3/zeroVuln`):

<details>
<summary><strong>Click to expand: 0G CLI & Fine-Tuning Execution Log</strong></summary>

```bash
❯ npm run pull-and-fine-tune -- --limit 200

> zerovuln-scripts@1.0.0 pull-and-fine-tune
> tsx pull-datasets-from-0g.ts --fine-tune --limit 200

Starting download to: /var/folders/fh/fjd3nv4d1p179xbzxkb9lf500000gn/T/0g-0x886b1fff2a4a620751a593801f7e6754933fb7f3a93d28e2e2acb5905341deb8-46048-1778683364500.jsonl, proof: true
Downloading single file with root hash: 0x886b1fff2a4a620751a593801f7e6754933fb7f3a93d28e2e2acb5905341deb8
Getting file locations for root hash: 0x886b1fff2a4a620751a593801f7e6754933fb7f3a93d28e2e2acb5905341deb8
Found 4 locations for 0x886b1fff2a4a620751a593801f7e6754933fb7f3a93d28e2e2acb5905341deb8: [
  'http://34.19.125.196:5678',
  'http://35.236.80.213:5678',
  'http://34.169.28.106:5678',
  'http://34.83.53.209:5678'
]
Selected 2 of 4 nodes for 0x886b1fff2a4a620751a593801f7e6754933fb7f3a93d28e2e2acb5905341deb8
appended 1 line(s) from 244ebdfd-b7b3-4823-9783-117437b644c7
Starting download to: /var/folders/fh/fjd3nv4d1p179xbzxkb9lf500000gn/T/0g-0x2360e09365ee9b72c3986bf8e37458f2c10f2f11647279dc614670f5f3c5244d-46048-1778683367137.jsonl, proof: true
Downloading single file with root hash: 0x2360e09365ee9b72c3986bf8e37458f2c10f2f11647279dc614670f5f3c5244d
Getting file locations for root hash: 0x2360e09365ee9b72c3986bf8e37458f2c10f2f11647279dc614670f5f3c5244d
...
Selected 2 of 4 nodes for 0x4c2943931330f39ddd4916c3ba6a589a29e0cd006d58124942f8239cb4da940f
appended 1 line(s) from 5ffa7594-aab3-4987-bbfc-ec43fc9f2005

Done. ok=5 failed=0 total=5 lines=5 -> ./datasets/from_0g.jsonl
[0g-cli] 0g-compute-cli fine-tuning create-task --provider 0xA02b95Aa6886b1116C4f334eDe00381511E31A09 --model Qwen2.5-0.5B-Instruct --dataset-path ZeroVuln/model-training/datasets/from_0g.jsonl --config-path ZeroVuln/model-training/config-train.json
Detected testnet (chain ID: 16602)
Uploading dataset to 0G Storage...

⚠️  0G Storage upload failed: Error: spawn ENOEXEC
Falling back to direct TEE upload...
Uploading dataset to TEE: https://c7cc765f4c608423b97eb2efd11616a50c1f7084-3082.dstack-pha-in2.phala.network/v1/user/0x8540784B5FCcEb3045d1bc1f74919C7c41C12Fd6/dataset
File: from_0g.jsonl, Size: 0.00MB
Timeout: 90s
Dataset uploaded successfully
Dataset uploaded to TEE (fallback), hash: 0x93db6bd39efdefc618a441bdab9eb1e09fe56032461fceb2ebe5434a5bd7e9bf
Verify provider...
Provider signer already acknowledged
Provider verified
Creating task (fee will be calculated automatically)...
Fee will be automatically calculated by the broker based on actual token count
Created Task ID: 8cf9ff73-0925-493f-bf81-3a2418be110f
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f status=Training
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f status=Trained
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f status=Delivering
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f status=Delivered
[0g-cli] 0g-compute-cli fine-tuning acknowledge-model --provider 0xA02b95Aa6886b1116C4f334eDe00381511E31A09 --task-id 8cf9ff73-0925-493f-bf81-3a2418be110f --data-path ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.encrypted
Detected testnet (chain ID: 16602)
[INFO] 2026-05-13T14:46:51.168Z - Downloading model from 0G Storage...
[WARN] 2026-05-13T14:46:51.372Z - 0G Storage download failed: Error: spawn ENOEXEC. Falling back to TEE download...
Downloading LoRA model from TEE: https://c7cc765f4c608423b97eb2efd11616a50c1f7084-3082.dstack-pha-in2.phala.network/v1/user/0x8540784B5FCcEb3045d1bc1f74919C7c41C12Fd6/task/8cf9ff73-0925-493f-bf81-3a2418be110f/lora (attempt 1/3)
LoRA model downloaded from TEE and saved to ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.encrypted (93642246 bytes)
[INFO] 2026-05-13T14:47:11.035Z - Successfully downloaded LoRA model from TEE (fallback)
[WARN] 2026-05-13T14:47:15.822Z - Hash mismatch for task 8cf9ff73-0925-493f-bf81-3a2418be110f: expected 0xa007eef941aa484c1b3751be757c875083458f833e2bd348ff68e1261f07667c, got 0xe0ae907f974f5e78364197dc2c8e589c0ecf19510bdca47f4964366a9b766974
sending tx with gas price 4000000007n
tx hash: 0x88755a8dd8d47250a264233bdf323f5c7bcd538c458205a52a6eab3ac0c19f39
Acknowledged model
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f status=Delivered
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f status=UserAcknowledged
[0g-cli] taskId=8cf9ff73-0925-493f-bf81-3a2418be110f status=Finished
[0g-cli] 0g-compute-cli fine-tuning decrypt-model --provider 0xA02b95Aa6886b1116C4f334eDe00381511E31A09 --task-id 8cf9ff73-0925-493f-bf81-3a2418be110f --encrypted-model ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.encrypted --output ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.zip
Detected testnet (chain ID: 16602)
Decrypted model
[0g-cli] fine-tune complete. encrypted=ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.encrypted decrypted=ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.zip
[spawn] python3 ZeroVuln/model-training/merge_and_push.py --adapter-zip ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.zip --work-dir ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f --base-model Qwen/Qwen2.5-0.5B-Instruct --merged-out ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f/merged --repo-id althof3/zeroVuln
[merge] unzipping ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f.zip -> ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f
[merge] adapter dir = ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f/output_model
[merge] base=Qwen/Qwen2.5-0.5B-Instruct dtype=torch.float16
[transformers] `torch_dtype` is deprecated! Use `dtype` instead!
Loading weights: 100%|██████████████████████████████████████████████████████████████| 290/290 [00:02<00:00, 125.69it/s]
[merge] loading adapter ...
[merge] merge_and_unload ...
[merge] saving merged model -> ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f/merged
Writing model shards: 100%|██████████████████████████████████████████████████████████████| 1/1 [00:02<00:00,  2.48s/it]
[merge] tokenizer saved from ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f/output_model
[push] login + creating repo (private=False) althof3/zeroVuln
Note: Environment variable`HF_TOKEN` is set and is the current active token independently from the token you've just configured.
[push] uploading folder ZeroVuln/model-training/fine_tuned_model/task-8cf9ff73-0925-493f-bf81-3a2418be110f/merged -> althof3/zeroVuln
Processing Files (2 / 2)      : 100%|█████████████████████████████████████████████████████| 1.00GB / 1.00GB, 1.83MB/s  
New Data Upload               : 100%|█████████████████████████████████████████████████████|  716MB /  716MB, 1.83MB/s  
  ...10f/merged/tokenizer.json: 100%|█████████████████████████████████████████████████████| 11.4MB / 11.4MB            
  .../merged/model.safetensors: 100%|█████████████████████████████████████████████████████|  988MB /  988MB            
[push] done: https://huggingface.co/althof3/zeroVuln
[merge-push] pushed to https://huggingface.co/althof3/zeroVuln
```
</details>

---

## 📂 Core Architecture & Repository Structure

ZeroVuln is built as a complete, end-to-end decentralized ecosystem. Below is the breakdown of our architecture. **We highly encourage judges to click into each module's documentation for deep dives, technical diagrams, and detailed flows!**

| Module | Purpose | Tech Stack | Documentation |
| :--- | :--- | :--- | :--- |
| **🎨 [Frontend (fe/)](./fe)** | The decentralized dashboard for users to audit contracts and for human auditors to review vulnerabilities. | Next.js 15, Tailwind, ethers.js | [Read `fe/README.md`](./fe/README.md) |
| **⚙️ [Backend (be/)](./be)** | Serverless infrastructure handling auth, DB state, and API endpoints. | Deno, Supabase Edge Functions | [Read `be/README.md`](./be/README.md) |
| **🔗 [Smart Contract (smart-contract/)](./smart-contract)** | The on-chain settlement layer on 0G Mainnet (default). Handles pay-per-use fees and auditor bounties. | Solidity, Hardhat | [Read `smart-contract/README.md`](./smart-contract/README.md) |
| **🤖 [Training Pipeline (scripts/)](./model-training)** | Orchestrates verified findings from 0G Storage → 0G Compute fine-tuning → HuggingFace. | Node.js, Python, 0G CLI | [Read `scripts/README.md`](./model-training/README.md) |
| **🧠 [AI API (ai/)](./ai)** | Production-ready FastAPI inference engine serving our fine-tuned smart contract security models. | Python, FastAPI, HuggingFace | [Read `ai/README.md`](./ai/README.md) |


## 🐳 AI Inference Docker Workflow

The `ai/` folder provides a Docker runtime that automatically downloads the fine-tuned model directly from our Hugging Face repository (`althof3/zeroVuln`) upon startup.

### 1. Build the image

```bash
cd ai
docker build -t zerovuln-inference .
```

### 2. Run the container

```bash
docker run --rm -p 8000:8000 \
  -e HF_TOKEN="$HF_TOKEN" \
  -e MODEL_REPO=althof3/zeroVuln \
  zerovuln-inference
```

### Local (Offline) Mode

If you already have the model downloaded locally, you can mount it directly:

```bash
docker run --rm -p 8000:8000 \
  -v "$(pwd)/ai/merged_model:/app/merged_model:ro" \
  zerovuln-inference
```

---



## ⚠️ Important Notes

- Ensure the `HF_TOKEN` environment variable is set if using specific gated models.
- The `ai/merged_model/` folder is `.gitignore`d since the model is automatically pulled from Hugging Face during runtime.

<div align="center">
  <i>Built with ❤️ for a safer Web3 ecosystem.</i>
</div>
