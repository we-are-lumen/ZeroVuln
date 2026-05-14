"""Unzip a LoRA adapter, merge it into the base model, and push the merged model to HuggingFace Hub.

Usage:
    python merge_and_push.py \
        --adapter-zip ./fine_tuned_model/task-<id>.zip \
        --work-dir ./fine_tuned_model/task-<id> \
        --base-model Qwen/Qwen2.5-0.5B-Instruct \
        --merged-out ./fine_tuned_model/task-<id>/merged \
        --repo-id username/repo \
        --hf-token hf_xxx \
        [--private] [--commit-message "..."]
"""

from __future__ import annotations

import argparse
import os
import sys
import zipfile
from pathlib import Path

import torch
from huggingface_hub import HfApi, login
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--adapter-zip", required=True)
    p.add_argument("--work-dir", required=True, help="Where to unzip adapter files")
    p.add_argument("--base-model", required=True)
    p.add_argument("--merged-out", required=True)
    p.add_argument("--repo-id", required=True)
    p.add_argument("--hf-token", default=os.environ.get("HF_TOKEN"))
    p.add_argument("--private", action="store_true")
    p.add_argument("--commit-message", default="Upload merged model from 0G fine-tuning")
    return p.parse_args()


def pick_dtype() -> torch.dtype:
    if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
        return torch.bfloat16
    if torch.backends.mps.is_available():
        return torch.float16
    return torch.float32


def unzip_adapter(zip_path: Path, work_dir: Path) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    print(f"[merge] unzipping {zip_path} -> {work_dir}")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(work_dir)

    candidates = [
        work_dir,
        *(p.parent for p in work_dir.rglob("adapter_config.json")),
    ]
    seen: set[Path] = set()
    for cand in candidates:
        cand = cand.resolve()
        if cand in seen:
            continue
        seen.add(cand)
        if (cand / "adapter_config.json").exists():
            print(f"[merge] adapter dir = {cand}")
            return cand

    raise SystemExit(
        f"No adapter_config.json found inside {work_dir}. "
        "Contents:\n  " + "\n  ".join(str(p) for p in work_dir.rglob("*"))
    )


def merge(base_model: str, adapter_dir: Path, merged_out: Path) -> None:
    dtype = pick_dtype()
    print(f"[merge] base={base_model} dtype={dtype}")

    base = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=dtype,
        device_map="auto",
        trust_remote_code=True,
    )

    print("[merge] loading adapter ...")
    model = PeftModel.from_pretrained(base, str(adapter_dir))

    print("[merge] merge_and_unload ...")
    merged = model.merge_and_unload()

    merged_out.mkdir(parents=True, exist_ok=True)
    print(f"[merge] saving merged model -> {merged_out}")
    merged.save_pretrained(str(merged_out), safe_serialization=True)

    tokenizer_src = adapter_dir if (adapter_dir / "tokenizer_config.json").exists() else base_model
    tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_src), trust_remote_code=True)
    tokenizer.save_pretrained(str(merged_out))
    print(f"[merge] tokenizer saved from {tokenizer_src}")


def push(merged_out: Path, repo_id: str, token: str, private: bool, commit_message: str) -> None:
    if not token:
        raise SystemExit("Missing HF token (pass --hf-token or set HF_TOKEN env var)")
    print(f"[push] login + creating repo (private={private}) {repo_id}")
    login(token=token, add_to_git_credential=False)
    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, private=private, exist_ok=True)
    print(f"[push] uploading folder {merged_out} -> {repo_id}")
    api.upload_folder(
        folder_path=str(merged_out),
        repo_id=repo_id,
        commit_message=commit_message,
    )
    print(f"[push] done: https://huggingface.co/{repo_id}")


def main() -> None:
    args = parse_args()
    zip_path = Path(args.adapter_zip).resolve()
    work_dir = Path(args.work_dir).resolve()
    merged_out = Path(args.merged_out).resolve()

    if not zip_path.exists():
        raise SystemExit(f"adapter zip not found: {zip_path}")

    adapter_dir = unzip_adapter(zip_path, work_dir)
    merge(args.base_model, adapter_dir, merged_out)
    push(merged_out, args.repo_id, args.hf_token, args.private, args.commit_message)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)