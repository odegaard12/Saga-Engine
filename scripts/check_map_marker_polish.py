#!/usr/bin/env python3

from pathlib import Path

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

pwa = read(
    "frontend/src/player/offline/"
    "pwaShell.ts"
)

sw = read(
    "frontend/public/sw.js"
)

start = player.find(
    "function getBottomOverlayStyle("
)

end = player.find(
    "\n}\n",
    start,
)

if start < 0 or end < 0:
    raise SystemExit(
        "ERROR: getBottomOverlayStyle no encontrada"
    )

bottom_block = player[start:end + 2]

if "bottom: mobile ? 0 : 12" not in bottom_block:
    raise SystemExit(
        "ERROR: barra de PWA no está en bottom 0"
    )

required_map = [
    "icon: '●'",
    "sagaNodeBreathe",
    "sagaPlayerAuraBreathe",
    "sagaPlayerPinBreathe",
    "playerMarkerIconKeyRef",
    "selfMarkerIconKey",
    "saga-mission-node-pin--current",
    "prefers-reduced-motion",
]

for item in required_map:
    if item not in map_surface:
        raise SystemExit(
            f"ERROR MapSurface: falta {item}"
        )

for forbidden in [
    "icon: '⭐'",
    "sagaPlayerAuraPulse",
    "50% { opacity: 0.25; }",
]:
    if forbidden in map_surface:
        raise SystemExit(
            "ERROR: permanece diseño antiguo: "
            f"{forbidden}"
        )

cache_name = (
    "saga-player-shell-v513-marker-polish"
)

if (
    cache_name not in pwa or
    cache_name not in sw
):
    raise SystemExit(
        "ERROR: caché PWA incorrecta"
    )

print(
    "Bottom bar and marker polish guard passed."
)
