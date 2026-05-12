#!/bin/sh
set -e

/app/inference_app/gen-cert.sh

exec supervisord -c /etc/supervisor/supervisord.conf