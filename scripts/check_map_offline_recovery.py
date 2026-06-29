#!/usr/bin/env python3

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (
        ROOT / path
    ).read_text(encoding="utf-8")


player = read(
    "frontend/src/player/PlayerApp.tsx"
)

map_surface = read(
    "frontend/src/player/components/"
    "MapSurface.tsx"
)

panel = read(
    "frontend/src/player/components/"
    "MissionPackPanel.tsx"
)

pwa = read(
    "frontend/src/player/offline/"
    "pwaShell.ts"
)

sw = read(
    "frontend/public/sw.js"
)

manifest = json.loads(
    read(
        "frontend/public/"
        "manifest.webmanifest"
    )
)

required_player = [
    "browserGpsFresh",
    "refreshToken={mapRefreshToken}",
    "onUserMapMove={() =>",
    "handleToggleRouteOverview()",
    "Ver todos los nodos",
    "Volver a mi ubicación y seguirme",
    "routeOverviewActive ? '📍' : '🧭'",
]

for item in required_player:
    if item not in player:
        raise SystemExit(
            "ERROR PlayerApp: falta "
            f"{item}"
        )

required_map = [
    "onUserMapMove?: () => void",
    "map.on('dragstart', handleManualMove)",
    "tileLayerRef.current?.redraw()",
    "map.panTo(nextLatLng",
    "refreshToken",
    "const sourceStages",
    "L.latLngBounds(routePoints)",
]

for item in required_map:
    if item not in map_surface:
        raise SystemExit(
            "ERROR MapSurface: falta "
            f"{item}"
        )

required_offline = [
    "cacheMissionMapTiles",
    "cacheFieldProofAssets",
    "fetchFieldProofs",
    "Juego offline",
    "Preparar juego offline",
    "Guardar progreso",
    "Sincronizar",
]

for item in required_offline:
    if item not in panel + pwa:
        raise SystemExit(
            "ERROR offline: falta "
            f"{item}"
        )

if manifest.get("display") != "standalone":
    raise SystemExit(
        "ERROR: display PWA incorrecto"
    )

if "fullscreen" not in manifest.get(
    "display_override",
    [],
):
    raise SystemExit(
        "ERROR: falta preferencia fullscreen"
    )

cache_name = (
    "saga-player-shell-v550-rpg-viewfinder"
)

if (
    cache_name not in pwa or
    cache_name not in sw
):
    raise SystemExit(
        "ERROR: cachés PWA no coinciden"
    )

print(
    "Map/offline recovery guard passed."
)
