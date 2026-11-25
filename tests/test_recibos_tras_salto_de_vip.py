# -*- coding: utf-8 -*-
"""Tras un salto de la VIP a la otra Pi (réplica de hasta 5 min), el móvil repone lo que el servidor ya no tiene.

Auditoría 24/11 («15 jugadores»). Dos mitades:
- servidor: con `behind`, `/api/events/sync` dice en qué nivel está (`server_level`), y un recibo repuesto se acepta
  como un avance sin cobertura (con su hora de entonces) aunque llegue desordenado con el que estaba atascado;
- móvil (tests/js/recibos_24_11.cjs, missionPack.ts tal cual): guarda un recibo de cada avance aceptado, los repone
  UNA vez en la cola con su id y su hora originales cuando el servidor va por detrás, y la cola queda vacía.

El recorrido completo con quince jugadores y averías está en tests/test_ruta_15_jugadores.py.
"""
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-recibos-vip-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
USUARIO = "PLAYER 1"
CODIGOS = ["OK", "SAGA_QR_1", "OK", "OK", "OK", "OK"]


def _hace(minutos):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutos)).isoformat().replace("+00:00", "Z")


def _avance(nivel, minutos, cid=None):
    return {
        "client_event_id": cid or f"cola-{nivel}",
        "type": "node_completed",
        "source": "offline_queue",
        "node_id": str(101 + nivel),
        "payload": {"code": CODIGOS[nivel], "level_before": nivel, "level_after": nivel + 1,
                    "time_spent_ms": 20_000, "local_created_at": _hace(minutos)},
    }


def test_el_servidor_dice_desde_donde_y_acepta_los_recibos_repuestos(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    # La réplica de la .103: el jugador en el nodo 2, aunque en la titular ya iba por el 4.
    for nivel in range(2):
        assert cliente.post("/api/advance", json={"user": USUARIO, "code": CODIGOS[nivel], "level_before": nivel}).json()["status"] == "ok"

    detras = cliente.post("/api/events/sync", json={"user": USUARIO, "events": [_avance(4, 1)]}).json()["events"][0]
    assert detras["error"] == "behind" and detras["server_level"] == 2

    # El móvil repone los recibos de 2 y 3 (con su hora de hace 6 y 4 min) detrás del atascado: todo entra en orden.
    tanda = [_avance(4, 1), _avance(2, 6, "recibo-2"), _avance(3, 4, "recibo-3")]
    estados = [e["status"] for e in cliente.post("/api/events/sync", json={"user": USUARIO, "events": tanda}).json()["events"]]
    assert sorted(estados) == ["synced"] * 3, estados
    assert main.get_player_progress_level(USUARIO, 0) == 5
    nodos = main.load_player_timers()[USUARIO]["nodos"]
    assert {"2", "3", "4"} <= set(nodos)


def test_un_recibo_de_antes_de_un_reinicio_no_resucita(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    monkeypatch.setattr(main, "player_progress_reset_at", lambda user: int(datetime.now(timezone.utc).timestamp() * 1000))
    evento = cliente.post("/api/events/sync", json={"user": USUARIO, "events": [_avance(0, 10, "recibo-0")]}).json()["events"][0]
    assert evento["status"] == "ignored" and evento["error"] == "stale_before_reset"
    assert main.get_player_progress_level(USUARIO, 0) == 0


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    proceso = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "recibos_24_11.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=240, cwd=str(RAIZ),
    )
    assert proceso.returncode == 0, proceso.stderr[-3000:]
    datos = json.loads(proceso.stdout)
    errores = {k: v["__error"] for k, v in datos.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return datos


def test_el_movil_repone_una_vez_con_su_id_y_su_hora(js):
    c = js["saltoDeVip"]
    assert c["primera"] == {"synced": 0, "failed": 1}
    niveles = [nivel for nivel, _id, _hora in c["enCola"]]
    assert niveles == [3, 1, 2], "el atascado y los recibos desde el nivel del servidor (el 0 ya lo tenía)"
    ids = {nivel: cid for nivel, cid, _hora in c["enCola"]}
    assert ids[1] == c["idOriginalDelNodo1"], "con el mismo client_event_id: si el servidor sí lo tenía, es un eco"
    assert ids[2] == "A:recibo:1:abc"
    assert [hora for nivel, _cid, hora in c["enCola"] if nivel == 2] == ["2026-11-24T10:00:00.000Z"]
    assert c["subidos"] == [[3, False], [1, False], [2, True]], "la hora de entonces viaja como local_created_at"
    assert c["segunda"] == {"synced": 3, "failed": 0} and c["pendientes"] == 0
    assert c["otraVez"] == 0, "cada recibo se repone una sola vez"
    assert c["trasOlvidar"] is None
