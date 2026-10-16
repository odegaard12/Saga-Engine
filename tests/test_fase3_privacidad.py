# -*- coding: utf-8 -*-
"""Auditoría 15/10/2026, fase 3: privacidad.

- Quien termina la ruta deja de guardar posición: se borra al terminar y el latido ya no anota coordenadas.
- Las fotos de las pruebas (con sus coordenadas y nota) caducan a los N días del panel (30 por defecto, 0 = nunca).
- El panel borra una prueba concreta.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-fase3-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import field_proofs as fotos  # noqa: E402
from backend.app.routers import game  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
DIA = 86400


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "")
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    return TestClient(main.app)


def _foto(proof_id, creada):
    fotos.init_field_proof_schema()
    conn = fotos.connect_runtime_sqlite()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO field_proofs
            (id, user, display_name, stage_id, stage_title, lat, lon, note, image_filename, media_type, created_at,
             visibility, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (proof_id, USUARIO, USUARIO, "1", "nodo", 42.35, -8.66, "nota", f"{proof_id}.jpg", "image/jpeg", creada,
             "team", "active"),
        )
        conn.commit()
    finally:
        conn.close()
    ruta = fotos.resolve_field_proofs_dir() / f"{proof_id}.jpg"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_bytes(b"\xff\xd8 foto")
    return ruta


def _fila(proof_id):
    conn = fotos.connect_runtime_sqlite()
    try:
        return dict(conn.execute("SELECT status, lat, lon, note FROM field_proofs WHERE id = ?", (proof_id,)).fetchone())
    finally:
        conn.close()


def test_las_pruebas_caducan_y_las_nuevas_se_quedan(cliente):
    ahora = 2_000_000_000
    vieja, nueva = _foto("vieja", ahora - 31 * DIA), _foto("nueva", ahora - 2 * DIA)
    assert fotos.caducar_pruebas(0, ahora) == 0 and vieja.exists()
    assert fotos.caducar_pruebas(30, ahora) == 1
    assert not vieja.exists() and nueva.exists()
    assert _fila("vieja") == {"status": "deleted", "lat": 0, "lon": 0, "note": ""}
    assert _fila("nueva")["status"] == "active"


def test_dias_de_retencion_del_panel():
    assert main.dias_de_retencion({}) == 30
    assert main.dias_de_retencion({"field_proof_retention_days": "7"}) == 7
    assert main.dias_de_retencion({"field_proof_retention_days": 9999}) == 365
    assert main.dias_de_retencion({"field_proof_retention_days": "x"}) == 30


def test_el_panel_borra_una_prueba(cliente, monkeypatch):
    ruta = _foto("una", 1_900_000_000)
    assert cliente.post("/api/admin/field-proofs/delete", json={"id": "una"}).status_code == 403
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data=None: True)
    assert cliente.post("/api/admin/field-proofs/delete", json={"id": "una"}).status_code == 200
    assert not ruta.exists() and _fila("una")["status"] == "deleted"
    assert cliente.post("/api/admin/field-proofs/delete", json={"id": "una"}).status_code == 404


def test_al_terminar_no_queda_posicion(cliente, monkeypatch):
    latido = {"user": USUARIO, "lat": 42.35, "lon": -8.66, "accuracy": 5}
    assert cliente.post("/api/heartbeat", json=latido).status_code == 200
    assert main.get_live_position(USUARIO).get("lat") == 42.35

    main.set_player_progress_level(USUARIO, main.count_runtime_stages())
    game.olvidar_posicion(USUARIO)
    assert main.get_live_position(USUARIO).get("lat") is None

    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    assert cliente.post("/api/heartbeat", json=latido).status_code == 200
    posicion = main.get_live_position(USUARIO)
    assert posicion.get("lat") is None and posicion.get("lon") is None and posicion.get("last_seen")
