# -*- coding: utf-8 -*-
"""Revisión del 22/10/2026, juego sin cobertura: se EJECUTA la lógica TS (tests/js/sin_cobertura_22_10.cjs).

- Un «vaciar mochila» del panel no tira los nodos hechos sin red ni deja bajar el nivel; un reinicio de progreso sí,
  pero sólo lo anterior a su marca.
- Si el avance no se pudo guardar (sin espacio), el objeto que pide el nodo NO se gasta.
- Sin red, la pegatina se acepta con las mismas formas que con red (guiones, espacios, guiones bajos).

Sin Node o sin frontend/node_modules, se salta.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "sin_cobertura_22_10.cjs"


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(ARNES)], capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ)
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def test_vaciar_la_mochila_no_tira_los_nodos_hechos_sin_red(js):
    for caso in ("mochila", "mochilaTrasOtro"):
        r = js["reinicio"][caso]
        assert r["avances"] == 1, f"{caso}: el avance sin subir tiene que seguir en la cola"
        assert r["total"] == 1, f"{caso}: el evento de mochila anterior a la marca sí se va"
        assert r["bajaNivel"] is False, f"{caso}: vaciar la mochila no deja bajar el nivel"


def test_el_reinicio_de_progreso_tira_solo_lo_anterior(js):
    r = js["reinicio"]["progreso"]
    assert r["bajaNivel"] is True
    assert r["otraVez"] is False, "la misma marca dos veces no es otro reinicio"
    assert r["avances"] == 1, "el avance anterior a la marca se va; el de después, no"
    antiguo = js["reinicio"]["antiguo"]
    assert antiguo == {"bajaNivel": True, "avances": 0, "total": 0}, "sin marcas separadas vale reset_at"


def test_sin_espacio_el_objeto_no_se_gasta(js):
    r = js["objetoSinEspacio"]
    assert r["antes"] == 1
    assert r["lanzo"] is True and r["esCuota"] is True
    assert r["trasFallo"] == 1, "el objeto se gastaba sin avance y el jugador quedaba bloqueado"
    assert r["ok"] is True and r["nivel"] == 1 and r["trasAvanzar"] == 0 and r["avancesEnCola"] == 1


def test_la_pegatina_sin_red_acepta_lo_mismo_que_el_servidor(js):
    r = js["pegatinaSinRed"]
    assert r["hashExacto"] and r["hashGuion"] and r["hashEspacio"]
    assert r["claroGuion"] and r["claroEspacio"]
    assert not r["hashOtro"] and not r["claroOtro"]
