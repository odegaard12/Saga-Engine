#!/usr/bin/env bash
set -Eeuo pipefail

REPO="/home/odegaard12/saga_engine"
BRANCH="feature/v054-tools-qr-validation"
VERSION="v0.5.4-dev"
CACHE_OLD="saga-player-shell-v517-tools-qr-studio"
CACHE_NEW="saga-player-shell-v518-tools-copy-cleanup"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/backups/saga-engine/v054-tools-copy-$STAMP"

HUD="frontend/src/player/components/PlayerHud.tsx"
MISSION="frontend/src/player/components/MissionPackPanel.tsx"

fail() {
  echo
  echo "ERROR: $*" >&2
  echo "Backup: $BACKUP" >&2
  exit 1
}

cd "$REPO"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Repositorio no válido"
[ "$(git branch --show-current)" = "$BRANCH" ] || fail "Rama incorrecta"
[ -z "$(git status --porcelain)" ] || fail "Hay cambios locales"

mkdir -p "$BACKUP"
git fetch origin --prune
git pull --ff-only origin "$BRANCH"
git status --short --branch > "$BACKUP/status-before.txt"
git log -6 --oneline --decorate > "$BACKUP/log-before.txt"
cp -a "$HUD" "$BACKUP/PlayerHud.tsx"
cp -a "$MISSION" "$BACKUP/MissionPackPanel.tsx"
git diff --binary > "$BACKUP/before.patch"

python3 - <<'PY' > "$BACKUP/bottom.sha"
from hashlib import sha256
from pathlib import Path
text = Path('frontend/src/player/components/PlayerHud.tsx').read_text(encoding='utf-8')
a = text.index('      <section\n        data-saga-player-hud="bottom"')
b = text.index('      {detailsOpen ? (', a)
print(sha256(text[a:b].encode()).hexdigest())
PY

echo "== Limpiar textos duplicados =="
python3 <<'PY'
from pathlib import Path

HUD = Path('frontend/src/player/components/PlayerHud.tsx')
MISSION = Path('frontend/src/player/components/MissionPackPanel.tsx')


def exact(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'ERROR {label}: coincidencias={count}')
    return text.replace(old, new, 1)


def remove_const(text: str, name: str) -> str:
    marker = f'const {name}: CSSProperties = {{'
    if text.count(marker) != 1:
        raise SystemExit(f'ERROR estilo {name}: declaraciones={text.count(marker)}')
    start = text.index(marker)
    end = text.find('\nconst ', start + len(marker))
    if end < 0:
        raise SystemExit(f'ERROR estilo {name}: final no encontrado')
    return text[:start] + text[end + 1:]


hud = HUD.read_text(encoding='utf-8')

hud = exact(
    hud,
    '''              <div style={toolsHeaderCopy}>
                <div style={toolsKicker}>
                  HERRAMIENTAS
                </div>

                <div style={toolsTitle}>
                  Preparar y resolver
                </div>

                <div style={toolsSubtitle}>
                  Offline, fotos y ayuda
                </div>
              </div>''',
    '''              <div style={toolsHeaderCopy}>
                <div style={toolsTitle}>
                  Herramientas
                </div>

                <div style={toolsSubtitle}>
                  Offline, fotos y ayuda
                </div>
              </div>''',
    'cabecera',
)

hud = exact(
    hud,
    '''            <section style={toolsSection}>
              <div style={toolsSectionHead}>
                <strong style={toolsSectionTitle}>
                  Antes de salir
                </strong>

                <span style={toolsSectionText}>
                  Prepara el juego completo para usarlo sin cobertura.
                </span>
              </div>

              <MissionPackPanel
                user={user}
                payload={missionPayload}
              />
            </section>''',
    '''            <section style={toolsSection}>
              <MissionPackPanel
                user={user}
                payload={missionPayload}
              />
            </section>''',
    'bloque offline duplicado',
)

hud = exact(
    hud,
    '''              <div style={toolsSectionHead}>
                <strong style={toolsSectionTitle}>
                  Accesos rápidos
                </strong>

                <span style={toolsSectionText}>
                  Acciones independientes del juego offline.
                </span>
              </div>''',
    '''              <div style={toolsSectionHead}>
                <strong style={toolsSectionTitle}>
                  Accesos rápidos
                </strong>
              </div>''',
    'texto accesos rápidos',
)

