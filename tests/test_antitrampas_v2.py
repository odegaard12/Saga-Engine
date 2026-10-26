# -*- coding: utf-8 -*-
"""Antitrampas V2 (26/10).

* La hoja del reto retiene la pantalla mientras está abierta (y sólo ella; el mapa ya no): con la pantalla retenida no
  hay autobloqueo, así que cualquier salida durante el reto cuenta sin exigir un toque reciente.
* El servidor exige al menos 30 s por cada salida que el móvil declara en la evidencia del avance, sin cobrarlas dos
  veces con lo que el móvil ya suma, en línea y por la cola sin cobertura, y sin romper a los móviles viejos.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-antitrampas-v2-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player"
UNO = "PLAYER 1"
S = 1000


def _node(*args):
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin dependencias del frontend")
    r = subprocess.run([node, *args], capture_output=True, text=True, timeout=120, cwd=RAIZ)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


@pytest.fixture(scope="module")
def js():
    return _node(str(RAIZ / "tests" / "js" / "antitrampas_v2.cjs"))


def test_la_pantalla_cuenta_como_retenida_aunque_el_sistema_la_suelte_al_ocultarse(js):
    r = js["retenida"]
    assert r["antes"] is False and r["conLock"] is True
    assert r["alSalirOculta"] is True, "al ocultarse el navegador suelta el bloqueo: aun así estaba retenida al irse"
    assert r["alVolver"] is True and r["tras"] is False


def test_si_la_suelta_el_sistema_con_la_pagina_visible_o_la_rechaza_ya_no_se_fia(js):
    assert js["sueltoVisible"] is False, "ahorro de batería: el bloqueo se perdió y puede haber autobloqueo"
    assert js["rechazada"] is False


def test_con_la_pantalla_retenida_la_salida_cuenta_sin_toque_reciente(js):
    assert js["regla"] == {"retenidaSinToque": True, "sinRetenerSinToque": False, "sinRetenerConToque": True}
    assert js["salidaCuentaRetenida"] is True and js["salidaCuentaNoRetenida"] is False


def test_siguen_sin_contar_las_salidas_cortas_ni_las_de_sin_reto(js):
    assert js["cortaRetenida"] is False and js["sinRetoRetenida"] is False


def _sin_comentarios(ruta):
    t = ruta.read_text(encoding="utf-8")
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.DOTALL)
    return re.sub(r"(?m)//.*$", "", t)


def test_el_cableado_del_cliente():
    hoja = _sin_comentarios(JUGADOR / "components" / "InteractionSheet.tsx")
    mapa = _sin_comentarios(JUGADOR / "components" / "MapSurfaceGL.tsx")
    anti = _sin_comentarios(JUGADOR / "hooks" / "useAntiTrampas.ts")
    assert "useWakeLock(open)" in hoja, "la hoja del reto retiene la pantalla mientras está abierta"
    assert "useWakeLock(" not in mapa, "el mapa ya no la retiene: andando se apaga sola"
    assert "salidaCuenta()" in anti and "hayInteraccionReciente()" not in anti
    # Las salidas viajan con el avance, también el escrito a mano, para que el servidor las exija.
    assert hoja.count("registrarEvidencia(String(currentStage?.id ?? ''), { salidas_app: antiTrampas.salidas })") == 2


# ------------------------------------------------------------------ servidor

def test_penalizacion_minima_exige_treinta_segundos_por_salida():
    assert main.penalizacion_minima(0, evidencia={"salidas_app": 3}) == 90 * S
    assert main.penalizacion_minima(0, evidencia={"salidas_app": 1}) == 30 * S
    # El móvil ya las sumó (más lo de los fallos): se respeta lo que pide, no se cobran dos veces.
    assert main.penalizacion_minima(100 * S, evidencia={"salidas_app": 3}) == 100 * S
    assert main.penalizacion_minima(35 * S, evidencia={"salidas_app": 1}) == 35 * S
    # Móviles viejos o basura: sin cambios.
    assert main.penalizacion_minima(0, evidencia={}) == 0
    assert main.penalizacion_minima(0, evidencia=None) == 0
    assert main.penalizacion_minima(7 * S, evidencia={"salidas_app": "x"}) == 7 * S
    assert main.penalizacion_minima(0, evidencia={"salidas_app": -4}) == 0
    # Tope: 500 salidas no son 4 horas.
    assert main.penalizacion_minima(0, evidencia={"salidas_app": 500}) == 20 * 30 * S
    # Se combina con el mínimo del respaldo (max, no suma).
    assert main.penalizacion_minima(0, manual=True, evidencia={"salidas_app": 3}) == max(main.PENALIZACION_CODIGO_A_MANO_MS, 90 * S)


@pytest.fixture
def c(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.set_player_progress_level(UNO, 2)
    cl = TestClient(main.app)
    assert cl.get("/api/game/PLAYER%201").status_code == 200
    return cl


def _pen():
    return int(main.load_player_timers().get(UNO, {}).get("penalties_ms") or 0)


def test_el_avance_en_linea_cobra_las_salidas_aunque_el_movil_mande_cero(c):
    r = c.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 2, "time_spent_ms": 40000, "penalty_ms": 0, "evidence": {"salidas_app": 2}}).json()
    assert r["status"] == "ok", r
    assert _pen() == 60 * S


def test_el_avance_en_linea_no_las_cobra_dos_veces(c):
    r = c.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 2, "time_spent_ms": 40000, "penalty_ms": 65 * S, "evidence": {"salidas_app": 2}}).json()
    assert r["status"] == "ok", r
    assert _pen() == 65 * S


def test_el_avance_de_un_movil_viejo_sin_el_campo_no_cambia(c):
    r = c.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": 2, "time_spent_ms": 40000, "penalty_ms": 5 * S}).json()
    assert r["status"] == "ok", r
    assert _pen() == 5 * S


def test_por_la_cola_sin_cobertura_tambien(c):
    ev = {"client_event_id": "salidas-1", "type": "node_completed", "payload": {"code": "OK", "level_before": 2, "time_spent_ms": 40000, "penalty_ms": 0, "evidence": {"salidas_app": 3}}}
    r = c.post("/api/events/sync", json={"user": UNO, "events": [ev]}).json()
    assert r["events"][0]["status"] != "failed", r
    assert _pen() == 90 * S
