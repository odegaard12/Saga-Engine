# -*- coding: utf-8 -*-
"""Revisión del 19/10/2026: sincronización y consumo de datos con mala cobertura.

Lado del móvil (se EJECUTA la lógica TS con tests/js/sincronizacion_19_10.cjs):
- la cola sube comprimida con gzip;
- Background Sync sólo se registra sin cobertura o si falla la subida (no en cada evento);
- con el candado de la cola cogido (el SW subiendo) la página no sube la misma cola;
- las fotos esperan a que suban los avances y no salen con «ahorro de datos»;
- la mochila que viajó con la cola no vuelve a subir aparte;
- con nodos en cola el avance va directo al móvil sin esperar a la red;
- la pantalla de éxito no espera a releer la partida;
- la caja negra sube tras un latido bueno.

Lado del servidor: `leer_cuerpo_json` acepta gzip, con tope de lo descomprimido.

Sin Node o sin frontend/node_modules, la parte JS se salta.
"""
import gzip
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
from backend.app.runtime import entradas

RAIZ = Path(__file__).resolve().parent.parent
ARNES = RAIZ / "tests" / "js" / "sincronizacion_19_10.cjs"


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


def test_la_cola_sube_comprimida(js):
    c = js["colaComprimida"]
    assert c["recibidos"] == [{"gzip": True, "eventos": 3, "mochila": False}]
    assert c["subidos"] == 3 and c["quedan"] == 0


def test_background_sync_solo_sin_cobertura_o_tras_fallo(js):
    s = js["syncDeFondo"]
    # 25/10 (auditoría): también con red. Un avance que fallaba por tiempo con la red «buena» quedaba sin registro y,
    # guardado el móvil, no subía; el candado de la cola evita la doble subida que motivó quitarlo el 19/10.
    assert s["conRed"] == 1, "con red también se registra"
    assert s["sinRed"] == 2
    assert s["trasFallo"] == 3


def test_con_el_candado_cogido_la_pagina_no_sube(js):
    c = js["candadoDeLaCola"]
    assert c["pedidos"] == [{"nombre": "saga-cola", "ifAvailable": True}]
    assert c["ocupado"] == {"subidas": 0, "quedan": 1}
    assert c["libre"] == {"subidas": 1, "quedan": 0}


def test_las_fotos_esperan_a_los_avances_y_al_ahorro_de_datos(js):
    assert js["fotosTrasLosAvances"] == {"conCola": 0, "ahorro": 0, "libre": 1}


def test_la_mochila_que_viajo_con_la_cola_no_sube_aparte(js):
    recibidos = js["mochilaUnaVez"]
    assert len(recibidos) == 1 and recibidos[0]["mochila"] is True


def test_con_nodos_en_cola_el_avance_no_espera_a_la_red(js):
    a = js["avanceConCola"]
    assert a["r"] is True, "se quedaba en «Avanzando…» esperando a subir la cola"
    assert a["avance"] is False
    assert a["enCola"] == 2


def test_el_exito_no_espera_a_releer_la_partida(js):
    assert js["exitoSinReleer"]["r"] is True


def test_la_caja_negra_sube_tras_un_latido_bueno(js):
    assert js["bitacoraTrasLatido"] == {"enEspera": 0, "trasLatido": 1}


# ---------------------------------------------------------------- servidor


def test_el_servidor_acepta_la_cola_en_gzip(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    client = TestClient(main.app)
    main.clear_player_rate_limits()
    assert client.get("/api/game/PLAYER%201").status_code == 200

    cuerpo = json.dumps(
        {"user": "PLAYER 1", "events": [{"type": "qr_scanned", "source": "qr", "node_id": "node-01", "payload": {}}]}
    ).encode()
    r = client.post(
        "/api/events/sync",
        content=gzip.compress(cuerpo),
        headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["accepted"] == 1


def test_un_gzip_roto_es_400():
    with pytest.raises(HTTPException) as e:
        entradas.descomprimir_gzip(b"esto no es gzip", 1000)
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        entradas.descomprimir_gzip(gzip.compress(b'{"a": 1}')[:-6], 1000)
    assert e.value.status_code == 400


def test_un_gzip_que_descomprimido_pasa_el_tope_es_413():
    bomba = gzip.compress(b" " * (entradas.MAX_DESCOMPRIMIDO + 10))
    assert len(bomba) < 10_000
    with pytest.raises(HTTPException) as e:
        entradas.descomprimir_gzip(bomba, entradas.MAX_DESCOMPRIMIDO)
    assert e.value.status_code == 413
    assert entradas.descomprimir_gzip(gzip.compress(b'{"a": 1}'), 100) == b'{"a": 1}'


def test_la_bomba_por_la_ruta_tambien_es_413(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    client = TestClient(main.app)
    r = client.post(
        "/api/events/sync",
        content=gzip.compress(b" " * (entradas.MAX_DESCOMPRIMIDO + 10)),
        headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
    )
    assert r.status_code == 413
