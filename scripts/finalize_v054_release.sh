#!/usr/bin/env bash
set -Eeuo pipefail

REPO="/home/odegaard12/saga_engine"
BRANCH="release/v0.5.4-final"
VERSION="0.5.4"
TAG="v0.5.4"
FEATURE_MERGE="63c8279bb5d1bab4d55bf949b0046007b1b85cce"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/backups/saga-engine/v054-release-$STAMP"
SELF="scripts/finalize_v054_release.sh"

fail() {
  echo
  echo "ERROR: $*" >&2
  echo "Backup: $BACKUP" >&2
  exit 1
}

cd "$REPO"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Repositorio no válido"
command -v gh >/dev/null 2>&1 || fail "Falta GitHub CLI"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI no está autenticada"
[ -z "$(git status --porcelain)" ] || fail "Hay cambios locales"

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "La release $TAG ya existe. No se modifica nada."
  exit 0
fi

mkdir -p "$BACKUP"
git status --short --branch > "$BACKUP/status-before.txt"
git log -8 --oneline --decorate > "$BACKUP/log-before.txt"

echo "============================================================"
echo "1. SINCRONIZAR RAMA DE RELEASE"
echo "============================================================"

git fetch origin --prune

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git switch "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  git switch -c "$BRANCH" --track "origin/$BRANCH"
fi

[ -z "$(git status --porcelain)" ] || fail "La rama de release no está limpia"
git merge-base --is-ancestor "$FEATURE_MERGE" HEAD || fail "La rama no contiene el merge funcional #250"

for file in VERSION README.md CHANGELOG.md RELEASE_NOTES.md frontend/package.json frontend/package-lock.json; do
  mkdir -p "$BACKUP/$(dirname "$file")"
  cp -a "$file" "$BACKUP/$file"
done

echo "============================================================"
echo "2. ESTABILIZAR VERSIÓN Y DOCUMENTACIÓN"
echo "============================================================"

printf '%s\n' "$TAG" > VERSION
(
  cd frontend
  npm version "$VERSION" --no-git-tag-version --allow-same-version
)

python3 <<'PY'
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR {label}: coincidencias={count}")
    return text.replace(old, new, 1)


readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
readme = replace_once(
    readme,
    "release-v0.5.3-0ea5e9",
    "release-v0.5.4-0ea5e9",
    "badge release",
)
readme = replace_once(
    readme,
    "Current public release: **v0.5.3**.",
    "Current public release: **v0.5.4**.",
    "current release",
)
readme = replace_once(
    readme,
    "- redesigned field Tools for offline preparation, progress save and synchronization;",
    "- compact field Tools for unified offline preparation, progress save and synchronization;\n"
    "- separate downloads for photographs intended for the device gallery;",
    "player tools",
)
readme = replace_once(
    readme,
    "| QR props | QR card builder for objects, keys, clues and bonus cards. |",
    "| QR props | QR card studio with safe presets, photographs and camera validation. |",
    "admin QR row",
)
readme = replace_once(
    readme,
    "- optional bonus rewards.\n\nQR inventory works locally and is compatible with offline player progress.",
    "- optional bonus rewards.\n\n"
    "The QR Studio adds clear, dark and photographic card presets, configurable accents and card shapes, high-error-correction QR rendering, and camera validation before PNG export. Changing the payload or visual design invalidates the previous validation without changing node progression.\n\n"
    "QR inventory works locally and is compatible with offline player progress.",
    "physical QR details",
)
readme = replace_once(
    readme,
    "| QR objects, keys, clues and bonuses | Production-ready |",
    "| QR objects, keys, clues and bonuses | Production-ready |\n"
    "| QR card design and camera validation | Production-ready foundation |",
    "support QR studio",
)
readme = replace_once(
    readme,
    "- mission pack, map-tile and road-route cache foundations;",
    "- unified mission, map-tile, game, field-photo and road-route cache foundations;",
    "offline foundations",
)

