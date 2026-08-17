#!/usr/bin/env bash
# Actualiza la app en la VM: trae main, reconstruye y reinicia.
# Los datos no se tocan: viven en el volumen micursada_datos.
#
#   ssh vm 'cd micursada/despliegue && ./actualizar.sh'
#
# Hay unos segundos de caída mientras el contenedor se reinicia: con gente
# adentro conviene correrlo de madrugada.
set -euo pipefail
cd "$(dirname "$0")"

git pull --ff-only
docker compose build app
docker compose up -d
docker image prune -f

echo "OK: $(git log -1 --format='%h %s')"
