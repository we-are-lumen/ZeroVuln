#!/bin/sh
set -e

exec uvicorn inference_app.main:app --host 0.0.0.0 --port 8000
