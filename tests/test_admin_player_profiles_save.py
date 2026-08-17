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

    # El login sigue enseñando la foto, pero ya no viaja incrustada.
    #
    # En /api/config las fotos eran 134 KB de los 135 KB que el jugador se
    # bajaba cada treinta segundos, y ese endpoint es publico: ahi estaban las
    # caras de los catorce al alcance de cualquiera. Ahora va la URL de
    # /api/player-avatar, que el navegador y el service worker cachean, y que la
    # pantalla de login resuelve igual (ver getPlayerAvatarUrl).
    publico = client.get("/api/config").json()
    perfil_publico = publico["player_profiles"][0]

    assert perfil_publico["avatar_url"] == "", "la foto no puede ir incrustada aqui"
    assert perfil_publico["avatar_ref"].startswith("/api/player-avatar/ALFA")

    # Y esa URL tiene que servir la foto de verdad.
    imagen = client.get(perfil_publico["avatar_ref"])
    assert imagen.status_code == 200
    assert imagen.headers["content-type"].startswith("image/")


def test_o_config_publico_non_leva_as_fotos(monkeypatch, tmp_path):
    """El peso de /api/config no puede volver a dispararse con las fotos dentro.

    Medido en la Raspberry con catorce jugadores: 135 KB por peticion, cada
    treinta segundos y por movil, o sea 16 MB por hora mandando una y otra vez
    las mismas caras, en el monte y con una barra de cobertura.
    """
    configurar(monkeypatch, tmp_path)
    client = make_client()

    foto = "data:image/jpeg;base64," + ("A" * 8000)
    client.post(
        "/api/admin/save-config",
        json={
            "config": {
                "player_profiles": [
                    {"id": "P%d" % i, "display_name": "P%d" % i, "mode": "solo", "avatar_url": foto}
                    for i in range(14)
                ]
            }
        },
    )

    crudo = client.get("/api/config").content
    assert len(crudo) < 10_000, "el config publico se ha vuelto a llenar de fotos"


def test_o_panel_si_recibe_as_fotos_enteiras(monkeypatch, tmp_path):
    """Si al panel le llegan vacias, guardar borra las fotos de todo el mundo."""
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

    vista = client.post("/api/admin/react-overview", json={}).json()
    assert vista["status"] == "ok"
    assert vista["player_profiles"][0]["avatar_url"] == foto


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
