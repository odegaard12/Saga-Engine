"""06/11: móvil de Óscar, 6.4.1 → 6.4.2. Al acabar la carga, el resumen decía «Falta por bajar: app N» con todo bajado.

El service worker sirve la página VIEJA mientras la carga baja la versión nueva y guarda su lista; la comprobación final
(con la copia de la lista) veía los paquetes de la página vieja fuera de la lista nueva y los daba por faltantes.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]


def _correr():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin typescript")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "resumen_tras_actualizar_6_11.cjs")], capture_output=True, text=True, timeout=120, cwd=RAIZ)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_pagina_vieja_con_la_version_nueva_bajada_no_dice_que_falta_nada():
    d = _correr()
    assert d["paginaViejaConTodoBajado"] == [], "la página que corre no cuenta si la guardada es de la lista"
    assert d["paginaNueva"] == []


def test_si_de_verdad_falta_algo_se_sigue_diciendo():
    d = _correr()
    assert {"/assets/index-nueva.js", "/assets/Mapa-nuevo.js"} <= set(d["nuevaSinBajar"])
    # HTML guardado de otra versión que la copia de la lista: no se puede dar por completa (guarda del 01/11).
    assert d["htmlDeOtraVersion"] == ["/assets/index-otra.js"]


def test_el_resumen_baja_lo_que_falta_y_no_cuenta_los_avatares():
    src = (RAIZ / "frontend" / "src" / "player" / "offline" / "comprobacionFinal.ts").read_text(encoding="utf-8")
    assert "asegurarPaquetesDelJugador(ruta" in src, "con red, lo que falta se baja en la propia pantalla de carga"
    assert "!r.startsWith('/assets/avatares/')" in src, "los avatares son opcionales: no son «app» que falte"
