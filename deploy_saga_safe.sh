#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-saga_engine_app}"
CANDIDATE_NAME="${CANDIDATE_NAME:-saga_engine_candidate}"
DATA_DIR="${DATA_DIR:-/home/odegaard12/saga_engine_data}"
HOST_PORT="${HOST_PORT:-8096}"
APP_PORT="${APP_PORT:-5000}"
CANDIDATE_PORT="${CANDIDATE_PORT:-18096}"
ENV_FILE="${ENV_FILE:-}"
BUILD_IMAGE=0
PROMOTE=0
IMAGE=""
SAGA_COMMIT="${SAGA_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
SAGA_BUILD_TIME="${SAGA_BUILD_TIME:-$(date +%Y-%m-%dT%H:%M:%S%z)}"

SAGA_VERSION="${SAGA_VERSION:-}"

if [ -z "$SAGA_VERSION" ] && [ -f VERSION ]; then
  SAGA_VERSION="$(tr -d '\r\n ' < VERSION)"
fi

SAGA_VERSION="${SAGA_VERSION:-dev}"

usage() {
  cat <<EOF
Usage:
  $0 IMAGE [--build] [--promote]

Examples:
  $0 saga_engine:error-boundary-v1 --build
  $0 saga_engine:error-boundary-v1 --build --promote

Default behavior:
  - builds image only if --build is passed
  - starts a candidate container on 127.0.0.1:${CANDIDATE_PORT}->${APP_PORT}
  - runs read-only smoke against candidate
  - does NOT touch production unless --promote is passed

Environment overrides:
  APP_NAME=saga_engine_app
  DATA_DIR=/home/odegaard12/saga_engine_data
  ENV_FILE=/path/to/prod.env
  HOST_PORT=8096
  APP_PORT=5000
  CANDIDATE_PORT=18096
  SAGA_VERSION=v0.2.0
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --build)
      BUILD_IMAGE=1
      shift
      ;;
    --promote)
      PROMOTE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -z "$IMAGE" ]; then
        IMAGE="$1"
        shift
      else
        echo "ERROR: argumento desconocido: $1"
        usage
        exit 1
      fi
      ;;
  esac
done

if [ -z "$IMAGE" ]; then
  echo "ERROR: falta IMAGE."
  usage
  exit 1
fi

detect_env_file() {
  if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    echo "$ENV_FILE"
    return
  fi

  for candidate in \
    "/home/odegaard12/saga_engine/prod.env" \
    "/home/odegaard12/saga_engine/.env" \
    "/home/odegaard12/saga_engine_data/prod.env" \
    "/home/odegaard12/saga_engine_data/.env"
  do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done

  return 1
}

smoke_base_url() {
  local base_url="$1"

  curl -fsS "${base_url}/" >/dev/null
  echo "OK ${base_url}/"

  curl -fsS "${base_url}/admin-react" >/dev/null
  echo "OK ${base_url}/admin-react"

  curl -fsS "${base_url}/player/PLAYER%201" >/dev/null
  echo "OK ${base_url}/player/PLAYER%201"
}

rollback_old_image() {
  local old_image="$1"
  local env_file="$2"

  if [ -z "$old_image" ]; then
    echo "ERROR: no hay imagen anterior para rollback automático."
    return 1
  fi

  echo "== Rollback a imagen anterior: ${old_image} =="
  docker rm -f "$APP_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$APP_NAME" \
    --restart unless-stopped \
    --env-file "$env_file" \
    -e "SAGA_COMMIT=${SAGA_COMMIT}" \
    -e "SAGA_BUILD_TIME=${SAGA_BUILD_TIME}" \
    -p "${HOST_PORT}:${APP_PORT}" \
    -v "${DATA_DIR}:/app/data" \
    "$old_image"

  sleep 4
  smoke_base_url "http://127.0.0.1:${HOST_PORT}"
}

ENV_FILE_DETECTED="$(detect_env_file || true)"
if [ -z "$ENV_FILE_DETECTED" ]; then
  echo "ERROR: no encuentro prod.env/.env en rutas esperadas."
  echo "Candidatos encontrados, sin mostrar contenido:"
  find /home/odegaard12 -maxdepth 4 -type f \( -name "prod.env" -o -name ".env" \) -print || true
  exit 1
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "ERROR: DATA_DIR no existe: $DATA_DIR"
  exit 1
fi

echo "== Config deploy seguro =="
echo "Imagen candidata: $IMAGE"
echo "Env file: $ENV_FILE_DETECTED"
echo "Data dir: $DATA_DIR"
echo "Producción: ${HOST_PORT}->${APP_PORT}"
echo "Candidato local: 127.0.0.1:${CANDIDATE_PORT}->${APP_PORT}"
echo "Promote: $PROMOTE"
echo "Commit: $SAGA_COMMIT"
echo "Build time: $SAGA_BUILD_TIME"
echo "Version: $SAGA_VERSION"

OLD_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$APP_NAME" 2>/dev/null || true)"

if [ -n "$OLD_IMAGE" ]; then
  echo "Imagen actual producción: $OLD_IMAGE"
else
  echo "No hay contenedor producción actual detectado."
fi

if [ "$BUILD_IMAGE" -eq 1 ]; then
  echo "== Docker build: $IMAGE =="
  docker build -t "$IMAGE" .
fi

echo "== Limpiar candidato anterior =="
docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true

echo "== Arrancar candidato local, sin tocar producción =="
docker run -d \
  --name "$CANDIDATE_NAME" \
  --env-file "$ENV_FILE_DETECTED" \
  -e "SAGA_VERSION=${SAGA_VERSION}" \
  -e "SAGA_COMMIT=${SAGA_COMMIT}" \
  -e "SAGA_BUILD_TIME=${SAGA_BUILD_TIME}" \
  -p "127.0.0.1:${CANDIDATE_PORT}:${APP_PORT}" \
  -v "${DATA_DIR}:/app/data" \
  "$IMAGE"

echo "== Smoke candidato =="
sleep 4
if ! smoke_base_url "http://127.0.0.1:${CANDIDATE_PORT}"; then
  echo "ERROR: smoke candidato falló. Logs:"
  docker logs --tail 120 "$CANDIDATE_NAME" || true
  docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true
  exit 1
fi

echo "== Candidato OK =="

if [ "$PROMOTE" -ne 1 ]; then
  echo "Modo sin --promote: producción NO tocada."
  echo "Puedes probar en LAN: http://192.168.68.103:${CANDIDATE_PORT}/admin-react"
  docker ps --filter "name=${APP_NAME}" --filter "name=${CANDIDATE_NAME}" \
    --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
  exit 0
fi

echo "== Promoción autorizada: reemplazar producción =="
docker rm -f "$APP_NAME" >/dev/null 2>&1 || true
docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE_DETECTED" \
  -e "SAGA_VERSION=${SAGA_VERSION}" \
  -e "SAGA_COMMIT=${SAGA_COMMIT}" \
  -e "SAGA_BUILD_TIME=${SAGA_BUILD_TIME}" \
  -p "${HOST_PORT}:${APP_PORT}" \
  -v "${DATA_DIR}:/app/data" \
  "$IMAGE"

echo "== Smoke producción =="
sleep 4
if ! smoke_base_url "http://127.0.0.1:${HOST_PORT}"; then
  echo "ERROR: smoke producción falló. Logs:"
  docker logs --tail 120 "$APP_NAME" || true
  rollback_old_image "$OLD_IMAGE" "$ENV_FILE_DETECTED"
  exit 1
fi

echo "== Deploy OK =="
docker ps --filter "name=${APP_NAME}" \
  --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