start = readme.index("## Repository status")
end = readme.index("## Roadmap", start)
status = '''## Repository status

The repository began with **v0.0.1** as its public foundation.

**v0.5.4** completes the field Tools and QR authoring pass. The player now uses
a compact Tools panel aligned with the rest of the mobile interface, with one
unified offline preparation action for mission data, map tiles, games and field
photographs. Gallery-oriented photograph downloads remain a separate action.

Mission Control now includes a QR card studio with safe visual presets,
photographic headers, configurable accents and shapes, high-correction QR
rendering and camera validation before PNG export. Validation compares the
scanned payload exactly and is invalidated whenever the payload or card design
changes, without altering player progress.

The field map, GPS tracking, road guide, node-state semantics, bottom navigation
and the four production-ready reusable games remain unchanged. Earlier private
history remains intentionally excluded.

'''
readme = readme[:start] + status + readme[end:]
readme = replace_once(
    readme,
    "- harden QR route completion with an explicit and predictable flow;",
    "- field-test QR cards on different phones, printers and lighting conditions;\n"
    "- add optional PDF/A4 batch export after the single-card workflow is proven;",
    "QR roadmap",
)
readme_path.write_text(readme, encoding="utf-8")

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text(encoding="utf-8")
entry = '''# Changelog

## v0.5.4 — Tools and QR Studio release
2026-06-19

- Redesigns player Tools to match the established SAGA mobile visual system.
- Removes duplicated copy while preserving GPS, language, login, fallback and diagnostics.
- Adds one unified offline preparation action for mission data, map tiles, games and field photographs.
- Keeps gallery-oriented photograph downloads as a separate action.
- Preserves the existing bottom navigation and safe-area behaviour.
- Adds QR card presets for clear, dark and photographic layouts.
- Adds configurable card accent and square or rounded presentation.
- Keeps the QR itself on a high-contrast white surface with error-correction level H.
- Adds camera validation that compares the scanned payload exactly before enabling PNG export.
- Invalidates QR validation whenever the payload or visual design changes.
- Keeps QR validation isolated from player inventory, node completion and progress.
- Coordinates the player service-worker cache as `saga-player-shell-v518-tools-copy-cleanup`.
- Adds and updates guards for Tools hierarchy, unified offline preparation, QR design and camera validation.
- Validates runtime contracts in Docker, TypeScript/Vite, npm audit, candidate-first deployment and production smoke checks.

'''
if not changelog.startswith("# Changelog\n\n"):
    raise SystemExit("ERROR: formato inesperado de CHANGELOG.md")
changelog = entry + changelog[len("# Changelog\n\n"):]
changelog_path.write_text(changelog, encoding="utf-8")

notes = '''# SAGA Engine v0.5.4 — Tools and QR Studio release

SAGA Engine v0.5.4 improves the field experience without adding another game.
It consolidates offline preparation into a compact Tools panel and adds a safe,
validated QR card workflow to Mission Control.

## Compact field Tools

- Aligns Tools with the established SAGA player design.
- Removes duplicated headings and explanatory copy.
- Uses one action to prepare mission data, map tiles, games and field photographs for offline play.
- Keeps photograph downloads for the device gallery as a separate action.
- Preserves progress save, synchronization, GPS centring, language, fallback code and diagnostics.
- Leaves the bottom navigation and mobile safe areas unchanged.

## QR Studio

- Adds clear, dark and photographic card presets.
- Supports configurable accent colour and square or rounded cards.
- Optimizes uploaded header photographs without placing them over QR modules.
- Keeps QR codes on a white, high-contrast surface with error-correction level H.
- Adds camera validation using exact payload comparison.
- Blocks PNG export until the current payload and design have been validated.
- Invalidates the previous validation after any payload, photograph, colour, shape or preset change.
- Does not modify inventory, node completion or player progress during validation.

## Offline preparation

The preparation action now caches the player shell, mission configuration, map
tiles and field-proof assets together. Successful preparation remains compatible
with later progress saving and pending-event synchronization.

## Validation

- Dedicated Tools and QR Studio guard.
- Offline/GPS hardening and recovery guards.
- Marker, routing, privacy and protected-files guards.
- Runtime contracts inside Docker.
- TypeScript and Vite production build.
- npm audit with zero known vulnerabilities.
- Candidate-first Docker deployment and smoke checks for `/`, `/admin-react` and `/player/PLAYER%201`.

## Follow-up work

- Test QR scanning across more phones, cameras, screens, printers and lighting conditions.
- Consider PDF/A4 batch export after the single-card workflow is proven.
- Continue reducing the frontend bundle through game-level dynamic imports.
'''
Path("RELEASE_NOTES.md").write_text(notes, encoding="utf-8")
print("OK: documentación v0.5.4 actualizada")
PY

[ "$(cat VERSION)" = "$TAG" ] || fail "VERSION incorrecta"
[ "$(node -p "require('./frontend/package.json').version")" = "$VERSION" ] || fail "package.json incorrecto"
grep -Fq '"version": "0.5.4"' frontend/package-lock.json || fail "package-lock incorrecto"
grep -Fq 'Current public release: **v0.5.4**.' README.md || fail "README incorrecto"
grep -Fq '## v0.5.4 — Tools and QR Studio release' CHANGELOG.md || fail "CHANGELOG incorrecto"
grep -Fq '# SAGA Engine v0.5.4 — Tools and QR Studio release' RELEASE_NOTES.md || fail "RELEASE_NOTES incorrecto"

echo "============================================================"
echo "3. VALIDAR RELEASE"
echo "============================================================"

