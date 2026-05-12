import os
import threading
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer


def _select_dtype() -> torch.dtype:
    dtype_env = (os.getenv("TORCH_DTYPE") or "").strip().lower()
    if dtype_env in {"bf16", "bfloat16"}:
        return torch.bfloat16
    if dtype_env in {"fp16", "float16"}:
        return torch.float16
    if dtype_env in {"fp32", "float32"}:
        return torch.float32

    if torch.cuda.is_available():
        return torch.bfloat16
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.float16
    return torch.float32


def _model_repo() -> str:
    return os.getenv("MODEL_REPO") or "althof3/zeroVuln"

def _device_map() -> Any:
    return os.getenv("DEVICE_MAP") or "auto"


def _default_system_prompt() -> str:
    return os.getenv("SYSTEM_PROMPT") or "Generate a secure Solidity smart contract that is safe from the specified vulnerability."


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    system_prompt: str | None = None
    max_new_tokens: int = Field(default=2048, ge=1, le=8192)
    temperature: float = Field(default=0.7, ge=0.0, le=5.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)


class GenerateResponse(BaseModel):
    response: str


app = FastAPI(title="ZeroVuln Inference API")


@app.on_event("startup")
def _startup() -> None:
    repo = _model_repo()

    tokenizer = AutoTokenizer.from_pretrained(repo)
    model = AutoModelForCausalLM.from_pretrained(
        repo,
        torch_dtype=_select_dtype(),
        device_map=_device_map(),
    )

    app.state.tokenizer = tokenizer
    app.state.model = model
    app.state.lock = threading.Lock()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    tokenizer = getattr(app.state, "tokenizer", None)
    model = getattr(app.state, "model", None)
    lock = getattr(app.state, "lock", None)
    if tokenizer is None or model is None or lock is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    messages = [
        {"role": "system", "content": req.system_prompt or _default_system_prompt()},
        {"role": "user", "content": req.prompt},
    ]

    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    with lock:
        outputs = model.generate(
            **inputs,
            max_new_tokens=req.max_new_tokens,
            do_sample=True,
            temperature=req.temperature,
            top_p=req.top_p,
        )

    response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True)
    return GenerateResponse(response=response)

