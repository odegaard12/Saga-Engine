# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S6 y S16: entradas absurdas daban 500.

`/api/advance` con `penalty_ms: Infinity`, `code: 5` o un cuerpo que es una lista
respondía 500 ANTES de comprobar la sesión; `level_before: Infinity` tumbaba
`/api/events/sync` entero (y la cola del jugador se atascaba para siempre); una
cookie con acentos daba 500 en `hmac.compare_digest`; una marca `reset_at` con
basura o unos `items` que no eran una lista abortaban el sync. Aquí se manda
justo eso y se comprueba que el servidor contesta con un código que ya no es 500.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-absurdas-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import entradas, player_events  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
JSON = {"content-type": "application/json"}


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200  # el pase de jugador
    return cliente


def _crudo(cliente, ruta, texto, **kwargs):
    return cliente.post(ruta, content=texto, headers=JSON, **kwargs)


# ---------------------------------------------------------------------------
# /api/advance
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "cuerpo",
    [
        '{"user": "PLAYER 1", "code": "OK", "penalty_ms": Infinity}',
        '{"user": "PLAYER 1", "code": "OK", "penalty_ms": -Infinity}',
        '{"user": "PLAYER 1", "code": "OK", "penalty_ms": NaN}',
        '{"user": "PLAYER 1", "code": "OK", "penalty_ms": 1e999}',
        '{"user": "PLAYER 1", "code": "OK", "level_before": Infinity}',
        '{"user": "PLAYER 1", "code": "OK", "time_spent_ms": Infinity}',
        '{"user": "PLAYER 1", "code": 5}',
        '{"user": "PLAYER 1", "code": ["OK"], "manual": [1]}',
    ],
)
def test_advance_con_numeros_o_tipos_absurdos_no_da_500(cliente, cuerpo):
    resposta = _crudo(cliente, "/api/advance", cuerpo)

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["status"] in {"ok", "fail", "behind"}


@pytest.mark.parametrize("cuerpo", ["[]", '"texto"', "5", "no es json", "", '{"user": '])
def test_advance_con_un_cuerpo_que_no_es_un_objeto_da_400_no_500(cliente, cuerpo):
    resposta = _crudo(cliente, "/api/advance", cuerpo)

    if cuerpo == "":
        # Un cuerpo vacío es «sin datos»: sin usuario no hay pase que valga.
        assert resposta.status_code == 403
    else:
        assert resposta.status_code == 400, resposta.text


