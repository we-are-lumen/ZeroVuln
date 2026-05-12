FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

COPY inference_app /app/inference_app

FROM base AS runtime

ENV MODEL_PATH=/app/merged_model

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "inference_app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS with-model

COPY merged_model /app/merged_model
