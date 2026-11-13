# -*- coding: utf-8 -*-
"""Caducidad de los rastros GPS (13/11): apagada por defecto, cuenta sin borrar y sólo se enciende con BORRAR."""
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-rastros-1311-"))

import pytest  # noqa: E402

from backend.app.runtime import caducidad_de_rastros as cad  # noqa: E402
from backend.app.storage import match_log_store, sqlite_store  # noqa: E402

AHORA = time.time()


def _iso(dias_atras: float) -> str:
    return (datetime.fromtimestamp(AHORA, tz=timezone.utc) - timedelta(days=dias_atras)).isoformat()


@pytest.fixture
def bases(tmp_path):
    eventos = str(tmp_path / "events.sqlite")
    registro = str(tmp_path / "match_log.sqlite")
    sqlite_store.init_sqlite_schema(eventos)
    # eventos: rastros viejo y nuevo, y un avance viejo con GPS en su evidencia, y otro nuevo.
    for id_, tipo, dias, payload in [
        ("e-pista-vieja", "position_track", 40, {"samples": [{"lat": 1, "lon": 2}]}),
        ("e-pista-nueva", "position_track", 3, {"samples": [{"lat": 1, "lon": 2}]}),
        ("e-avance-viejo", "node_completed", 40, {"client_event_id": "c1", "evidence": {"gps": {"lat": 1, "lon": 2}}}),
        ("e-avance-nuevo", "node_completed", 3, {"client_event_id": "c2", "evidence": {"gps": {"lat": 1, "lon": 2}}}),
    ]:
        sqlite_store.append_sqlite_event(
            eventos, {"id": id_, "type": tipo, "status": "synced", "source": "mobile", "created_at": _iso(dias), "user": "ana", "payload": payload}
        )
    for tipo, dias in [("position_sample", 40), ("position_sample", 2), ("position_track", 40), ("advance", 40)]:
        match_log_store.append_entry(registro, event_type=tipo, user="ana", payload={"lat": 1}, created_at=_iso(dias), client_created_at=_iso(dias))
    return eventos, registro


def test_apagada_por_defecto_y_se_enciende_por_entorno_o_ajuste(monkeypatch):
    monkeypatch.delenv(cad.VARIABLE_DE_ENTORNO, raising=False)
    assert cad.activa({}) is False and cad.activa(None) is False
    assert cad.activa({cad.CLAVE_DE_AJUSTE: False}) is False
    assert cad.activa({cad.CLAVE_DE_AJUSTE: True}) is True
    assert cad.activa({cad.CLAVE_DE_AJUSTE: "true"}) is False  # sólo un booleano de verdad
    monkeypatch.setenv(cad.VARIABLE_DE_ENTORNO, "1")
    assert cad.activa({}) is True


def test_contar_dice_que_se_borraria_y_no_borra(bases):
    eventos, registro = bases
    antes = cad.contar(30, AHORA, eventos=eventos, registro=registro)
    assert antes["eventos_position_track"] == 1
    assert antes["eventos_con_coordenadas"] == 1  # el avance viejo (el rastro viejo cuenta aparte)
    assert antes["registro_position_sample"] == 1 and antes["registro_position_track"] == 1
    assert antes["total"] == 4
    # Contar dos veces da lo mismo: no tocó nada.
    assert cad.contar(30, AHORA, eventos=eventos, registro=registro) == antes
    assert match_log_store.count_entries(registro) == 4


def test_sin_plazo_no_hay_caducidad(bases):
    eventos, registro = bases
    assert cad.contar(0, AHORA, eventos=eventos, registro=registro)["total"] == 0
    assert cad.caducar(0, AHORA, eventos=eventos, registro=registro)["total"] == 0
    assert match_log_store.count_entries(registro) == 4


def test_caducar_borra_solo_lo_viejo_y_deja_el_avance(bases):
    eventos, registro = bases
    hecho = cad.caducar(30, AHORA, eventos=eventos, registro=registro)
    assert hecho["total"] == 4
    # Registro: queda la muestra nueva y el avance (viejo, pero no es un rastro).
    tipos = sorted(e["type"] for e in match_log_store.list_entries(registro, limit=50))
    assert tipos == ["advance", "position_sample"], tipos
    with sqlite_store.sqlite_connection(eventos) as conn:
        ids = {f["id"]: f["payload_json"] for f in conn.execute("SELECT id, payload_json FROM events").fetchall()}
    assert "e-pista-vieja" not in ids and "e-pista-nueva" in ids
    assert "evidence" not in ids["e-avance-viejo"] and "c1" in ids["e-avance-viejo"]  # el evento se queda sin coordenadas
    assert "evidence" in ids["e-avance-nuevo"]
    # Una segunda pasada ya no encuentra nada.
    assert cad.caducar(30, AHORA, eventos=eventos, registro=registro)["total"] == 0


def test_el_ajuste_del_panel_exige_borrar_para_encenderse(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    import main
    from ruta_de_proba import preparar_mision

    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.delenv(cad.VARIABLE_DE_ENTORNO, raising=False)
    c = TestClient(main.app)

    # Sin confirmación (o con otra palabra) no se enciende.
    for cuerpo in ({"position_expiry_enabled": True}, {"position_expiry_enabled": True, "position_expiry_confirm": "borrar ya"}):
        r = c.post("/api/admin/save-config", json={"config": cuerpo})
        assert r.status_code == 400 and r.json()["detail"] == "invalid_position_expiry_enabled", r.text
    assert cad.activa(main.load_config()) is False
    # Guardar otra cosa no la enciende por sorpresa.
    assert c.post("/api/admin/save-config", json={"config": {"map_zoom": 14}}).status_code == 200
    assert cad.activa(main.load_config()) is False
    # Con BORRAR sí; y apagarla no pide nada.
    r = c.post("/api/admin/save-config", json={"config": {"position_expiry_enabled": True, "position_expiry_confirm": "BORRAR"}})
    assert r.status_code == 200, r.text
    assert cad.activa(main.load_config()) is True
    assert c.post("/api/admin/save-config", json={"config": {"map_zoom": 15}}).status_code == 200
    assert cad.activa(main.load_config()) is True  # seguir encendida sin volver a confirmar
    assert c.post("/api/admin/save-config", json={"config": {"position_expiry_enabled": False}}).status_code == 200
    assert cad.activa(main.load_config()) is False


def test_el_endpoint_cuenta_y_no_borra(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    import main
    from ruta_de_proba import preparar_mision

    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    c = TestClient(main.app)
    r = c.post("/api/admin/rastros-caducidad", json={})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["status"] == "ok" and cuerpo["activa"] is False and cuerpo["dias"] == main.dias_de_retencion(main.load_config())
    assert set(cuerpo["se_borraria"]) >= {"eventos_position_track", "registro_position_sample", "total"}