def test_advance_sin_sesion_da_403_aunque_los_numeros_sean_absurdos(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    sen_pase = TestClient(main.app)

    resposta = _crudo(sen_pase, "/api/advance", '{"user": "PLAYER 1", "code": "OK", "penalty_ms": Infinity}')

    assert resposta.status_code == 403


# ---------------------------------------------------------------------------
# /api/events/sync
# ---------------------------------------------------------------------------

def test_un_level_before_infinito_no_tumba_a_cola(cliente):
    cuerpo = (
        '{"user": "PLAYER 1", "events": ['
        '{"client_event_id": "a-1", "type": "node_opened", "node_id": "101", "payload": {}},'
        '{"client_event_id": "a-2", "type": "node_completed", "payload": {"code": "OK", "level_before": Infinity, "time_spent_ms": Infinity}},'
        '{"client_event_id": "a-3", "type": "qr_scanned", "payload": {"raw_value": "x", "accuracy": NaN}}'
        "]}"
    )

    resposta = _crudo(cliente, "/api/events/sync", cuerpo)

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["accepted"] == 3
    assert {e["client_event_id"] for e in corpo["events"]} == {"a-1", "a-2", "a-3"}


def test_unha_hora_imposible_nun_evento_non_tumba_a_cola(cliente):
    cuerpo = (
        '{"user": "PLAYER 1", "events": ['
        '{"client_event_id": "h-1", "type": "node_completed", "payload": '
        '{"code": "OK", "level_before": 0, "local_created_at": "0001-01-01T00:00:00Z"}}'
        "]}"
    )

    assert _crudo(cliente, "/api/events/sync", cuerpo).status_code == 200


def test_reset_at_con_basura_e_items_que_no_son_lista_no_abortan_el_sync(cliente):
    main.save_json(main.INVENTORY_DB, {})
    for mochila in (
        '{"user": "PLAYER 1", "reset_at": "basura", "items": [{"item_id": "llave", "quantity": 1}]}',
        '{"user": "PLAYER 1", "reset_at": Infinity, "items": "no es una lista"}',
        '{"user": "PLAYER 1", "items": [5, null, "x", {"item_id": "sello", "quantity": 1e999}, {"sin_id": true}]}',
        '{"user": "PLAYER 1", "items": {"a": 1}}',
    ):
        cuerpo = '{"user": "PLAYER 1", "events": [], "inventory_snapshot": %s}' % mochila
        resposta = _crudo(cliente, "/api/events/sync", cuerpo)
        assert resposta.status_code == 200, (mochila, resposta.text)

    guardada = main.load_inventory_state()[USUARIO]
    assert isinstance(guardada["items"], list)
    assert all(isinstance(objeto, dict) and objeto["item_id"] for objeto in guardada["items"])


def test_las_acciones_del_panel_funcionan_sobre_una_mochila_que_llego_con_basura(cliente, monkeypatch):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    main.save_json(main.INVENTORY_DB, {USUARIO: {"user": USUARIO, "items": "roto", "reset_at": "x"}})

    for accion in ("give_item:llave", "remove_item:llave", "clear_inventory"):
        resposta = cliente.post("/api/admin/profile-action", json={"profile_id": USUARIO, "action": accion})
        assert resposta.status_code == 200, (accion, resposta.text)


def test_sanear_mochila_deja_solo_cosas_con_forma():
    from backend.app.runtime.mochila import sanear_mochila

    limpia = sanear_mochila(
        {
            "user": "PLAYER 1",
            "reset_at": "1e999",
            "items": [{"item_id": "a", "quantity": "3"}, {"item_id": "b", "quantity": float("inf")}, 7],
        }
    )

    assert limpia["reset_at"] == 0
    assert [(o["item_id"], o["quantity"]) for o in limpia["items"]] == [("a", 3), ("b", 1)]
    assert sanear_mochila("no es un dict") == {"items": []}


# ---------------------------------------------------------------------------
# Cookies y JSON
# ---------------------------------------------------------------------------

def test_una_cookie_con_acentos_no_da_500(cliente):
    cookie = "saga_player_session=café.niño".encode("latin-1")

    resposta = cliente.get("/api/state/PLAYER%201", headers={"cookie": cookie})

    assert resposta.status_code == 403


def test_una_cookie_de_mision_con_acentos_no_da_500(cliente, monkeypatch):
    main.set_mission_password("clave-de-mision-123")
    try:
        cookie = "saga_mission=ñandú".encode("latin-1")
        assert cliente.get("/api/config", headers={"cookie": cookie}).status_code == 200
    finally:
        main.set_mission_password("")


def test_el_lector_de_json_convierte_lo_no_finito_en_null():
    assert entradas.cargar_json('{"a": Infinity, "b": [NaN, -Infinity], "c": 1e999, "d": 2.5, "e": 3}') == {
        "a": None,
        "b": [None, None],
        "c": None,
        "d": 2.5,
        "e": 3,
    }


def test_entero_seguro_nunca_lanza():
    assert entradas.entero_seguro(float("inf"), 7) == 7
    assert entradas.entero_seguro(float("nan"), 7) == 7
    assert entradas.entero_seguro("basura", 7) == 7
    assert entradas.entero_seguro(True, 7) == 7
    assert entradas.entero_seguro("12", 0, minimo=0, maximo=10) == 10
    assert entradas.entero_seguro(-5, 0, minimo=0) == 0


def test_el_saneado_de_eventos_no_deja_pasar_nan():
    limpio = player_events.sanitize_event_payload({"acc": float("nan"), "vel": float("inf"), "ok": 3})

    assert limpio == {"acc": None, "vel": None, "ok": 3}


def test_el_listado_del_panel_no_revienta_con_eventos_viejos_con_nan(cliente, monkeypatch):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    main.append_event(main.EVENT_LOG_DB, {"type": "qr_scanned", "user": USUARIO, "payload": {"raw_value": "x"}})

    assert cliente.post("/api/admin/events", json={"limit": 10}).status_code == 200
