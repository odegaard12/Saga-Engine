#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


hud = read('frontend/src/player/components/PlayerHud.tsx')
panel = read('frontend/src/player/components/MissionPackPanel.tsx')
studio = read('frontend/src/admin/components/QrCardStudio.tsx')
guided = read('frontend/src/admin/components/GuidedNodeEditorFlow.tsx')
pwa = read('frontend/src/player/offline/pwaShell.ts')
sw = read('frontend/public/sw.js')

for token in [
    'Preparar juego offline',
    'cacheMissionMapTiles',
    'cacheFieldProofAssets',
    'fetchFieldProofs',
]:
    if token not in panel:
        raise SystemExit(f'ERROR offline conjunto: falta {token}')

for forbidden in [
    'Preparar y resolver',
    'Antes de salir',
    'Acciones independientes del juego offline.',
    'Preparar para jugar',
    'Fallback de nodo',
    'CENTRO DE CAMPO',
    'CONTENIDO DE CAMPO',
    'UBICACIÓN Y DIAGNÓSTICO',
]:
    if forbidden in hud:
        raise SystemExit(f'ERROR Herramientas sobrecargadas: {forbidden}')

for token in [
    'Offline, fotos y ayuda',
    'Descargar fotos',
    'Centrar ubicación',
    "maxHeight: 'min(76dvh, 680px)'",
]:
    if token not in hud:
        raise SystemExit(f'ERROR Herramientas: falta {token}')

for token in [
    "import jsQR from 'jsqr'",
    'level="H"',
    'Validar con cámara',
    'navigator.mediaDevices?.getUserMedia',
    'code.data === payload',
    'disabled={!validated}',
    'getQrDesignSignature',
    'imageDataUrl',
]:
    if token not in studio:
        raise SystemExit(f'ERROR QR Studio: falta {token}')

for token in [
    '<QrCardStudio',
    'qr_validation_signature',
    'qr_card_image_data_url',
    'Validado para este diseño',
]:
    if token not in guided:
        raise SystemExit(f'ERROR integración QR: falta {token}')

cache = 'saga-player-shell-v518-tools-copy-cleanup'
if cache not in pwa or cache not in sw:
    raise SystemExit('ERROR caché PWA no coordinada')

print('Tools and QR Studio v0.5.4 guard passed.')
