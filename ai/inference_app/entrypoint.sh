#!/bin/sh
set -e

# Download model from Hugging Face repo (if not present)
python -m inference_app.download_model

# Exec uvicorn (replaces shell) so signals are forwarded correctly
exec uvicorn inference_app.main:app --host 0.0.0.0 --port 8000
