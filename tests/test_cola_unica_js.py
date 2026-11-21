# -*- coding: utf-8 -*-
"""Una sola cola sin red en el móvil, y por su puerta (frontend/src/player/offline/cola.ts).

Se EJECUTA la lógica TS con tests/js/cola_unica.cjs contra el servidor de mentira:
- sin red se guarda y, al volver, sube entero, en orden y con los campos de siempre;
- dos subidas a la vez son una sola petición, y lo encolado durante una subida sale en la siguiente, nunca a la vez;
- la cola vieja de localStorage de un móvil ya instalado pasa a la nueva una vez, con sus ids, sin perder nada
  aunque IndexedDB falle;
- si se pierde la respuesta, se reenvía con los mismos ids y el servidor no aplica nada dos veces.

Sin Node o sin frontend/node_modules, se salta.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "cola_unica.cjs"


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


def test_sin_red_se_guarda_y_al_volver_sube_en_orden(js):
    c = js["sinRedYAlVolver"]
    assert c["sinRed"] == {"status": "error", "pendientes": 3, "avances": 1}
    assert c["conRed"] == {"status": "ok", "synced": 3, "pendientes": 0}
    assert c["tipos"] == ["qr_scanned", "node_completed", "item_collected"], "en el orden en que se encoló"
    # El protocolo de siempre (team_id va vacío y JSON lo quita).
    assert c["campos"] == ["client_event_id", "node_id", "payload", "source", "type"]
    assert c["mismosIds"], "el reintento lleva los mismos client_event_id"


def test_dos_subidas_a_la_vez_son_una_peticion(js):
    c = js["dosALaVez"]
    assert c["aLaVez"] == {"peticiones": 1, "mismoResultado": True, "synced": 2}
    d = c["detras"]
    # Lo encolado con una subida en marcha no se queda fuera: sale en UNA siguiente, compartida por quien llegó.
    assert d["peticiones"] == 2 and d["segundaYTerceraIguales"] and d["primeraDistinta"]
    assert d["nodos"] == [["3"], ["4"]] and d["pendientes"] == 0
    assert c["maxEnVuelo"] == 1, "nunca dos subidas a la vez"


def test_la_cola_vieja_se_muda_una_vez_sin_perder_nada(js):
    c = js["migracion"]
    assert c["conFallo"] == 0 and c["viejaTrasFallo"] == 2, "si IndexedDB falla, se queda en la vieja"
    assert c["pendientes"] == 2 and c["otraVez"] == 2, "una vez, sin duplicar"
    assert c["viejaVacia"] == 0 and c["restoIntacto"]
    assert c["subida"] == {"status": "ok", "synced": 2, "quedan": 0}
    assert c["ids"] == ["evt_viejo_1", "evt_viejo_2"], "con su client_event_id: el servidor reconoce lo ya aplicado"
    assert c["tipos"] == ["qr_scanned", "manual_code"] and c["codigos"] == ["Q3", "M3"]
    assert c["marcados"]


def test_respuesta_perdida_se_reenvia_sin_duplicar(js):
    c = js["respuestaPerdida"]
    assert c["perdida"] == "error" and c["pendientesTrasPerder"] == 2
    assert c["reenvio"] == {"status": "ok", "synced": 2}
    assert c["peticiones"] == 2 and c["mismosIds"], "la cola vacía no vuelve a mandar nada"
    assert c["aplicados"] == 2 and c["quedan"] == 0
