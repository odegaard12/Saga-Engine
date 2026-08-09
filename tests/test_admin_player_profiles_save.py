"""Guardar jugadores desde el panel tiene que persistir de verdad.

El endpoint de configuracion se armaba campo a campo y nunca copiaba
"players" ni "player_profiles": contestaba {"status": "ok"} y descartaba los
cambios. Los jugadores nuevos desaparecian al recargar y las fotos subidas
desde administracion no llegaban nunca al login, al mapa ni a la clasificacion.
"""
import os
import tempfile

# Antes de importar main: al importarse carga la configuracion, y sin esto iria
# a la base de datos real del despliegue.
os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-players-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def make_client():
    return TestClient(main.app)


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def configuracion_aislada():
    """La configuracion es un fichero compartido por toda la suite.

    Sin devolverla a su sitio, estos tests dejaban la mision con un solo
    jugador y hacian fallar a los de sincronizacion de eventos, que esperan
    encontrar a los suyos.
    """
    original = main.load_config()
    try:
        yield
    finally:
        main.save_config(original)


def configurar(monkeypatch, tmp_path):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)

    main.save_config(
        {
            "site_name": "SAGA",
            "players": ["ALFA"],
            "player_profiles": [{"id": "ALFA", "display_name": "ALFA", "mode": "solo"}],
        }
    )


def test_save_config_persists_new_players(monkeypatch, tmp_path):
    configurar(monkeypatch, tmp_path)
    client = make_client()

    respuesta = client.post(
        "/api/admin/save-config",
        json={
            "config": {
                "players": ["ALFA", "BETA", "GAMMA"],
                "player_profiles": [
                    {"id": "ALFA", "display_name": "ALFA", "mode": "solo"},
                    {"id": "BETA", "display_name": "BETA", "mode": "solo"},
                    {"id": "GAMMA", "display_name": "GAMMA", "mode": "solo"},
                ],
            }
        },
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "ok"

    guardados = [p["id"] for p in main.get_player_profiles(main.load_config())]
    assert guardados == ["ALFA", "BETA", "GAMMA"]


def test_save_config_persists_player_photo(monkeypatch, tmp_path):
    configurar(monkeypatch, tmp_path)
    client = make_client()

    foto = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    client.post(
        "/api/admin/save-config",
        json={
            "config": {
                "player_profiles": [
                    {"id": "ALFA", "display_name": "ALFA", "mode": "solo", "avatar_url": foto}
                ]
            }
        },
    )

    perfil = main.get_player_profiles(main.load_config())[0]
    assert perfil["avatar_url"] == foto

    # Y tiene que salir en el config publico, que es de donde lo lee el login.
    publico = client.get("/api/config").json()
    assert publico["player_profiles"][0]["avatar_url"] == foto


def test_save_config_without_players_keeps_the_saved_ones(monkeypatch, tmp_path):
    """Guardar otra cosa (por ejemplo el mapa) no debe vaciar la lista."""
    configurar(monkeypatch, tmp_path)
    client = make_client()

    client.post("/api/admin/save-config", json={"config": {"site_name": "Otra cosa"}})

    guardados = [p["id"] for p in main.get_player_profiles(main.load_config())]
    assert guardados == ["ALFA"]


def test_save_config_drops_duplicate_ids(monkeypatch, tmp_path):
    """El id es la llave con la que entra el jugador: dos iguales compartirían
    partida sin enterarse."""
    configurar(monkeypatch, tmp_path)
    client = make_client()

    client.post(
        "/api/admin/save-config",
        json={
            "config": {
                "player_profiles": [
                    {"id": "BETA", "display_name": "BETA"},
                    {"id": "BETA", "display_name": "BETA 2"},
                ]
            }
        },
    )

    guardados = [p["id"] for p in main.get_player_profiles(main.load_config())]
    assert guardados == ["BETA"]
