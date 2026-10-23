#!/usr/bin/env python3
"""Migra los niveles guardados a la tabla `superados` (entrega 1 de «progreso por id»).

Uso:  python scripts/migrar_superados.py [--data-dir DIR] [--sin-copia]

Hace antes una copia de la base (API de backup de SQLite) y de game_timers.json,
inventory.json y rechazos_de_avance.json en DIR/copias_superados/, y migra en una
sola transacción. Es idempotente y, si algún jugador no cuadra, no cambia nada.
El servidor ejecuta lo mismo solo al arrancar si la marca no está.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.runtime import superados_migracion as mig  # noqa: E402
from backend.app.storage.sqlite_store import resolve_sqlite_path  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data-dir", default=os.getenv("SAGA_DATA_DIR") or "data")
    ap.add_argument("--sin-copia", action="store_true", help="no hacer la copia previa (solo para pruebas)")
    args = ap.parse_args(argv)

    data_dir = os.path.abspath(args.data_dir)
    db = os.getenv("SAGA_SQLITE_DB") or resolve_sqlite_path(data_dir)
    ids = mig.ids_de_la_mision(db, data_dir)
    try:
        with open(os.path.join(data_dir, "game_timers.json"), encoding="utf-8") as f:
            timers = json.load(f)
    except (OSError, ValueError):
        timers = {}

    if not args.sin_copia:
        print("Copia previa en", mig.hacer_copias(db, data_dir))
    try:
        print(mig.migrar(db, ids, timers))
    except mig.MigracionIncoherente as error:
        print("NO migrado (rollback):", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
