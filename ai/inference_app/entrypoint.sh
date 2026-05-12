#!/bin/sh
set -e

/app/inference_app/gen-cert.sh

exec /usr/local/bin/supervisord -c /etc/supervisor/supervisord.conf