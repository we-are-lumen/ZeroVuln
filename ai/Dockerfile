FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt

# install requirements and any runtime download tools
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY inference_app /app/inference_app

FROM base AS runtime

# HF model loaded directly via transformers at runtime
ENV MODEL_REPO=althof3/zeroVuln

EXPOSE 8000

# Ensure inference app is present and use an entrypoint that downloads model then starts uvicorn
COPY --from=base /app/inference_app /app/inference_app

RUN chmod +x /app/inference_app/entrypoint.sh

CMD ["/bin/sh", "/app/inference_app/entrypoint.sh"]
