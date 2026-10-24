# -*- coding: utf-8 -*-
"""24/10: dos cosas del servidor que pide el panel.

- Un cambio de nodo hecho a mano desde el panel («+1 nodo», volver atrás) deja su
  hora en `nivel_cambiado_en_panel_ms`: el «en el nodo desde» del panel tiene que
  reiniciarse con el salto, no seguir contando desde el último avance real.
- `GET /api/field-proofs` pagina con `offset` y dice el `total`: el álbum no veía
  más allá de las 400 fotos más recientes. Sin parámetros, lo de siempre.
"""
import base64
import io
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-panel-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _marca():
    return (main.load_player_timers().get(USUARIO) or {}).get("nivel_cambiado_en_panel_ms")


def test_un_salto_del_panel_deja_su_hora_y_un_avance_normal_no(cliente):
    main.set_player_progress_level(USUARIO, 1)
    assert _marca() is None

    main.set_player_progress_level(USUARIO, 2, desde_admin=True, ts_ms=1_700_000_000_000)
    assert _marca() == 1_700_000_000_000

    main.set_player_progress_level(USUARIO, 1, desde_admin=True, ts_ms=1_700_000_100_000)  # volver atrás también
    assert _marca() == 1_700_000_100_000

    main.set_player_progress_level(USUARIO, 2, ts_ms=1_700_000_200_000)  # avance del jugador: no es del panel
    assert _marca() == 1_700_000_100_000


def test_sin_hora_explicita_el_salto_apunta_ahora(cliente):
    main.set_player_progress_level(USUARIO, 2, desde_admin=True)
    assert _marca() > 1_700_000_000_000


def _subir(cliente, color):
    salida = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(salida, "JPEG")
    uri = "data:image/jpeg;base64," + base64.b64encode(salida.getvalue()).decode("ascii")
    respuesta = cliente.post(
        "/api/field-proofs",
        json={"user": USUARIO, "lat": 40.5, "lon": -3.5, "stage_id": "101", "image_data_url": uri},
    )
    assert respuesta.status_code == 200, respuesta.text


def test_el_album_pagina_con_offset_y_dice_el_total(cliente):
    for color in ((200, 0, 0), (0, 200, 0), (0, 0, 200)):
        _subir(cliente, color)

    todas = cliente.get("/api/field-proofs").json()
    assert len(todas["proofs"]) == 3 and todas["total"] == 3

    primera = cliente.get("/api/field-proofs?limit=2").json()
    segunda = cliente.get("/api/field-proofs?limit=2&offset=2").json()
    assert [p["id"] for p in primera["proofs"]] == [p["id"] for p in todas["proofs"]][:2]
    assert [p["id"] for p in segunda["proofs"]] == [p["id"] for p in todas["proofs"]][2:]
    assert segunda["total"] == 3 and segunda["offset"] == 2

    assert cliente.get("/api/field-proofs?offset=9").json()["proofs"] == []


def test_el_mas_uno_nodo_reinicia_los_minutos_en_el_nodo():
    """24/10: tras un «+1 nodo» del panel, «min en este nodo» cuenta desde el salto, no desde el último avance."""
    from backend.app.routers import admin

    entrada = {"last_advance_at_ms": 1_000_000, "started_at": 500_000, "nivel_cambiado_en_panel_ms": 9_000_000}
    assert admin._en_el_nodo_desde(entrada, "3") == 9_000
    assert admin._en_el_nodo_desde({"last_advance_at_ms": 1_000_000}, "3") == 1_000
