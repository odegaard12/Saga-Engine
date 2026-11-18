# -*- coding: utf-8 -*-
"""6.11.2: lado del móvil de B1 (sello de reloj por evento) y B2 (el avance en línea gasta el objeto en la mochila)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
H = 3600e3


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin frontend/node_modules")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "sello_reloj_6_11_2.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=240, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-3000:]
    datos = json.loads(p.stdout)
    assert "__error" not in datos, datos["__error"]
    return datos


def test_cada_evento_lleva_el_desfase_con_el_que_se_creo(js):
    assert abs(js["movilAtrasado2h"] - 2 * H) < 5_000
    assert abs(js["movilAdelantado2h"] + 2 * H) < 5_000


def test_sin_hora_reciente_y_coherente_del_servidor_no_se_sella(js):
    assert js["sinMuestra"] is None
    assert js["muestraVieja"] is None, "una muestra de hace 2 h no es de fiar (el reloj pudo saltar)"
    assert js["muestraDelFuturo"] is None, "recibida «en el futuro»: el reloj del móvil retrocedió"


def test_el_avance_en_linea_gasta_el_objeto_en_la_mochila_local(js):
    assert js["avanceEnLineaGastaElObjeto"] is True
