# -*- coding: utf-8 -*-
"""12/11/2026 (Óscar): «mejorar cómo se muestran los personajes en el mapa: opacidad, rendimiento sobre todo, fallos,
que no quede forzado».

- El reparto no se rehace si no cambia nada de lo que lo decide (cada fix del GPS parado lo repetía entero).
- La forma del racimo y las rejillas de búsqueda se calculan una vez (dependen sólo de cuántos / del zoom).
- Con retratos, el racimo va algo girado y fijo por grupo (sin filas de regla), sin solaparse.
- En 3D el aro del suelo es fino y semitransparente; el de quien está sin conexión, más tenue.
Simulación en tests/js/pulido_12_11.cjs.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


def leer(p):
    return Path(p).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "pulido_12_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_la_forma_del_racimo_se_guarda_y_escala(datos):
    assert datos["escala"] and datos["repetible"]


def test_el_racimo_de_retratos_va_girado_sin_solaparse_y_no_baila(datos):
    assert datos["estable"], "el mismo grupo, el mismo giro"
    assert datos["separacion"] >= 0.93, datos
    assert datos["filasDeRegla"] == 0, datos


def test_el_reparto_no_se_rehace_sin_cambios():
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "firmaPlanRef" in mapa and "if (firma === firmaPlanRef.current || enGesto)" in mapa and "PLAN_EN_GESTO_MS" in mapa
    jug = leer(SRC / "components" / "jugadoresEnMapa.ts")
    assert "rejillaDeSitios(" in jug and "formasDeRacimo" in jug


def test_aro_fino_semitransparente_y_tenue_sin_conexion():
    capa = leer(SRC / "avatares3d" / "mixamo" / "capaAvatares.ts")
    assert "OPACIDAD_ARO" in capa and "tenue" in capa and "geometriaAroCanto" not in capa
