FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

COPY inference_app /app/inference_app

FROM base AS runtime

ENV MODEL_REPO=althof3/zeroVuln

COPY --from=base /app/inference_app /app/inference_app

EXPOSE 8000

CMD ["uvicorn", "inference_app.main:app", "--host", "0.0.0.0", "--port", "8000"]