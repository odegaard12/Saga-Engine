# -*- coding: utf-8 -*-
"""El código del mapa WebGL, entero: MapSurfaceGL.tsx y las piezas que se sacaron a components/mapa/.

Desde la mejora 5 (21/11) las fuentes y capas (capas.ts), el estilo base (estilo.ts), la guía y los tramos (guia.ts)
y los dibujos de iconos (iconos.ts) viven aparte. Las pruebas que leen el mapa como texto comprueban lo mismo que
antes, sólo que sobre todo el módulo y no sobre un único fichero.
"""
from pathlib import Path

COMP = Path(__file__).resolve().parents[1] / "frontend" / "src" / "player" / "components"


def fuente_del_mapa() -> str:
    piezas = [COMP / "MapSurfaceGL.tsx", *sorted((COMP / "mapa").glob("*.ts"))]
    return "\n".join(p.read_text(encoding="utf-8-sig") for p in piezas)
