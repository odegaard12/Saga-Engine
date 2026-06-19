#!/usr/bin/env bash
set -Eeuo pipefail

REPO="/home/odegaard12/saga_engine"
DOCS_BRANCH="release/v0.5.3-docs"
VERSION="0.5.3"
TAG="v0.5.3"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/backups/saga-engine/v053-release-$STAMP"

fail() {
  echo
  echo "ERROR: $*" >&2
  echo "Backup: $BACKUP" >&2
  exit 1
}

cd "$REPO"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Repositorio no válido"
command -v gh >/dev/null 2>&1 || fail "Falta GitHub CLI (gh)"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI no está autenticada"
[ -z "$(git status --porcelain)" ] || fail "Hay cambios locales"

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "La release $TAG ya existe."
  exit 0
fi

mkdir -p "$BACKUP"
git status --short --branch > "$BACKUP/status-before.txt"
git log -5 --oneline --decorate > "$BACKUP/log-before.txt"

echo "== Sincronizar rama de release =="
git fetch origin --prune
if git show-ref --verify --quiet "refs/heads/$DOCS_BRANCH"; then
  git switch "$DOCS_BRANCH"
  git pull --ff-only origin "$DOCS_BRANCH"
else
  git switch -c "$DOCS_BRANCH" --track "origin/$DOCS_BRANCH"
fi
[ -z "$(git status --porcelain)" ] || fail "La rama de release no está limpia"

for f in VERSION README.md CHANGELOG.md RELEASE_NOTES.md frontend/package.json frontend/package-lock.json; do
  mkdir -p "$BACKUP/$(dirname "$f")"
  cp -a "$f" "$BACKUP/$f"
done

echo "== Regenerar package-lock =="
(
  cd frontend
  npm version "$VERSION" --no-git-tag-version --allow-same-version
)

[ "$(cat VERSION)" = "$TAG" ] || fail "VERSION no es $TAG"
[ "$(node -p "require('./frontend/package.json').version")" = "$VERSION" ] || fail "package.json incorrecto"
grep -Fq '"version": "0.5.3"' frontend/package-lock.json || fail "package-lock incorrecto"
grep -Fq 'Current public release: **v0.5.3**.' README.md || fail "README incorrecto"
grep -Fq '## v0.5.3 — Offline GPS and field map release' CHANGELOG.md || fail "CHANGELOG incorrecto"
grep -Fq '# SAGA Engine v0.5.3 — Offline GPS and field map release' RELEASE_NOTES.md || fail "RELEASE_NOTES incorrecto"

echo "== Guardas =="
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

(
  cd frontend
  npm run build
  npm audit --audit-level=high
)
git diff --check

echo "== Completar rama y abrir PR =="
git add frontend/package.json frontend/package-lock.json
if ! git diff --cached --quiet; then
  git commit -m "release: synchronize frontend version v0.5.3"
  git push origin "$DOCS_BRANCH"
fi

PR_URL="$(gh pr list --head "$DOCS_BRANCH" --base main --state open --json url --jq '.[0].url // empty')"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create \
    --base main \
    --head "$DOCS_BRANCH" \
    --title "release: SAGA Engine v0.5.3" \
    --body "Finaliza v0.5.3: VERSION y frontend estables, README, CHANGELOG, RELEASE_NOTES, validaciones, despliegue, tag y GitHub Release.")"
fi

echo "PR: $PR_URL"
gh pr checks "$PR_URL" --watch --interval 10
gh pr merge "$PR_URL" --squash --delete-branch

echo "== Sincronizar main =="
git switch main
git pull --ff-only origin main
MAIN_COMMIT="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
[ "$(cat VERSION)" = "$TAG" ] || fail "main no contiene $TAG"

if git show-ref --tags --verify --quiet "refs/tags/$TAG"; then
  fail "El tag local $TAG ya existe"
fi
if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  fail "El tag remoto $TAG ya existe"
fi

echo "== Desplegar release estable =="
IMAGE="saga_engine:v053-$SHORT"
SAGA_VERSION="$TAG" \
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

VERSION_JSON="$(curl -fsS http://127.0.0.1:8096/api/version)"
echo "$VERSION_JSON"
python3 - "$VERSION_JSON" "$TAG" "$SHORT" <<'PY'
import json
import sys
payload = json.loads(sys.argv[1])
if str(payload.get("version", "")) != sys.argv[2]:
    raise SystemExit("versión desplegada incorrecta")
if not str(payload.get("commit", "")).startswith(sys.argv[3]):
    raise SystemExit("commit desplegado incorrecto")
print("OK versión estable")
PY

echo "== Tag y GitHub Release =="
git tag -a "$TAG" -m "SAGA Engine $TAG — Offline GPS and field map release" "$MAIN_COMMIT"
git push origin "$TAG"
gh release create "$TAG" \
  --verify-tag --latest \
  --title "SAGA Engine v0.5.3 — Offline GPS and field map release" \
  --notes-file RELEASE_NOTES.md

gh release view "$TAG"

git branch -D hardening/offline-gps-v051 >/dev/null 2>&1 || true
git push origin --delete hardening/offline-gps-v051 >/dev/null 2>&1 || true

echo
echo "============================================================"
echo "RELEASE COMPLETADA"
echo "============================================================"
echo "Versión: $TAG"
echo "Main: $MAIN_COMMIT"
echo "Imagen: $IMAGE"
echo "README, CHANGELOG y RELEASE_NOTES: actualizados"
echo "GitHub Release: publicada como latest"
echo "Backup: $BACKUP"
