#!/usr/bin/env bash
set -Eeuo pipefail

REPO="/home/odegaard12/saga_engine"
BRANCH="feature/v054-tools-qr-validation"
VERSION="v0.5.4-dev"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/backups/saga-engine/v054-tools-qr-$STAMP"

fail() {
  echo
  echo "ERROR: $*" >&2
  echo "Backup: $BACKUP" >&2
  exit 1
}

cd "$REPO"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Repositorio no válido"
[ -z "$(git status --porcelain)" ] || fail "Hay cambios locales"

mkdir -p "$BACKUP"
git status --short --branch > "$BACKUP/status-before.txt"
git log -5 --oneline --decorate > "$BACKUP/log-before.txt"

echo "== Sincronizar rama v0.5.4 =="
git fetch origin --prune
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git switch "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  git switch -c "$BRANCH" --track "origin/$BRANCH"
fi
[ -z "$(git status --porcelain)" ] || fail "La rama no está limpia"

TARGETS=(
  frontend/src/player/components/PlayerHud.tsx
  frontend/src/player/components/MissionPackPanel.tsx
  frontend/src/admin/components/GuidedNodeEditorFlow.tsx
  frontend/src/admin/components/QrCardStudio.tsx
  scripts/check_offline_tools_ui.py
  VERSION
  frontend/package.json
  frontend/package-lock.json
)
for file in "${TARGETS[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$file")"
  cp -a "$file" "$BACKUP/$file"
done

python3 - <<'PY' > "$BACKUP/bottom-before.sha"
from hashlib import sha256
from pathlib import Path
text = Path('frontend/src/player/components/PlayerHud.tsx').read_text()
a = text.index('      <section\n        data-saga-player-hud="bottom"')
b = text.index('      {detailsOpen ? (', a)
print(sha256(text[a:b].encode()).hexdigest())
PY

echo "== Aplicar Tools compactas y QR Studio =="
python3 scripts/patch_v054_tools_qr.py
python3 scripts/finalize_v054_tools_qr.py
printf '%s\n' "$VERSION" > VERSION
(
  cd frontend
  npm version 0.5.4-dev --no-git-tag-version --allow-same-version
)

python3 - "$BACKUP/bottom-before.sha" <<'PY'
from hashlib import sha256
from pathlib import Path
import sys
text = Path('frontend/src/player/components/PlayerHud.tsx').read_text()
a = text.index('      <section\n        data-saga-player-hud="bottom"')
b = text.index('      {detailsOpen ? (', a)
current = sha256(text[a:b].encode()).hexdigest()
expected = Path(sys.argv[1]).read_text().strip()
if current != expected:
    raise SystemExit(f'ERROR barra inferior: {expected} != {current}')
print('OK barra inferior intacta:', current)
PY

echo "== Guardas =="
python3 scripts/check_tools_qr_studio_v054.py
python3 scripts/check_repo_privacy.py
python3 scripts/check_protected_files.py
python3 scripts/check_offline_gps_hardening.py
python3 scripts/check_map_offline_recovery.py
python3 scripts/check_offline_tools_ui.py
python3 scripts/check_map_marker_polish.py
bash scripts/check_map_marker_visuals_v051.sh

RUNTIME_IMAGE="$(docker inspect --format '{{.Config.Image}}' saga_engine_app)"
[ -n "$RUNTIME_IMAGE" ] || fail "No se pudo determinar la imagen runtime"
docker run --rm --network none \
  -e PYTHONDONTWRITEBYTECODE=1 \
  -v "$REPO:/app:ro" -w /app \
  "$RUNTIME_IMAGE" python scripts/contract_check.py

echo "== Build y auditoría =="
(
  cd frontend
  npm run build
  npm audit --audit-level=high
)
git diff --check

echo "== Commit y push =="
git status --short
git diff --stat
git add -A
git diff --cached --check
if ! git diff --cached --quiet; then
  git commit -m "frontend: simplify Tools and add QR validation studio"
fi
SHORT="$(git rev-parse --short HEAD)"
git push origin "$BRANCH"

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  PR_URL="$(gh pr list --head "$BRANCH" --base main --state open --json url --jq '.[0].url // empty')"
  if [ -z "$PR_URL" ]; then
    PR_URL="$(gh pr create --draft --base main --head "$BRANCH" \
      --title "v0.5.4: simplify Tools and add QR validation studio" \
      --body "Herramientas compactas, preparación offline conjunta de misión/mapa/juegos/fotos del mapa, descarga separada de fotos y QR Studio con diseño seguro, fotografía y validación por cámara antes de descargar.")"
  fi
  echo "Draft PR: $PR_URL"
fi

echo "== Desplegar candidata v0.5.4-dev =="
IMAGE="saga_engine:v054-tools-qr-$SHORT"
SAGA_VERSION="$VERSION" \
SAGA_COMMIT="$SHORT" \
SAGA_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
ENV_FILE="/home/odegaard12/saga_engine_data/prod.env" \
DATA_DIR="/home/odegaard12/saga_engine_data" \
APP_NAME="saga_engine_app" \
CANDIDATE_NAME="saga_engine_candidate" \
HOST_PORT="8096" \
CANDIDATE_PORT="18096" \
bash scripts/deploy_saga_safe.sh "$IMAGE" --build --promote

for path in / /admin-react /player/PLAYER%201; do
  curl -fsS "http://127.0.0.1:8096${path}" >/dev/null
  echo "OK $path"
done
curl -fsS http://127.0.0.1:8096/api/version; echo

echo
echo "============================================================"
echo "v0.5.4-dev LISTA PARA PROBAR"
echo "============================================================"
echo "Rama: $BRANCH"
echo "Commit: $SHORT"
echo "Imagen: $IMAGE"
echo "Backup: $BACKUP"
echo "Main no modificado; sin tag ni release."
