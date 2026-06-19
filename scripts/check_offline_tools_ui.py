#!/usr/bin/env python3

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (
        ROOT / path
    ).read_text(encoding="utf-8")


hud = read(
    "frontend/src/player/components/"
    "PlayerHud.tsx"
)

panel = read(
    "frontend/src/player/components/"
    "MissionPackPanel.tsx"
)

player = read(
    "frontend/src/player/PlayerApp.tsx"
)

pwa = read(
    "frontend/src/player/offline/"
    "pwaShell.ts"
)

sw = read(
    "frontend/public/sw.js"
)

required_panel = [
    "Juego offline",
    "DESCARGAR JUEGO OFFLINE",
    "Guardar avance",
    "Sincronizar",
    "syncPendingOfflineEvents",
    "flushOfflineEvents",
    "cacheMissionMapTiles",
]

for item in required_panel:
    if item not in panel:
        raise SystemExit(
            "ERROR: falta en panel offline: "
            f"{item}"
        )

if "queueOfflineEvent" in panel:
    raise SystemExit(
        "ERROR: Guardar avance genera "
        "un evento artificial"
    )

if "OfflineSyncPanel" in hud:
    raise SystemExit(
        "ERROR: PlayerHud usa la tarjeta antigua"
    )

if "maxHeight: 'min(84dvh, 760px)'" not in hud:
    raise SystemExit(
        "ERROR: Herramientas perdió "
        "su altura ampliada"
    )

required_browser = [
    "getMobileBrowserChromeLift",
    "return standalone ? 0 : 22",
    "138 + browserChromeLift",
]

for item in required_browser:
    if item not in player:
        raise SystemExit(
            "ERROR: falta ajuste navegador: "
            f"{item}"
        )


def cache_value(
    text: str,
    prefix: str,
) -> str:
    start = text.find(prefix)

    if start < 0:
        raise SystemExit(
            f"ERROR: falta declaración {prefix}"
        )

    start += len(prefix)
    end = text.find("'", start)

    if end < 0:
        raise SystemExit(
            f"ERROR: declaración incompleta {prefix}"
        )

    return text[start:end]


pwa_cache = cache_value(
    pwa,
    "const PLAYER_SHELL_CACHE = '",
)

sw_cache = cache_value(
    sw,
    "const CACHE_NAME = '",
)

if pwa_cache != sw_cache:
    raise SystemExit(
        "ERROR: cachés PWA diferentes"
    )

print("Offline tools UI guard passed.")
print("Cache PWA:", pwa_cache)
