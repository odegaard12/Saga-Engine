# -*- coding: utf-8 -*-
"""A3 y A5 de la caza de fallos del 30/09/2026 (parte del servidor).

A3. `/api/admin/save-config` hacía `data.get("config") or {}` y contestaba «ok» a
cualquier cuerpo sin cambiar nada: el panel probaba tres formas distintas y daba
por bueno el primer «ok» aunque no se hubiera guardado nada. Ahora sólo vale
`{"config": {...}}`; lo demás es un 400 `missing_config`.

A5. La ficha de cada nodo (`react-overview`) no devolvía los campos que el
normalizador de `signal_hunt` tira: el requisito de objeto, el código de
emergencia, el premio, la tarjeta QR. El editor los enseñaba vacíos y, al
guardar, los perdía. Y un nodo con `answer` antiguo ignoraba `config.success_code`.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ficha-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime.admin_overview import admin_stage_summary  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# A3: save-config exige {"config": {...}}
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "cuerpo",
    [
        {},
        {"site_name": "Sin envolver"},
        {"data": {"site_name": "En data"}},
        {"config": None},
        {"config": "texto"},
        {"config": ["lista"]},
        {"config": 5},
    ],
)
def test_save_config_sin_config_da_400_missing_config_y_no_guarda(sitio, cuerpo):
    antes = main.load_config().get("site_name")

    resposta = sitio.post("/api/admin/save-config", json=cuerpo)

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "missing_config"
    assert main.load_config().get("site_name") == antes


def test_save_config_con_config_guarda_de_verdad(sitio):
    resposta = sitio.post("/api/admin/save-config", json={"config": {"site_name": "Mision nueva"}})

    assert resposta.status_code == 200 and resposta.json()["status"] == "ok"
    assert main.load_config()["site_name"] == "Mision nueva"


def test_save_config_con_un_cuerpo_que_no_es_un_objeto_da_400(sitio):
    resposta = sitio.post("/api/admin/save-config", content="[1, 2]", headers={"content-type": "application/json"})

    assert resposta.status_code == 400


# ---------------------------------------------------------------------------
# A5: la ficha del nodo devuelve lo que el normalizador tira
# ---------------------------------------------------------------------------

def _nodo_con_campos_extra():
    return {
        "id": 7,
        "title": "Nodo con extras",
        "lat": 40.5,
        "lon": -3.5,
        "radius": 30,
        "minigame": {"type": "signal_hunt", "config": {"game_id": "simple_checkpoint"}},
        "config": {
            "game_id": "simple_checkpoint",
            "required_item_id": "llave",
            "required_item_quantity": 2,
            "required_item_label": "Llave vieja",
            "success_code": "EMERGENCIA-7",
            "reward_item_id": "mapa",
            "reward_item_label": "Mapa",
            "qr_card_title": "Tarjeta del nodo",
            "clue_text": "resto de mapa_mudo: se descarta",
            "campo_libre_del_organizador": {"a": 1},
        },
        "requires_item": True,
        "consume_required_item": True,
        "required_item_id": "llave",
        "answer": "VIEJO",
    }


def _ficha(sitio, nodo):
    main.save_stages(main.STAGES_DB, [nodo])
    resumen = sitio.post("/api/admin/react-overview", json={}).json()
    return resumen["stages"][0]


def test_la_ficha_devuelve_los_campos_de_config_que_el_normalizador_tiraba(sitio):
    config = _ficha(sitio, _nodo_con_campos_extra())["config"]

    for clave, valor in {
        "required_item_id": "llave",
        "required_item_quantity": 2,
        "required_item_label": "Llave vieja",
        "success_code": "EMERGENCIA-7",
        "reward_item_id": "mapa",
        "reward_item_label": "Mapa",
        "qr_card_title": "Tarjeta del nodo",
    }.items():
        assert config.get(clave) == valor, clave
    # Política keep_unknown del registro: lo que el panel no conoce se conserva...
    assert config["campo_libre_del_organizador"] == {"a": 1}
    # ...salvo los restos de OTRO juego de la misma familia (aquí, de mapa_mudo).
    assert "clue_text" not in config


def test_la_ficha_devuelve_los_campos_sueltos_del_nodo_y_el_requisito_normalizado(sitio):
    ficha = _ficha(sitio, _nodo_con_campos_extra())

    assert ficha["requires_item"] is True and ficha["consume_required_item"] is True
    assert ficha["required_item_id"] == "llave"
    assert ficha["answer"] == "VIEJO"
    assert ficha["requirements"]["items"][0]["item_id"] == "llave"
    assert ficha["has_manual_fallback"] is True


def test_la_ficha_sigue_conservando_lo_que_ya_llevaba(sitio):
    ficha = _ficha(sitio, _nodo_con_campos_extra())

    assert ficha["id"] == 7 and ficha["title"] == "Nodo con extras"
    assert ficha["type"] == "signal_hunt" and ficha["lat"] == 40.5
    assert ficha["config"]["game_id"] == "simple_checkpoint"
    assert "messages" in ficha and "config_summary" in ficha


def test_sin_el_nodo_original_la_ficha_es_la_de_siempre():
    """El resumen puro (como en las pruebas viejas) no cambia de forma."""
    normalizado = {
        "id": "n1", "version": 2,
        "presentation": {"title": "Faro", "content": ""},
        "location": {"lat": 42.1, "lon": -8.8, "radius_m": 30},
        "interaction": {"type": "signal_hunt", "config": {}},
    }

    ficha = admin_stage_summary(normalizado, 0)

    assert ficha["id"] == "n1" and "required_item_id" not in ficha
    assert ficha["requirements"] == {"items": []}


def test_un_nodo_con_answer_antiguo_tambien_acepta_config_success_code():
    nodo = {
        "id": 8, "title": "Legado", "lat": 40.5, "lon": -3.5, "radius": 20,
        "answer": "VIEJO",
        "minigame": {"type": "signal_hunt", "config": {}},
        "config": {"success_code": "NUEVO"},
    }
    normalizado = main.normalize_stage(nodo)

    valores = [c["value"] for c in normalizado["success"]["conditions"] if c["kind"] == "answer"]
    assert valores == ["VIEJO", "NUEVO"]
    assert main.stage_accepts_code(normalizado, "nuevo", manual=True), "el código que ve el organizador en el editor"
    assert main.stage_accepts_code(normalizado, "viejo", manual=True), "y el antiguo, como en el móvil"
    assert not main.stage_accepts_code(normalizado, "otro", manual=True)


def test_el_codigo_de_emergencia_del_editor_avanza_el_nodo_en_el_servidor(sitio):
    main.save_stages(
        main.STAGES_DB,
        [{
            "id": 9, "title": "Legado", "lat": 40.5, "lon": -3.5, "radius": 20, "answer": "VIEJO",
            "minigame": {"type": "signal_hunt", "config": {}},
            "config": {"success_code": "NUEVO"},
        }],
    )
    main.set_player_progress_level(USUARIO, 0)
    assert sitio.get("/api/game/PLAYER%201").status_code == 200

    resposta = sitio.post("/api/advance", json={"user": USUARIO, "code": "NUEVO", "manual": True})

    assert resposta.json()["status"] == "ok" and resposta.json()["level"] == 1


def test_un_nodo_sin_config_success_code_conserva_solo_su_answer():
    nodo = {"id": 1, "title": "x", "lat": 1.0, "lon": 1.0, "radius": 5, "answer": "SOLO",
            "minigame": {"type": "signal_hunt", "config": {}}, "config": {}}

    valores = [c["value"] for c in main.normalize_stage(nodo)["success"]["conditions"] if c["kind"] == "answer"]

    assert valores == ["SOLO"]


def test_una_config_que_no_es_un_objeto_no_rompe_los_codigos():
    nodo = {"id": 1, "title": "x", "lat": 1.0, "lon": 1.0, "radius": 5, "answer": "A",
            "minigame": {"type": "signal_hunt", "config": {}}, "config": ["no soy un dict"]}

    assert main.normalize_stage(nodo)["success"]["conditions"][-1] == {"kind": "answer", "value": "A"}