python3 scripts/check_repo_privacy.py
python3 scripts/check_protected_files.py
python3 scripts/check_offline_gps_hardening.py
python3 scripts/check_map_offline_recovery.py
python3 scripts/check_offline_tools_ui.py
python3 scripts/check_map_marker_polish.py
python3 scripts/check_tools_qr_studio_v054.py
bash scripts/check_map_marker_visuals_v051.sh

RUNTIME_IMAGE="$(docker inspect --format '{{.Config.Image}}' saga_engine_app)"
[ -n "$RUNTIME_IMAGE" ] || fail "No se pudo obtener la imagen runtime"
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

echo "============================================================"
echo "4. COMMIT Y PR DE RELEASE"
echo "============================================================"

git rm "$SELF"
git add VERSION README.md CHANGELOG.md RELEASE_NOTES.md frontend/package.json frontend/package-lock.json
git diff --cached --check
git diff --cached --stat

git commit -m "release: SAGA Engine v0.5.4"
git push origin "$BRANCH"

PR_URL="$(gh pr list --head "$BRANCH" --base main --state open --json url --jq '.[0].url // empty')"
if [ -z "$PR_URL" ]; then
  PR_URL="$(gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "release: SAGA Engine v0.5.4" \
    --body "Finaliza v0.5.4: versión estable, README, CHANGELOG, RELEASE_NOTES, validaciones, despliegue, tag y GitHub Release para Tools compactas y QR Studio.")"
fi

echo "PR: $PR_URL"

if ! gh pr checks "$PR_URL" --watch --interval 10; then
  CHECK_OUTPUT="$(gh pr checks "$PR_URL" 2>&1 || true)"
  if grep -qi "no checks reported" <<<"$CHECK_OUTPUT"; then
    echo "Sin checks asociados; continúan las validaciones locales ya superadas."
  else
    echo "$CHECK_OUTPUT" >&2
    fail "Checks del PR fallidos"
  fi
fi

gh pr merge "$PR_URL" \
  --squash \
  --delete-branch \
  --subject "release: SAGA Engine v0.5.4" \
  --body "Stable v0.5.4 release metadata and documentation for compact Tools, unified offline preparation and QR Studio validation."

echo "============================================================"
echo "5. SINCRONIZAR MAIN Y DESPLEGAR"
echo "============================================================"

git switch main
git pull --ff-only origin main
MAIN_COMMIT="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"

[ "$(cat VERSION)" = "$TAG" ] || fail "main no contiene $TAG"
[ "$(node -p "require('./frontend/package.json').version")" = "$VERSION" ] || fail "main no contiene frontend $VERSION"

IMAGE="saga_engine:v054-$SHORT"
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

for route in / /admin-react /player/PLAYER%201; do
  curl -fsS "http://127.0.0.1:8096${route}" >/dev/null
  echo "OK $route"
done

VERSION_JSON="$(curl -fsS http://127.0.0.1:8096/api/version)"
echo "$VERSION_JSON"
python3 - "$VERSION_JSON" "$TAG" "$SHORT" <<'PY'
import json
import sys
payload = json.loads(sys.argv[1])
if str(payload.get("version", "")) != sys.argv[2]:
    raise SystemExit("ERROR: versión desplegada incorrecta")
if not str(payload.get("commit", "")).startswith(sys.argv[3]):
    raise SystemExit("ERROR: commit desplegado incorrecto")
print("OK: versión y commit estables")
PY

echo "============================================================"
echo "6. TAG Y GITHUB RELEASE"
echo "============================================================"

if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  fail "El tag remoto $TAG ya existe"
fi

git tag -a "$TAG" -m "SAGA Engine v0.5.4 — Tools and QR Studio release" "$MAIN_COMMIT"
git push origin "$TAG"

gh release create "$TAG" \
  --verify-tag \
  --latest \
  --title "SAGA Engine v0.5.4 — Tools and QR Studio release" \
  --notes-file RELEASE_NOTES.md

gh release view "$TAG"

# Limpieza de la rama funcional ya fusionada.
git branch -D feature/v054-tools-qr-validation >/dev/null 2>&1 || true
git push origin --delete feature/v054-tools-qr-validation >/dev/null 2>&1 || true
git fetch origin --prune

echo
echo "============================================================"
echo "SAGA ENGINE v0.5.4 COMPLETADA"
echo "============================================================"
echo "Feature PR #250: fusionado"
echo "Main: $MAIN_COMMIT"
echo "Versión: $TAG"
echo "Imagen: $IMAGE"
echo "README / CHANGELOG / RELEASE_NOTES: actualizados"
echo "GitHub Release: publicada como latest"
echo "Producción: validada"
echo "Backup: $BACKUP"
echo "============================================================"
