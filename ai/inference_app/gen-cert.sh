#!/bin/sh
set -e

CERT_DIR=/etc/nginx/certs
CERT_FILE="$CERT_DIR/fullchain.pem"
KEY_FILE="$CERT_DIR/privkey.pem"
CERT_CN="${CERT_CN:-zerovuln.local}"
CERT_DAYS="${CERT_DAYS:-825}"

mkdir -p "$CERT_DIR"

if [ -s "$CERT_FILE" ] && [ -s "$KEY_FILE" ]; then
    echo "[gen-cert] existing cert found, skipping generation"
    exit 0
fi

echo "[gen-cert] generating self-signed cert for CN=$CERT_CN"
openssl req -x509 -nodes -newkey rsa:2048 \
    -days "$CERT_DAYS" \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=$CERT_CN" \
    -addext "subjectAltName=DNS:$CERT_CN,DNS:localhost,IP:127.0.0.1"

chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"