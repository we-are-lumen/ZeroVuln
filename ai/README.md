# ZeroVuln AI — LLM Inference API for Solidity Security

## Executive Summary

ZeroVuln AI turns a domain-adapted LLM into a **production-friendly HTTP API** that helps teams **spot vulnerabilities and generate safer Solidity fixes faster**. It is designed for hackathon-grade demos and real-world integration: a clean `/generate` endpoint, structured outputs for automation, and a model-loading strategy that works in local/dev/prod.

Why it stands out to judges:
- **End-to-end security flywheel**: audited findings → curated data → training pipeline (in [scripts/](../scripts/)) → better model → faster, more accurate inference here.
- **Developer-ready**: drop-in service for your backend/FE; easy to proxy; predictable JSON responses.
- **Deployment-friendly**: FastAPI + Uvicorn only (TLS/SSL and routing can live outside the container).

## Demo (Visual)

Add visuals that sell the story in 10 seconds:

<p align="center">
  <img src="./demo.gif" alt="ZeroVuln AI demo GIF" width="900" />
</p>

<p align="center">
  <img src="./screenshot.png" alt="Example API response screenshot" width="900" />
</p>

If you don’t want to commit assets, replace the image `src` with public URLs (GitHub raw, an image host, or your hackathon submission page).

## Contents

- Executive Summary
- Demo (Visual)
- Unique Value Proposition
- Competitive Advantage
- Tech Stack
- How It Works
- API
- Configuration
- Quickstart (Local)
- Quickstart (Docker)
- Impact & Metrics
- Roadmap
- Directory Structure

## Unique Value Proposition

An **LLM-in-the-loop security assistant** tailored for Solidity that emphasizes:
- **Actionable outputs**: findings + remediation guidance that developers can apply immediately.
- **Structured responses**: designed for triage pipelines (severity/confidence/tags, later line ranges).
- **Continuous improvement**: the model can be iteratively improved with verified auditor feedback.

## Competitive Advantage

- **Security flywheel over one-off prompting**: curated findings improve the model over time, not just the next prompt.
- **Structured by default**: easier to integrate into issue trackers, dashboards, and automated remediation flows.
- **Operational simplicity**: a single inference service; no embedded reverse proxy required.

## Tech Stack

- **API**: FastAPI + Uvicorn
- **Model runtime**: HuggingFace Transformers + PyTorch
- **Model distribution**: HuggingFace Hub (`MODEL_REPO`) or a local mount (`MODEL_PATH`)
- **Containerization**: Docker

## How It Works

```
Client / Backend / UI
        │  HTTP JSON
        ▼
FastAPI (this service)
        │  loads model (HF repo or local path)
        ▼
Transformers + Torch
        │
        ▼
Structured JSON response (findings / fix / reasoning)
```

Training / fine-tuning / dataset workflows live in [scripts/](../scripts/).

## API

Main endpoints:
- `GET /health`
- `POST /generate`

Example requests:

```bash
curl -s http://localhost:8000/health

curl -s http://localhost:8000/generate \
  -H 'content-type: application/json' \
  -d '{
    "prompt": "Analyze this Solidity contract for common vulnerabilities and propose fixes...",
    "system_prompt": "Return a structured security review and a safer corrected Solidity snippet."
  }'
```

## Configuration

Environment variables:
- `MODEL_REPO` (default: `althof3/zeroVuln`) — load a model from HuggingFace Hub
- `MODEL_PATH` (optional) — load a model from a local directory (offline mode)
- `HF_TOKEN` (optional) — required only for private / gated models
- `DEVICE_MAP` (default: `auto`)
- `TORCH_DTYPE` (`bf16`, `fp16`, `fp32`)
- `SYSTEM_PROMPT` (optional; overrides default)

## Quickstart (Local)

```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export MODEL_REPO=althof3/zeroVuln
python -m uvicorn inference_app.main:app --host 0.0.0.0 --port 8000
```

## Quickstart (Docker)

```bash
cd ai
docker build -t zerovuln-inference .
docker run --rm -p 8000:8000 \
  -e HF_TOKEN="$HF_TOKEN" \
  -e MODEL_REPO=althof3/zeroVuln \
  zerovuln-inference
```

### Offline mode (mount a local model)

```bash
cd ai
docker build -t zerovuln-inference .
docker run --rm -p 8000:8000 \
  -e MODEL_PATH=/app/model \
  -v "/abs/path/to/model:/app/model:ro" \
  zerovuln-inference
```

## Impact & Metrics

Use this section to demonstrate traction and engineering confidence during judging. Fill the “Measured” column with numbers from your live demo; keep “Target” as a credible next milestone.

| Metric | Measured (demo) | Target (next) | Why it matters |
|---|---:|---:|---|
| Latency p50 / p95 (`POST /generate`) | TBD | TBD | Developer experience, feasibility for CI/PR workflows |
| Throughput (req/min per instance) | TBD | TBD | Cost & scalability |
| Actionability score (manual rubric) | TBD | TBD | “Can a dev apply this fix?” |
| Precision of findings (spot-check) | TBD | TBD | Trustworthiness |
| Coverage (vuln classes supported) | TBD | TBD | Breadth across real contracts |

Suggested rubric for judges (simple and defensible):
- **Correctness**: is the vulnerability reasoning technically right?
- **Actionability**: does it propose an implementable fix?
- **Clarity**: does the output reduce developer back-and-forth?

## Roadmap

- **Near-term (shipping)**: unify a stable findings schema (severity/confidence/tags, optional line ranges) so downstream systems can auto-triage.
- **Performance**: caching + warm-start to reduce cold starts; optional batching for higher throughput.
- **Guardrails**: post-check policies to avoid insecure-by-default code generation (lint + pattern checks).
- **Productization**: dedicated “audit contract” and “auto-fix” endpoints aligned with the broader ZeroVuln backend flow.

## Directory Structure

```
ai/
├── requirements.txt
├── Dockerfile
└── inference_app/
    ├── __init__.py
    └── main.py
```

## Notes

- CPU inference works but is slower. For a crisp demo, use GPU/MPS when available.
