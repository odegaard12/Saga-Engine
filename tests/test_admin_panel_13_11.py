# -*- coding: utf-8 -*-
"""13/11: acciones del panel que se aceptaban con datos que no existen, y fichas de jugador que se descartaban en silencio."""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-admin-panel-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import admin  # noqa: E402


@pytest.fixture
def panel(monkeypatch):
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    return c


# ---------------------------------------------------------------------------
# Fichas de jugador: nada se descarta en silencio, y los ids no se distinguen por mayúsculas
# ---------------------------------------------------------------------------

def _ficha(i, **mas):
    return {"id": i, "display_name": i, **mas}


def test_mas_de_60_jugadores_se_avisa_de_los_que_se_quedan_fuera():
    avisos = {}
    perfiles = admin._normalize_incoming_profiles([_ficha(f"J{n}") for n in range(63)], avisos)
    assert len(perfiles) == admin.MAX_PERFILES == 60
    assert avisos == {"perfiles_de_mas": 3}


def test_una_foto_demasiado_grande_se_quita_y_se_dice_de_quien():
    avisos = {}
    grande = "d" * (admin.MAX_AVATAR_CHARS + 1)
    perfiles = admin._normalize_incoming_profiles([_ficha("Ana", avatar_url=grande), _ficha("Luis", avatar_url="x")], avisos)
    assert perfiles[0]["avatar_url"] == "" and perfiles[1]["avatar_url"] == "x"
    assert avisos == {"fotos_demasiado_grandes": ["Ana"]}


def test_ana_y_ANA_son_el_mismo_id_y_el_segundo_se_descarta_con_aviso():
    avisos = {}
    perfiles = admin._normalize_incoming_profiles([_ficha("Ana"), _ficha("ANA"), _ficha("Ana")], avisos)
    assert [p["id"] for p in perfiles] == ["Ana"]
    assert avisos["ids_repetidos"] == ["ANA", "Ana"]


def test_dos_ids_que_ya_estaban_guardados_asi_se_conservan_y_se_avisa_no_se_borra_a_nadie():
    avisos = {}
    perfiles = admin._normalize_incoming_profiles(
        [_ficha("Luis"), _ficha("luis")], avisos, existentes={"Luis", "luis"}
    )
    assert [p["id"] for p in perfiles] == ["Luis", "luis"]
    assert avisos == {"ids_parecidos": ["luis"]}
    # Pero uno NUEVO que choca con uno guardado no entra.
    avisos = {}
    perfiles = admin._normalize_incoming_profiles([_ficha("Luis"), _ficha("LUIS")], avisos, existentes={"Luis"})
    assert [p["id"] for p in perfiles] == ["Luis"] and avisos == {"ids_repetidos": ["LUIS"]}


def test_sin_avisos_la_llamada_antigua_sigue_valiendo():
    assert admin._normalize_incoming_profiles("no es lista") is None
    assert [p["id"] for p in admin._normalize_incoming_profiles([_ficha("A"), _ficha("B")])] == ["A", "B"]


def test_guardar_ajustes_devuelve_lo_descartado(panel, monkeypatch):
    monkeypatch.setattr(main, "save_config", lambda cfg: None)
    r = panel.post("/api/admin/save-config", json={"config": {"player_profiles": [_ficha(f"J{n}") for n in range(62)]}})
    assert r.status_code == 200, r.text
    assert r.json()["descartados"] == {"perfiles_de_mas": 2}
    limpio = panel.post("/api/admin/save-config", json={"config": {"player_profiles": [_ficha("A"), _ficha("B")]}})
    assert "descartados" not in limpio.json()


# ---------------------------------------------------------------------------
# Jugadores y objetos que no existen
# ---------------------------------------------------------------------------

def test_reiniciar_o_restaurar_un_id_inventado_da_404_y_no_deja_estado_fantasma(panel):
    r = panel.post("/api/reset", json={"user": "NO EXISTE"})
    assert r.status_code == 404 and r.json()["detail"] == "unknown profile"
    r = panel.post("/api/admin/player/restore-node", json={"user": "NO EXISTE"})
    assert r.status_code == 404
    assert "NO EXISTE" not in (main.load_player_progress() or {})


def test_reiniciar_un_jugador_que_existe_sigue_funcionando(panel):
    assert panel.post("/api/reset", json={"user": "PLAYER 1"}).status_code == 200


def test_dar_un_objeto_con_un_id_absurdo_se_rechaza(panel):
    for malo in ("x" * 81, "con\x00nulo", "salto\nde linea", ""):
        r = panel.post("/api/admin/profile-action", json={"profile_id": "PLAYER 1", "action": "give_item:" + malo})
        assert r.status_code == 400 and r.json()["detail"] in ("invalid item id", "invalid action"), malo


def test_dar_un_objeto_escrito_a_mano_se_entrega_y_se_avisa_de_que_ningun_nodo_lo_da(panel):
    r = panel.post("/api/admin/profile-action", json={"profile_id": "PLAYER 1", "action": "give_item:objeto_inventado"})
    assert r.status_code == 200, r.text
    assert r.json()["objeto_conocido"] is False
    # Quitarlo no lleva la marca (sólo `give_item` la lleva).
    r = panel.post("/api/admin/profile-action", json={"profile_id": "PLAYER 1", "action": "remove_item:objeto_inventado"})
    assert r.status_code == 200 and "objeto_conocido" not in r.json()
