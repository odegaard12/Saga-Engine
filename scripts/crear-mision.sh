#!/bin/bash
#
# Levanta una misión nueva, aislada de las demás.
#
#   bash scripts/crear-mision.sh <nombre> <puerto> [imagen]
#   bash scripts/crear-mision.sh baiona 8097
#
# Cada misión es un contenedor con su propio directorio de datos: su
# configuración, sus nodos, sus jugadores, su base de datos, sus fotos y su
# contraseña de administración. TODO cuelga de SAGA_DATA_DIR, así que el
# aislamiento es por construcción —procesos y ficheros distintos— y no depende
# de que ningún código acierte a filtrar por cliente.
#
# Comprobado en la Raspberry el 2026-08-09: dos misiones a la vez, la ruta real
# con sus 14 jugadores y 10 nodos, y otra recién creada vacía, sin verse la una
# a la otra. Cuesta ~60 MB de memoria cada una.
#
set -e

NOMBRE="${1:?falta el nombre de la misión}"
PUERTO="${2:?falta el puerto}"
IMAGEN="${3:-saga_engine:latest}"

BASE="${SAGA_MISIONES_DIR:-$HOME}"
DATOS="${BASE}/saga_${NOMBRE}_data"
CONTENEDOR="saga_${NOMBRE}"

mkdir -p "$DATOS"

# El contenedor corre como uid 10001 (el usuario 'app' del Dockerfile), no como
# root. Sin este chown no puede crear su base de datos y el contenedor arranca y
# muere en bucle con "unable to open database file", que no dice nada de
# permisos y cuesta un rato entender.
sudo chown -R 10001:10001 "$DATOS"

docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTENEDOR" \
  --restart unless-stopped \
  -p "${PUERTO}:5000" \
  -e SAGA_STORAGE_BACKEND=sqlite \
  -e SAGA_DATA_DIR=/app/data \
  -e "ADMIN_PASS=${SAGA_ADMIN_PASS:-cambia-esta-clave-${NOMBRE}}" \
  -v "${DATOS}:/app/data" \
  "$IMAGEN" >/dev/null

echo "Misión '${NOMBRE}' levantada en el puerto ${PUERTO}."
echo "  datos:  ${DATOS}"
echo "  panel:  http://localhost:${PUERTO}/admin"

sleep 8
echo -n "  estado: "
curl -s "localhost:${PUERTO}/api/version" || echo "no responde todavía"
echo
echo
echo "⚠ La contraseña de administración va en SAGA_ADMIN_PASS. Cámbiala antes"
echo "  de abrir esto a nadie."
