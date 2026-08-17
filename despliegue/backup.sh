#!/usr/bin/env bash
# Backup del volumen de datos con restic (cifrado de nuestro lado) hacia
# Backblaze B2. Los overlays son IRRECUPERABLES: no existen en Moodle.
#
# Configuración: copiar .env.backup.ejemplo a .env.backup y completarlo.
# Programación (cron del host, 3:00 todas las noches):
#   0 3 * * * /home/ubuntu/micursada/despliegue/backup.sh >> /var/log/micursada-backup.log 2>&1
#
# LA PRIMERA VEZ: correr `./backup.sh init` para crear el repositorio,
# y después PROBAR LA RESTAURACIÓN (ver docs/DESPLIEGUE.md §7). Un backup
# que nunca se restauró no es un backup.
set -euo pipefail
cd "$(dirname "$0")"

# shellcheck disable=SC1091
source ./.env.backup

avisar() {
  # Aviso al celular vía ntfy si NTFY_TOPIC está configurado; si no, silencio.
  [ -n "${NTFY_TOPIC:-}" ] && curl -fsS -m 10 -d "$1" "https://ntfy.sh/${NTFY_TOPIC}" > /dev/null || true
}
trap 'avisar "micursada: FALLÓ el backup ($(date -Is))"' ERR

restic() {
  docker run --rm \
    -v micursada_datos:/datos:ro \
    -e RESTIC_REPOSITORY -e RESTIC_PASSWORD \
    -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY \
    restic/restic "$@"
}

if [ "${1:-}" = "init" ]; then
  restic init
  echo "Repositorio creado. Ahora corré ./backup.sh y después probá restaurar."
  exit 0
fi

restic backup /datos --tag micursada
# Retención: 14 diarios, 8 semanales, 6 mensuales. Lo demás se poda.
restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune
