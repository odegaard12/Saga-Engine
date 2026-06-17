#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def content(path):
    return (ROOT / path).read_text(encoding="utf-8")

def require(path, needle, label):
    text = content(path)
    if needle not in text:
        raise SystemExit(f"ERROR: falta {label} en {path}")

def forbid(path, needle, label):
    text = content(path)
    if needle in text:
        raise SystemExit(f"ERROR: permanece {label} en {path}")

require(
    "frontend/src/player/offline/missionPack.ts",
    "client_event_id: event.id",
    "client_event_id de IndexedDB",
)

require(
    "frontend/src/player/offline/localFirst.ts",
    "failedById",
    "conservación de eventos rechazados",
)

forbid(
    "frontend/src/player/offline/localFirst.ts",
    "fallbackIds",
    "borrado masivo de cola por fallback",
)

require(
    "frontend/src/player/PlayerApp.tsx",
    "window.addEventListener('online', refresh)",
    "sincronización al recuperar conexión",
)

require(
    "frontend/src/player/PlayerApp.tsx",
    "syncPendingOfflineEvents(user)",
    "sync de cola IndexedDB",
)

require(
    "frontend/src/player/PlayerApp.tsx",
    "flushOfflineEvents(user)",
    "sync de cola localStorage",
)

require(
    "frontend/src/player/PlayerApp.tsx",
    "const unlockPosition",
    "posición GPS exclusiva para desbloqueo",
)

require(
    "frontend/src/player/PlayerApp.tsx",
    "browserGpsFresh",
    "caducidad de GPS",
)

require(
    "frontend/src/player/PlayerApp.tsx",
    "gpsAccuracyAcceptable",
    "control de precisión GPS",
)

forbid(
    "frontend/src/main.tsx",
    "installDebugGeolocationShim",
    "shim global de GPS debug",
)

shell_cache = None

for path, prefix in [
    (
        "frontend/src/player/offline/pwaShell.ts",
        "const PLAYER_SHELL_CACHE = '",
    ),
    (
        "frontend/public/sw.js",
        "const CACHE_NAME = '",
    ),
]:
    text = content(path)
    start = text.find(prefix)
    if start < 0:
        raise SystemExit(f"ERROR: no se encontró caché en {path}")

    start += len(prefix)
    end = text.find("'", start)
    value = text[start:end]

    if shell_cache is None:
        shell_cache = value
    elif value != shell_cache:
        raise SystemExit(
            "ERROR: pwaShell y sw.js usan cachés distintas"
        )

print("Offline/GPS hardening guard passed.")
print(f"Cache PWA: {shell_cache}")
