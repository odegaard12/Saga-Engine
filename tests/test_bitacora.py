# -*- coding: utf-8 -*-
"""Caja negra del móvil (19/10/2026): lo que sube el jugador, sin duplicar reenvíos; incidencias y tiempo devuelto."""
import gzip
import json
import os
import tempfile
from datetime import datetime, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-bitacora-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import bitacora  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

UNO = "Xogadora Proba"
SESION_ADMIN = "sesion-admin-de-proba"
T0 = 1_760_000_000_000


@pytest.fixture
def jugador(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path, user=UNO)
    con_fecha = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {
        **con_fecha(), "players": [UNO], "player_profiles": [{"id": UNO, "display_name": UNO, "mode": "solo", "members": []}],
    })
    monkeypatch.setattr(main, "REGISTRO_ANALISIS_DB", str(tmp_path / "registro_analisis.sqlite3"))
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(main, "admin_request_authorized",
                        lambda request, data=None: request.cookies.get(main.ADMIN_SESSION_COOKIE) == SESION_ADMIN)
    main.clear_player_rate_limits()
    cliente = TestClient(main.app)
    assert cliente.get(f"/api/game/{UNO.replace(' ', '%20')}").status_code == 200
    return cliente


def _lote(entradas):
    return {"user": UNO, "s": "ses1", "entries": entradas}


def _caja():
    return [e for e in main.match_log_list_timeline(user=UNO) if e["type"].startswith("app_")]


def test_sube_comprimido_y_un_reenvio_no_duplica(jugador):
    cuerpo = gzip.compress(json.dumps(_lote([
        {"i": 1, "t": T0, "k": "hoja", "n": "n1"},
        {"i": 2, "t": T0 + 1000, "k": "reto_fallo", "n": "n1", "d": {"x": "<b>" * 200}},
        {"i": 3, "t": T0 + 2000, "k": "inventado"},
    ])).encode())
    cabeceras = {"Content-Type": "application/json", "Content-Encoding": "gzip"}
    for _ in range(2):
        r = jugador.post("/api/bitacora", content=cuerpo, headers=cabeceras)
        assert r.status_code == 200 and r.json()["aceptadas"] == 3
    assert sorted(e["type"] for e in _caja()) == ["app_hoja", "app_otro", "app_reto_fallo"]


def test_sin_sesion_de_jugador_no_entra(jugador):
    otro = TestClient(main.app)
    assert otro.post("/api/bitacora", json=_lote([{"i": 1, "t": T0, "k": "hoja"}])).status_code == 403


def _fila(k, ms, **d):
    return {"type": "app_" + k, "occurred_at": datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(), "payload": d}


def test_cierre_con_nodo_abierto_fallo_del_servidor_y_hora_cambiada():
    analisis = bitacora.analizar([
        _fila("hoja", T0, node_id="n1"),
        _fila("reto_fallo", T0 + 60_000),
        _fila("inicio", T0 + 150_000, previo="cerrada_mal"),  # 90 s con la app caída
        _fila("avance_error", T0 + 200_000, estado=503),
        _fila("avance_ok", T0 + 230_000),  # 30 s por el servidor
        _fila("reloj", T0 + 300_000, salto_ms=3_600_000),
    ])
    assert [i["ms"] for i in analisis["incidencias"]] == [90_000, 30_000]
    assert analisis["devolver_ms"] == 120_000
    assert analisis["sospechas"][0]["tipo"] == "reloj"


def test_un_cierre_sin_nodo_abierto_no_devuelve_nada():
    analisis = bitacora.analizar([
        _fila("avance_ok", T0), _fila("inicio", T0 + 600_000, previo="cerrada_mal"),
    ])
    assert analisis["devolver_ms"] == 0


def test_si_salio_de_la_app_y_el_movil_la_cerro_no_se_devuelve():
    analisis = bitacora.analizar([
        _fila("hoja", T0, node_id="n1"), _fila("oculta", T0 + 1000), _fila("inicio", T0 + 300_000, previo="cerrada_mal"),
    ])
    assert analisis["devolver_ms"] == 0


def test_devolver_tiempo_resta_del_total_y_no_se_suma_dos_veces(jugador):
    main.add_player_penalty(UNO, 200_000)
    admin = TestClient(main.app)
    admin.cookies.set(main.ADMIN_SESSION_COOKIE, SESION_ADMIN)
    for _ in range(2):
        assert admin.post("/api/admin/devolver-tiempo", json={"user": UNO, "ms": 60_000}).status_code == 200
    assert main.get_player_total_time_ms(UNO) == 140_000
    assert admin.post("/api/admin/devolver-tiempo", json={"user": "Nadie", "ms": 1}).status_code == 404
    assert TestClient(main.app).post("/api/admin/devolver-tiempo", json={"user": UNO, "ms": 1}).status_code == 403
    assert admin.post("/api/admin/incidencias", json={}).json()["jugadores"][0]["devuelto_ms"] == 60_000
