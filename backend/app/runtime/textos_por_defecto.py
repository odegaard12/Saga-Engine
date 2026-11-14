"""Textos por defecto de la misión (lado servidor): UNA sola fuente, ``shared/textos_por_defecto.json``.

El panel (``frontend/src/shared/textosPorDefecto.ts``) lee el mismo fichero. Antes el servidor ponía «Mission Control»
y «PUT TITLE HERE», el panel «Control de misión» y «Panel de la misión», y el jugador veía los de uno u otro.
"""
from __future__ import annotations

import json
from pathlib import Path

RUTA = Path(__file__).resolve().parents[3] / "shared" / "textos_por_defecto.json"

try:
    TEXTOS_POR_DEFECTO: dict[str, str] = json.loads(RUTA.read_text(encoding="utf-8"))
except (OSError, ValueError):  # sin el fichero el servidor sigue con lo mínimo
    TEXTOS_POR_DEFECTO = {
        "site_name": "SAGA",
        "admin_title": "Control de misión",
        "admin_subtitle": "Panel de control con mapa",
        "login_subtitle": "Acceso protegido",
    }
