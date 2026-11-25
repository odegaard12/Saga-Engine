# -*- coding: utf-8 -*-
"""Una respuesta o un código de respaldo con otra tilde u otros espacios es el mismo (auditoría 24/11).

«Pórtico Viejo» se aceptaba sólo así; «portico viejo» o «portico-viejo» dejaban al jugador delante del nodo, y con
poca cobertura no había nadie a quien preguntar. Ahora valen con red (runtime/mision.py) y sin ella (missionPack.ts,
con `hash_canonico`), con la MISMA forma canónica en los dos lados. El aviso interno de los minijuegos sigue sin
valer tecleado.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-codigo-canonico-"))

import pytest  # noqa: E402

from backend.app.runtime import mision  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
TEXTOS = ["Pórtico Viejo", "portico-viejo", " CAMIÑO ", "o'grove", "¿Faro?", "SAGA_01", "ok", "Ça va"]
NODO = {
    "id": 901,
    "title": "Acertijo",
    "lat": 40.5,
    "lon": -3.5,
    "radius": 25,
    "minigame": {"type": "checkpoint", "config": {}},
    "config": {"success_code": "Pórtico Viejo"},
}


def test_con_red_vale_sin_tildes_ni_espacios_y_lo_demas_no():
    for intento in ["Pórtico Viejo", "portico viejo", "PORTICO-VIEJO", "porticoviejo", " Portico  Viejo. "]:
        assert mision.stage_accepts_code(NODO, intento, manual=True), intento
    for intento in ["portico", "porticos viejo", "OK"]:
        assert not mision.stage_accepts_code(NODO, intento, manual=True), intento


def test_el_paquete_lleva_la_forma_canonica_sin_el_codigo_en_claro():
    nodo = mision.normalize_stage(NODO)
    condiciones = mision.exito_para_el_jugador(nodo)["conditions"]
    protegidas = [c for c in condiciones if c.get("hash")]
    assert protegidas and all("value" not in c for c in protegidas)
    assert protegidas[0]["hash_canonico"] == mision.hash_codigo_de_nodo("PORTICOVIEJO", protegidas[0]["salt"])
    assert "PORTICO" not in json.dumps(condiciones, ensure_ascii=False).upper()


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    nodo = mision.normalize_stage(NODO)
    para_el_movil = {**NODO, "success": mision.exito_para_el_jugador(nodo), "config": {}}
    entrada = {"textos": TEXTOS, "nodo": para_el_movil, "intentos": ["portico viejo", "PORTICO-VIEJO", "portico", "OK"]}
    proceso = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "codigo_canonico_24_11.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ),
        env={**os.environ, "SAGA_CANON": json.dumps(entrada, ensure_ascii=False)},
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    assert "__error" not in datos, datos
    return datos


def test_el_movil_canoniza_igual_que_el_servidor(js):
    assert js["canonicos"] == [mision.codigo_canonico(t) for t in TEXTOS]


def test_sin_red_vale_igual(js):
    assert js["sinRed"] == {"portico viejo": True, "PORTICO-VIEJO": True, "portico": False, "OK": False}
