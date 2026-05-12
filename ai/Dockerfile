FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MODEL_PATH=/app/merged_model

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

COPY inference_app /app/inference_app

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "inference_app.main:app", "--host", "0.0.0.0", "--port", "8000"]

