# -*- coding: utf-8 -*-
"""14/11: «Cambiar de jugador» (Herramientas) tiene que salir de la partida y dejar elegir a otro.

Fallaba por dos causas a la vez: el botón cerraba la hoja justo antes de navegar (el cierre deja un `history.go(-1)`
con `setTimeout(0)` que cancelaba la navegación) y el repintado de la partida reescribía `saga_remembered_player`
(`getPlayerNameFromLocation`) antes de que la página se descargara, con lo que la portada volvía a entrar en el mismo.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"


def _sin_comentarios(ruta: Path) -> str:
    t = ruta.read_text(encoding="utf-8")
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.DOTALL)
    return re.sub(r"(?m)//.*$", "", t)


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin dependencias del frontend")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "cambiar_jugador_14_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert r.returncode == 0, r.stderr[-2000:]
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_entrar_en_una_partida_la_recuerda(js):
    assert js["nombre"] == "SIM_01" and js["recordadoAlEntrar"] == "SIM_01"


def test_tras_olvidarlo_el_repintado_no_lo_vuelve_a_escribir(js):
    # Sin el arreglo, getPlayerNameFromLocation() lo reescribía en cada repintado y esto era "SIM_01".
    assert js["recordadoTrasRepintar"] is None
    assert js["claveEnAlmacen"] is False


def test_el_jugador_elegido_despues_si_queda_recordado(js):
    # Es otra carga de página: el olvido no se arrastra.
    assert js["otroJugador"] == "PRUEBA02"


def test_el_boton_no_cierra_la_hoja_antes_de_navegar():
    hud = _sin_comentarios(FRONT / "player" / "components" / "PlayerHud.tsx")
    m = re.search(r"onClick=\{\(\) => \{([^}]*cambiar=1[^}]*)\}\}", hud)
    assert m, "no se encuentra el botón «Cambiar de jugador»"
    cuerpo = m.group(1)
    assert "onCloseTools" not in cuerpo
    assert "olvidarJugadorRecordado()" in cuerpo
    assert cuerpo.index("olvidarJugadorRecordado()") < cuerpo.index("cambiar=1")


def test_salir_de_la_pantalla_final_tampoco_vuelve_al_recordado():
    app = _sin_comentarios(FRONT / "player" / "PlayerApp.tsx")
    m = re.search(r"onExit=\{\(\) => \{([^}]*)\}\}", app)
    assert m and "olvidarJugadorRecordado()" in m.group(1) and "location.assign('/')" in m.group(1)
