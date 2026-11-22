# -*- coding: utf-8 -*-
"""22/11: con el mapa quieto en 3D, `latir` ponía el halo a 0,65 y `aplicarModo` (colgado de `styledata`) a 0,6; cada
`setPaintProperty` vuelve a disparar `styledata`: 42 escrituras y 6,3 repintados por segundo sin fin (CPU 42 % a x4)."""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
COMP = RAIZ / "frontend" / "src" / "player" / "components"


def test_el_halo_tiene_un_solo_dueno_en_3d():
    mapa = (COMP / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    modo = mapa[mapa.index("const volcarPendientes = () => {") : mapa.index("aplicarModoRef.current = volcarPendientes")]
    assert "if (capa === CAPA_NODOS_HALO && enTresD && actual !== 0) continue" in modo
    assert "if (actual !== valor) vivo.setPaintProperty(capa, 'icon-opacity', valor)" in modo
    # `latir` sigue latiendo el halo y en reposo vuelve a INTENSIDAD_EN_REPOSO.
    latir = mapa[mapa.index("const latir = () => {") : mapa.index("    latir()\n")]
    assert "poner(vivo, CAPA_NODOS_HALO, 'icon-opacity', monedasRef.current ? 0 : 0.2 + 0.6 * pulso)" in latir
    assert "if (reposo) return INTENSIDAD_EN_REPOSO" in mapa


def test_el_reposo_del_latido_es_la_opacidad_del_modo():
    """Si el valor de reposo de `latir` y el del modo difieren, vuelve la pelea en cuanto algo los enfrente."""
    capas = (COMP / "mapa" / "capas.ts").read_text(encoding="utf-8")
    assert "export const OPACIDAD_DEL_HALO = 0.2 + 0.6 * INTENSIDAD_EN_REPOSO" in capas
    assert capas.index("export const INTENSIDAD_EN_REPOSO =") < capas.index("export const OPACIDAD_DEL_HALO =")
    assert not re.search(r"OPACIDAD_DEL_HALO = [\d.]+\s*$", capas, re.M), "otra vez un número suelto"