hud = exact(
    hud,
    '''                <div className="saga-tools-language-row">
                  <span>
                    {t('common.language', locale)}
                  </span>

                  <button''',
    '''                <div className="saga-tools-language-row">
                  <button''',
    'idioma duplicado',
)

hud = exact(
    hud,
    '''                  <strong>Fallback de nodo</strong>
                  <span>Completa el nodo con código si falla GPS, QR, cámara, brújula o cobertura.</span>''',
    '''                  <strong>Código alternativo</strong>
                  <span>Úsalo si no puedes escanear el QR.</span>''',
    'texto fallback',
)

hud = exact(
    hud,
    "{toolsFallbackOpen ? 'Ocultar fallback' : 'Fallback'}",
    "{toolsFallbackOpen ? 'Ocultar código' : 'Introducir código'}",
    'botón fallback',
)

hud = exact(
    hud,
    'placeholder="CÓDIGO FALLBACK"',
    'placeholder="CÓDIGO ALTERNATIVO"',
    'placeholder fallback',
)

hud = exact(
    hud,
    '''            <section style={toolsSupportPanel}>
              <div style={toolsSectionHead}>
                <strong style={toolsSectionTitle}>
                  Soporte
                </strong>

                <span style={toolsSupportText}>
                  Opciones de comprobación y versión instalada.
                </span>
              </div>

              <div style={toolsSecondaryRow}>
                <button
                  type="button"
                  style={
                    debugEnabled
                      ? toolsButtonDangerActive
                      : toolsQuietButton
                  }
                  onClick={() => {
                    onToggleDebug()
                    onCloseTools()
                  }}
                >
                  {debugEnabled
                    ? 'Salir de prueba GPS'
                    : 'Modo prueba GPS'}
                </button>

                <div style={toolsBuildInfo}>
                  <BuildInfoBadge mode="inline" />
                </div>
              </div>
            </section>''',
    '''            <div style={toolsSecondaryRow}>
              <button
                type="button"
                style={
                  debugEnabled
                    ? toolsButtonDangerActive
                    : toolsQuietButton
                }
                onClick={() => {
                  onToggleDebug()
                  onCloseTools()
                }}
              >
                {debugEnabled
                  ? 'Salir de prueba GPS'
                  : 'Modo prueba GPS'}
              </button>

              <div style={toolsBuildInfo}>
                <BuildInfoBadge mode="inline" />
              </div>
            </div>''',
    'soporte compacto',
)

for style_name in ('toolsKicker', 'toolsSectionText', 'toolsSupportPanel', 'toolsSupportText'):
    hud = remove_const(hud, style_name)

for forbidden in (
    'Preparar y resolver',
    'Antes de salir',
    'Acciones independientes del juego offline.',
    'Fallback de nodo',
    'Opciones de comprobación y versión instalada.',
):
    if forbidden in hud:
        raise SystemExit(f'ERROR: permanece texto duplicado: {forbidden}')

HUD.write_text(hud, encoding='utf-8')

mission = MISSION.read_text(encoding='utf-8')
mission = exact(
    mission,
    '''      <div style={topRow}>
        <div style={titleBlock}>
          <span style={eyebrow}>
            JUEGO OFFLINE
          </span>

          <strong style={title}>
            Preparar para jugar
          </strong>

          <small style={description}>
            Misión, mapa, juegos y fotografías del mapa.
          </small>
        </div>

        <span''',
    '''      <div style={topRow}>
        <strong style={title}>
          Juego offline
        </strong>

        <span''',
    'cabecera tarjeta offline',
)

for style_name in ('titleBlock', 'eyebrow', 'description'):
    mission = remove_const(mission, style_name)

if 'Preparar para jugar' in mission:
    raise SystemExit('ERROR: permanece título offline duplicado')

MISSION.write_text(mission, encoding='utf-8')
print('OK: textos compactados sin cambiar funciones')
PY

echo "== Actualizar contratos y caché PWA =="
python3 - "$CACHE_OLD" "$CACHE_NEW" <<'PY'
from pathlib import Path
import sys

old_cache, new_cache = sys.argv[1], sys.argv[2]

