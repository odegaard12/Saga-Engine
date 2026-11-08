# -*- coding: utf-8 -*-
"""8/11/2026 (Óscar, en casa con dos compañeros: «se solapan los personajes, puto desastre»).

- Tú y los demás en el MISMO punto exacto: nadie encima de nadie, en 2D (retratos) y en 3D (cuerpos).
- Parados, el GPS baila unos metros a cada latido: cada baile rehacía el reparto y todos se deslizaban por separado a
  su sitio nuevo, cruzándose. Con `Anclas` (movimientoSuave.ts) el reparto no cambia mientras nadie se mueve de verdad.
- El mapa usa esas anclas para ti y para los demás, y el gesto de inclinar cambia el modo 2D/3D.
Simulación en tests/js/mismo_sitio_8_11.cjs.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "mismo_sitio_8_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_en_el_mismo_punto_nadie_encima(datos):
    for vista, r in datos["exacto"].items():
        assert r["n"] == 3, (vista, r)
        assert r["min"] >= 0.9, (vista, r)


def test_el_baile_del_gps_no_rehace_el_reparto(datos):
    t = datos["temblor"]
    # Sin anclas el reparto cambiaba en cada latido (la causa del solape: 19 de 19 con ±8 m independientes, un baile
    # peor que el real)…
    assert t["crudo2D"] >= 15 and t["crudo3D"] >= 15, t
    # …con anclas, como mucho una de cada tres veces en 2D y casi nunca en 3D.
    assert t["anclado2D"] <= 6 and t["anclado3D"] <= 2, t
    assert datos["andar"] is True
    assert datos["idempotente"] is True


def test_el_mapa_usa_las_anclas_y_el_gesto():
    mapa = (SRC / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "anclasRef.current.fijar(clave" in mapa
    assert "propio: playerPosition ? anclaPropiaRef.current(playerPosition) : null" in mapa
    assert "yoRef.current.poner(anclaPropiaRef.current(playerPosition)" in mapa
    assert "mapa.on('pitchend', alSoltarInclinacion)" in mapa
    app = (SRC / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert "onTresD={setMapaTresD}" in app
