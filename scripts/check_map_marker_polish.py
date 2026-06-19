#!/usr/bin/env python3

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


player = read("frontend/src/player/PlayerApp.tsx")
map_surface = read("frontend/src/player/components/MapSurface.tsx")
pwa = read("frontend/src/player/offline/pwaShell.ts")
sw = read("frontend/public/sw.js")

start = player.find("function getBottomOverlayStyle(")
end = player.find("\n}\n", start)

if start < 0 or end < 0:
    raise SystemExit("ERROR: getBottomOverlayStyle no encontrada")

bottom_block = player[start:end + 2]

if "bottom: mobile ? 0 : 12" not in bottom_block:
    raise SystemExit("ERROR: barra PWA no conserva bottom 0")

required_map = [
    "#22c55e",
    "#15803d",
    "#f4c95d",
    "#d6a900",
    "#dc4c4c",
    "#b91c1c",
    "icon: '\\u2605'",
    "icon: '\\u{1F512}\\uFE0E'",
    "label: 'Pista QR'",
    "icon: '\\u{1F381}\\uFE0E'",
    "sagaCurrentNodeHalo",
    "saga-mission-node-halo",
    "sagaPlayerAuraBreathe",
    "saga-avatar-pin--self",
    "animation: none !important",
    "playerMarkerIconKeyRef",
    "selfMarkerIconKey",
    "prefers-reduced-motion",
]

for item in required_map:
    if item not in map_surface:
        raise SystemExit(f"ERROR MapSurface: falta {item}")

for forbidden in [
    "sagaPlayerPinBreathe",
    "sagaNodeBreathe",
    "sagaNodeHaloLocked",
    "sagaNodeHaloReady",
    "sagaNodeHaloEngaging",
    "color: '#38bdf8'",
]:
    if forbidden in map_surface:
        raise SystemExit(f"ERROR: permanece diseño antiguo: {forbidden}")

cache_name = "saga-player-shell-v514-node-visuals"

if cache_name not in pwa or cache_name not in sw:
    raise SystemExit("ERROR: caché PWA incorrecta")

print("Bottom bar and marker visuals guard passed.")
