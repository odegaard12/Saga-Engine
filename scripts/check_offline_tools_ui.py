#!/usr/bin/env python3

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


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
    "Descargar juego offline",
    "Actualizar juego offline",
    "Guardar avance actual",
    "Sincronizar ahora",
    "syncPendingOfflineEvents",
    "flushOfflineEvents",
    "QR / objetos",
]

for item in required_panel:
    if item not in panel:
        raise SystemExit(
            f"ERROR: falta en el panel offline: {item}"
        )

if "queueOfflineEvent" in panel:
    raise SystemExit(
        "ERROR: Guardar avance genera "
        "un evento offline artificial"
    )

if "OfflineSyncPanel" in hud:
    raise SystemExit(
        "ERROR: PlayerHud todavía usa "
        "la tarjeta offline antigua"
    )

if "maxHeight: 'min(84dvh, 760px)'" not in hud:
    raise SystemExit(
        "ERROR: Herramientas no tiene "
        "la altura ampliada"
    )

required_browser_adjustments = [
    "getMobileBrowserChromeLift",
    "return standalone ? 0 : 22",
    "138 + browserChromeLift",
]

for item in required_browser_adjustments:
    if item not in player:
        raise SystemExit(
            f"ERROR: falta ajuste del navegador: {item}"
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
        "ERROR: pwaShell y service worker "
        "usan cachés diferentes"
    )

print("Offline tools UI guard passed.")
print("Legacy OfflineSyncPanel: retained but unused.")
print("Cache PWA:", pwa_cache)
