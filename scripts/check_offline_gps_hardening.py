#!/usr/bin/env python3

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (
        ROOT / path
    ).read_text(encoding="utf-8")


def require(
    path: str,
    needle: str,
    label: str,
) -> None:
    if needle not in read(path):
        raise SystemExit(
            f"ERROR: falta {label} en {path}"
        )


def forbid(
    path: str,
    needle: str,
    label: str,
) -> None:
    if needle in read(path):
        raise SystemExit(
            f"ERROR: permanece {label} en {path}"
        )


require(
    "frontend/src/player/offline/"
    "missionPack.ts",
    "client_event_id: event.id",
    "client_event_id de IndexedDB",
)

require(
    "frontend/src/player/offline/"
    "localFirst.ts",
    "failedById",
    "conservación de eventos rechazados",
)

forbid(
    "frontend/src/player/offline/"
    "localFirst.ts",
    "fallbackIds",
    "borrado masivo de cola",
)

player = read(
    "frontend/src/player/PlayerApp.tsx"
)

required_player = [
    "refreshAfterReconnect",
    "window.addEventListener(",
    "'online',",
    "syncPendingOfflineEvents(user)",
    "flushOfflineEvents(user)",
    "const unlockPosition",
    "browserGpsFresh",
    "gpsAccuracyAcceptable",
    "setMapRefreshToken",
]

for item in required_player:
    if item not in player:
        raise SystemExit(
            "ERROR: falta hardening "
            f"en PlayerApp: {item}"
        )

forbid(
    "frontend/src/main.tsx",
    "installDebugGeolocationShim",
    "shim global de GPS debug",
)


def cache_value(
    path: str,
    prefix: str,
) -> str:
    text = read(path)
    start = text.find(prefix)

    if start < 0:
        raise SystemExit(
            f"ERROR: no se encontró caché en {path}"
        )

    start += len(prefix)
    end = text.find("'", start)

    if end < 0:
        raise SystemExit(
            f"ERROR: caché incompleta en {path}"
        )

    return text[start:end]


pwa_cache = cache_value(
    "frontend/src/player/offline/"
    "pwaShell.ts",
    "const PLAYER_SHELL_CACHE = '",
)

sw_cache = cache_value(
    "frontend/public/sw.js",
    "const CACHE_NAME = '",
)

if pwa_cache != sw_cache:
    raise SystemExit(
        "ERROR: pwaShell y sw.js usan "
        "cachés distintas"
    )

print(
    "Offline/GPS hardening guard passed."
)
print("Cache PWA:", pwa_cache)
