# -*- coding: utf-8 -*-
"""Contrato 4 con el jugador (y A11 de la caza de fallos): las acciones del panel
que BAJAN el nivel de alguien o le QUITAN objetos tienen que llegar al móvil.

El móvil manda sobre su propio progreso (en el monte avanza sin cobertura) y sólo
cede ante una marca: `reset_at`, en milisegundos desde la época, dentro de
`inventory_snapshot` (`GET /api/game/{user}`; guardada en `inventory.json[user]`).
Sin subirla, «✓ Aplicado» era mentira: el móvil ignora los niveles menores que el
suyo y vuelve a subir su mochila vieja.
"""
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-marca-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    main.set_player_progress_level(USUARIO, 3)
    ahora = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    main.save_player_inventory(
        USUARIO,
        {
            "user": USUARIO,
            "updated_at": ahora,
            "items": [
                {"item_id": "llave", "label": "Llave", "quantity": 1},
                {"item_id": "sello", "label": "Sello", "quantity": 1},
            ],
        },
    )
    return TestClient(main.app)


def _marca(cliente, usuario="PLAYER%201"):
    return cliente.get("/api/game/%s" % usuario).json()["inventory_snapshot"].get("reset_at", 0)


def _accion(cliente, accion, usuario=USUARIO):
    resposta = cliente.post("/api/admin/profile-action", json={"profile_id": usuario, "action": accion})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


@pytest.mark.parametrize("accion", ["level_prev", "restore_node", "clear_inventory", "remove_item:llave"])
def test_lo_que_baja_el_nivel_o_quita_objetos_sube_la_marca_reset_at(sitio, accion):
    antes = _marca(sitio)

    corpo = _accion(sitio, accion)

    despues = _marca(sitio)
    assert despues > antes, "el móvil no se enteraría de que el organizador ha cambiado su partida"
    assert corpo["reset_at"] == despues, "la respuesta también dice cuál es la marca"
    assert despues >= int(time.time() * 1000) - 5_000, "es una hora, en milisegundos desde la época"


@pytest.mark.parametrize("accion", ["level_next", "mark_finished", "give_item:cuerda"])
def test_lo_que_solo_da_no_sube_la_marca(sitio, accion):
    """Subir nivel o dar un objeto no debe hacer que el móvil tire lo que ya lleva."""
    antes = _marca(sitio)

    corpo = _accion(sitio, accion)

    assert _marca(sitio) == antes
    assert corpo["reset_at"] is None


def test_quitar_un_objeto_conserva_los_demas_y_no_se_descarta_por_vieja(sitio):
    _accion(sitio, "remove_item:llave")

    items = sitio.get("/api/game/PLAYER%201").json()["inventory_snapshot"]["items"]

    assert [objeto["item_id"] for objeto in items] == ["sello"]


def test_la_mochila_vieja_que_sube_el_movil_despues_no_resucita_lo_quitado(sitio):
    _accion(sitio, "remove_item:llave")
    hace_un_rato = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")

    main.save_player_inventory(
        USUARIO,
        {"user": USUARIO, "updated_at": hace_un_rato, "items": [{"item_id": "llave", "quantity": 1}]},
    )

    guardados = [objeto["item_id"] for objeto in main.load_inventory_state()[USUARIO]["items"]]
    assert "llave" not in guardados


def test_dos_acciones_seguidas_dan_marcas_estrictamente_crecientes(sitio):
    _accion(sitio, "clear_inventory")
    primera = _marca(sitio)
    _accion(sitio, "level_prev")
    segunda = _marca(sitio)

    assert segunda > primera


def test_la_ruta_de_restaurar_nodo_tambien_sube_la_marca(sitio):
    antes = _marca(sitio)

    resposta = sitio.post("/api/admin/player/restore-node", json={"user": USUARIO})

    assert resposta.status_code == 200 and resposta.json()["new_level"] == 2
    assert _marca(sitio) > antes


def test_restaurar_nodo_al_principio_no_toca_nada(sitio):
    main.set_player_progress_level(USUARIO, 0)
    antes = _marca(sitio)

    resposta = sitio.post("/api/admin/player/restore-node", json={"user": USUARIO})

    assert resposta.json() == {"status": "fail", "reason": "already_at_start"}
    assert _marca(sitio) == antes


def test_reiniciar_al_jugador_sigue_dejando_la_marca(sitio):
    antes = _marca(sitio)

    _accion(sitio, "reset_profile")

    assert _marca(sitio) > antes


def test_guardar_la_mision_de_forma_que_alguien_baja_de_nivel_sube_su_marca_y_solo_la_suya(sitio):
    main.set_player_progress_level("PLAYER 2", 1)
    antes_1, antes_2 = _marca(sitio), _marca(sitio, "PLAYER%202")

    # Se borra el 103, el último nodo que había superado PLAYER 1 (nivel 3 -> 2).
    nodos = [n for n in main.load_stages(main.STAGES_DB) if n["id"] != 103]
    resposta = sitio.post("/api/admin/save", json={"stages": nodos})

    assert resposta.status_code == 200
    assert main.get_player_progress_level(USUARIO, 0) == 2
    assert _marca(sitio) > antes_1, "PLAYER 1 bajó de nivel: su móvil tiene que enterarse"
    assert _marca(sitio, "PLAYER%202") == antes_2, "PLAYER 2 no se movió: no se le toca el móvil"


def test_guardar_sin_que_baje_nadie_no_toca_ninguna_marca(sitio):
    antes = _marca(sitio)
    nodos = main.load_stages(main.STAGES_DB)
    nodos[0]["title"] = "Solo cambia un texto"

    assert sitio.post("/api/admin/save", json={"stages": nodos}).status_code == 200

    assert _marca(sitio) == antes


def test_quien_ya_habia_terminado_y_sigue_terminado_no_sube_la_marca(sitio):
    main.set_player_progress_level("PLAYER 2", 6)  # terminó los seis
    antes = _marca(sitio, "PLAYER%202")

    nodos = [n for n in main.load_stages(main.STAGES_DB) if n["id"] != 106]  # ahora son cinco
    assert sitio.post("/api/admin/save", json={"stages": nodos}).status_code == 200

    assert main.get_player_progress_level("PLAYER 2", 0) == 5
    assert _marca(sitio, "PLAYER%202") == antes
