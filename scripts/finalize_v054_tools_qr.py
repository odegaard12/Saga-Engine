#!/usr/bin/env python3
from pathlib import Path

CACHE_OLD = 'saga-player-shell-v516-road-guide-tools'
CACHE_NEW = 'saga-player-shell-v517-tools-qr-studio'

studio_path = Path('frontend/src/admin/components/QrCardStudio.tsx')
studio = studio_path.read_text(encoding='utf-8')
replacements = [
    (
        "gridTemplateColumns: 'minmax(240px,.9fr) minmax(260px,1.1fr)'",
        "gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))'",
    ),
    (
        "const presetGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }",
        "const presetGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8 }",
    ),
    (
        "const actionGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }",
        "const actionGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }",
    ),
]
for old, new in replacements:
    if old not in studio:
        raise SystemExit(f'ERROR responsive: falta {old}')
    studio = studio.replace(old, new, 1)
studio_path.write_text(studio, encoding='utf-8')

guard_path = Path('scripts/check_offline_tools_ui.py')
guard = guard_path.read_text(encoding='utf-8')
old_panel = '''required_panel = [
    "Preparar esta misión",
    "Descargar para usar sin conexión",
    "Guardar progreso",
    "Sincronizar",
    "syncPendingOfflineEvents",
    "flushOfflineEvents",
    "cacheMissionMapTiles",
]'''
new_panel = '''required_panel = [
    "Preparar para jugar",
    "Preparar juego offline",
    "Guardar progreso",
    "Sincronizar",
    "syncPendingOfflineEvents",
    "flushOfflineEvents",
    "cacheMissionMapTiles",
    "cacheFieldProofAssets",
    "fetchFieldProofs",
]'''
if old_panel not in guard:
    raise SystemExit('ERROR guard offline: bloque inesperado')
guard = guard.replace(old_panel, new_panel, 1)
guard = guard.replace(
    "maxHeight: 'min(88dvh, 820px)'",
    "maxHeight: 'min(76dvh, 680px)'",
)
guard = guard.replace('su altura ampliada', 'su altura compacta')
guard_path.write_text(guard, encoding='utf-8')

paths = [
    Path('frontend/src/player/offline/pwaShell.ts'),
    Path('frontend/public/sw.js'),
]
paths.extend(
    path for path in Path('scripts').rglob('*')
    if path.is_file() and path.suffix in {'.py', '.sh', '.js', '.mjs', '.cjs'}
)
changed = []
for path in paths:
    text = path.read_text(encoding='utf-8')
    if CACHE_OLD in text:
        path.write_text(text.replace(CACHE_OLD, CACHE_NEW), encoding='utf-8')
        changed.append(str(path))
if not changed:
    raise SystemExit('ERROR: no se actualizó la caché PWA')

print('OK responsive, guardas y caché v0.5.4')
