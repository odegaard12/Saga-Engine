# -*- coding: utf-8 -*-
"""El orden de la clasificación, el mismo en el servidor y en el móvil, con casos compartidos.

shared/clasificacion_casos.json trae jugadores y el orden esperado. Se pasan por
`player_timers.clave_de_clasificacion` (panel de Tiempos, exportación) y por
`ordenarClasificacion` de clasificacion.ts (lo que ven los jugadores, vía
tests/js/clasificacion_casos.cjs). Los casos con `diverge` son diferencias
conocidas y sin decidir: se fija lo que hace hoy cada lado.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.runtime import player_timers

RAIZ = Path(__file__).resolve().parent.parent
CASOS = json.loads((RAIZ / "shared" / "clasificacion_casos.json").read_text(encoding="utf-8"))["casos"]
IDS = [c["nombre"] for c in CASOS]


def _esperado(caso, lado):
    return caso["diverge"][lado] if "diverge" in caso else caso["orden"]


@pytest.fixture(scope="module")
def orden_ts():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "clasificacion_casos.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    return json.loads(proceso.stdout)


def test_los_casos_estan_bien_formados():
    assert len(IDS) == len(set(IDS))
    for caso in CASOS:
        usuarios = sorted(j["user"] for j in caso["jugadores"])
        assert ("orden" in caso) != ("diverge" in caso), caso["nombre"]
        for orden in ([caso["orden"]] if "orden" in caso else caso["diverge"].values()):
            assert sorted(orden) == usuarios, caso["nombre"]


@pytest.mark.parametrize("caso", CASOS, ids=IDS)
def test_python_ordena_como_dicen_los_casos(caso):
    ordenados = sorted(caso["jugadores"], key=player_timers.clave_de_clasificacion)
    assert [j["user"] for j in ordenados] == _esperado(caso, "python")


@pytest.mark.parametrize("caso", CASOS, ids=IDS)
def test_el_movil_ordena_como_dicen_los_casos(caso, orden_ts):
    assert orden_ts["hoja"][caso["nombre"]] == _esperado(caso, "ts")
    # La pantalla final da el mismo puesto que la hoja.
    assert orden_ts["final"][caso["nombre"]] == _esperado(caso, "ts")


@pytest.mark.parametrize("caso", [c for c in CASOS if "diverge" in c], ids=[c["nombre"] for c in CASOS if "diverge" in c])
def test_las_divergencias_conocidas_siguen_siendo_distintas(caso):
    # Si un día se igualan las reglas, este caso pasa a `orden` en el JSON.
    assert caso["diverge"]["python"] != caso["diverge"]["ts"]
