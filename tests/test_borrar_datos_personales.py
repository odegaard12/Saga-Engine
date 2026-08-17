# -*- coding: utf-8 -*-
"""Poder borrar lo que SAGA guarda de personas.

SAGA guarda nombres, fotos hechas por los jugadores y rastros GPS: la posición
de cada latido y las coordenadas exactas de cada foto, con su hora y su nodo.
Todo eso se quedaba para siempre y no había forma de limpiarlo desde el panel.

Contra los datos de personas lo que protege de verdad no es el permiso firmado
—que cubre hacer la foto, no guardarla dos años— sino no tener lo que no hace
falta. Sin esto no se puede llevar una ruta a un colegio con la cabeza tranquila.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-borrado-"))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import admin as admin_router  # noqa: E402
from backend.app.routers import field_proofs as fp_router  # noqa: E402


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)

    app = FastAPI()
    app.include_router(admin_router.router)
    app.include_router(fp_router.router)
    return TestClient(app)


def _una_foto():
    """Una foto de campo como las que sube el móvil."""
    fp_router.init_field_proof_schema()
    conn = fp_router.connect_runtime_sqlite()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO field_proofs
            (id, user, display_name, stage_id, stage_title, lat, lon, note,
             image_filename, media_type, created_at, visibility, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                "proof_prueba", "Aroa", "Aroa", "6", "Mámoa do Rei",
                42.3535, -8.6612, "", "proof_prueba.jpg", "image/jpeg",
                1770000000, "team", "active",
            ),
        )
        conn.commit()
    finally:
        conn.close()

    carpeta = fp_router.resolve_field_proofs_dir()
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "proof_prueba.jpg").write_bytes(b"\xff\xd8\xff\xdb no soy una foto de verdad")


def test_sen_confirmacion_so_conta(cliente):
    _una_foto()
    main.upsert_live_position_for_user("Aroa", {"lat": 42.35, "lon": -8.66, "last_seen": 1})

    corpo = cliente.post("/api/admin/datos-personales", json={}).json()

    assert corpo["accion"] == "contar"
    assert corpo["datos"]["fotos"] >= 1
    assert corpo["datos"]["posiciones_gps"] >= 1

    # Y no ha tocado nada.
    seguinte = cliente.post("/api/admin/datos-personales", json={}).json()
    assert seguinte["datos"]["fotos"] == corpo["datos"]["fotos"]


def test_borra_as_fotos_a_fila_e_o_ficheiro(cliente):
    _una_foto()
    carpeta = fp_router.resolve_field_proofs_dir()
    assert (carpeta / "proof_prueba.jpg").exists()

    corpo = cliente.post(
        "/api/admin/datos-personales", json={"confirmacion": "BORRAR"}
    ).json()

    assert corpo["accion"] == "borrar"
    assert corpo["borrado"]["fotos"] >= 1
    assert corpo["queda"]["fotos"] == 0

    # La fila entera, no un "status=deleted": ahí van el nombre y las coordenadas.
    conn = fp_router.connect_runtime_sqlite()
    try:
        assert conn.execute("SELECT COUNT(*) AS n FROM field_proofs").fetchone()["n"] == 0
    finally:
        conn.close()

    assert not (carpeta / "proof_prueba.jpg").exists()


def test_borra_os_rastros_gps(cliente):
    main.upsert_live_position_for_user("Aroa", {"lat": 42.35, "lon": -8.66, "last_seen": 1})
    assert main.load_live_positions()

    cliente.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"})

    assert not main.load_live_positions()


def test_non_toca_a_mision(cliente):
    """Los nodos y las fichas de jugador no son datos personales que sobren."""
    nodos_antes = len(main.get_runtime_stages())
    jugadores_antes = len(main.get_player_profiles(main.load_config()))

    cliente.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"})

    assert len(main.get_runtime_stages()) == nodos_antes
    assert len(main.get_player_profiles(main.load_config())) == jugadores_antes


def test_pide_contrasena(monkeypatch):
    """Sin autorización no se cuenta ni se borra."""
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: False)

    app = FastAPI()
    app.include_router(admin_router.router)

    resposta = TestClient(app).post(
        "/api/admin/datos-personales", json={"confirmacion": "BORRAR"}
    )
    assert resposta.status_code == 403


def test_unha_confirmacion_calquera_non_vale(cliente):
    _una_foto()

    corpo = cliente.post(
        "/api/admin/datos-personales", json={"confirmacion": "si"}
    ).json()

    assert corpo["accion"] == "contar"
    assert corpo["datos"]["fotos"] >= 1
