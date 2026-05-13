FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx supervisor \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

COPY inference_app /app/inference_app

FROM base AS runtime

ENV MODEL_REPO=althof3/zeroVuln

COPY --from=base /app/inference_app /app/inference_app

RUN cp /app/inference_app/nginx.conf /etc/nginx/nginx.conf \
 && cp /app/inference_app/supervisord.conf /etc/supervisor/supervisord.conf \
 && mkdir -p /etc/nginx/certs /var/log/nginx \
 && chmod +x /app/inference_app/entrypoint.sh

EXPOSE 80 443

CMD ["/bin/sh", "/app/inference_app/entrypoint.sh"]