replacements = {
    Path('scripts/check_offline_tools_ui.py'): (
        '    "Preparar para jugar",\n',
        '    "Juego offline",\n',
    ),
    Path('scripts/check_map_offline_recovery.py'): (
        '    "Preparar para jugar",\n',
        '    "Juego offline",\n',
    ),
    Path('scripts/check_map_marker_polish.py'): (
        "if 'Preparar para jugar' not in offline or 'Preparar juego offline' not in offline or 'cacheFieldProofAssets' not in offline: raise SystemExit('offline')",
        "if 'Juego offline' not in offline or 'Preparar juego offline' not in offline or 'cacheFieldProofAssets' not in offline: raise SystemExit('offline')",
    ),
}

for path, (old, new) in replacements.items():
    text = path.read_text(encoding='utf-8')
    if text.count(old) != 1:
        raise SystemExit(f'ERROR contrato {path}: coincidencias={text.count(old)}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

specific = Path('scripts/check_tools_qr_studio_v054.py')
text = specific.read_text(encoding='utf-8')
anchor = "for forbidden in [\n"
extra = [
    "    'Preparar y resolver',",
    "    'Antes de salir',",
    "    'Acciones independientes del juego offline.',",
    "    'Preparar para jugar',",
    "    'Fallback de nodo',",
]
if extra[0] not in text:
    if text.count(anchor) != 1:
        raise SystemExit('ERROR: lista forbidden inesperada')
    text = text.replace(anchor, anchor + '\n'.join(extra) + '\n', 1)
specific.write_text(text, encoding='utf-8')

paths = [
    Path('frontend/src/player/offline/pwaShell.ts'),
    Path('frontend/public/sw.js'),
]
paths.extend(
    path for path in Path('scripts').glob('check_*')
    if path.is_file()
)
changed = []
for path in paths:
    text = path.read_text(encoding='utf-8')
    if old_cache in text:
        path.write_text(text.replace(old_cache, new_cache), encoding='utf-8')
        changed.append(str(path))
if len(changed) < 2:
    raise SystemExit('ERROR: caché PWA no actualizada en ambos archivos')
print('Cache:', new_cache)
PY

python3 - "$BACKUP/bottom.sha" <<'PY'
from hashlib import sha256
from pathlib import Path
import sys
text = Path('frontend/src/player/components/PlayerHud.tsx').read_text(encoding='utf-8')
a = text.index('      <section\n        data-saga-player-hud="bottom"')
b = text.index('      {detailsOpen ? (', a)
current = sha256(text[a:b].encode()).hexdigest()
expected = Path(sys.argv[1]).read_text().strip()
if current != expected:
    raise SystemExit(f'ERROR barra inferior: {expected} != {current}')
print('OK barra inferior intacta:', current)
PY

echo "== Guardas, contratos y build =="
python3 scripts/check_tools_qr_studio_v054.py
python3 scripts/check_repo_privacy.py
python3 scripts/check_protected_files.py
python3 scripts/check_offline_gps_hardening.py
python3 scripts/check_map_offline_recovery.py
python3 scripts/check_offline_tools_ui.py
python3 scripts/check_map_marker_polish.py
bash scripts/check_map_marker_visuals_v051.sh

RUNTIME_IMAGE="$(docker inspect --format '{{.Config.Image}}' saga_engine_app)"
[ -n "$RUNTIME_IMAGE" ] || fail "No se pudo obtener la imagen runtime"
docker run --rm --network none -e PYTHONDONTWRITEBYTECODE=1 \
  -v "$REPO:/app:ro" -w /app "$RUNTIME_IMAGE" python scripts/contract_check.py

(
  cd frontend
  npm run build
  npm audit --audit-level=high
)
git diff --check

echo "== Commit, push y despliegue =="
git rm scripts/apply_v054_tools_copy_cleanup.sh
git add -A
git diff --cached --check
git commit -m "frontend: simplify Tools copy and hierarchy"
SHORT="$(git rev-parse --short HEAD)"
git push origin "$BRANCH"

IMAGE="saga_engine:v054-tools-copy-$SHORT"
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

for route in / /admin-react /player/PLAYER%201; do
  curl -fsS "http://127.0.0.1:8096${route}" >/dev/null
  echo "OK $route"
done
curl -fsS http://127.0.0.1:8096/api/version; echo

echo
echo "DONE $SHORT $VERSION"
echo "Imagen: $IMAGE"
echo "Backup: $BACKUP"
echo "PR #250 actualizado; main no modificado."
