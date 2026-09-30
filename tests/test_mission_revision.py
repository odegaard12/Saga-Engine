# -*- coding: utf-8 -*-
"""Contrato 5 con el jugador: `mission_revision`.

Una cadena en `/api/config` y en `/api/game/{user}` que cambia cuando cambia
CUALQUIER cosa que el jugador se baja para la misión: contenido y coordenadas de
los nodos, la versión de la proyección por jugador, las fotos (de los nodos y de
los jugadores), el mapa (centro y zoom) y la red de caminos. La pantalla de carga
la compara con la que guardó para decidir «misión cambiada».
"""
import os
import re
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-revmision-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import mision  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    main._HUELLA_DE_NODOS_EN_MEMORIA.clear()
    main.save_config({"site_name": "Prueba", "map_center": [40.5, -3.5], "map_zoom": 12})
    return TestClient(main.app)


def _config(cliente):
    return cliente.get("/api/config").json()["mission_revision"]


def _partida(cliente):
    return cliente.get("/api/game/PLAYER%201").json()["mission_revision"]


def test_config_y_partida_traen_la_misma_huella_de_16_hex(sitio):
    revision = _config(sitio)

    assert re.fullmatch(r"[0-9a-f]{16}", revision)
    assert _partida(sitio) == revision


def test_es_estable_mientras_no_cambia_nada_de_lo_que_se_baja(sitio):
    inicial = _config(sitio)

    # Jugar no cambia la misión: ni avanzar, ni el latido, ni un texto de la portada.
    main.set_player_progress_level(USUARIO, 2)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    sitio.get("/api/game/PLAYER%201")
    main.save_config({"site_name": "Otro titulo", "story_text": "otra historia", "map_center": [40.5, -3.5], "map_zoom": 12})

    assert _config(sitio) == inicial
    assert _partida(sitio) == inicial


def _guardar(mutar):
    nodos = main.load_stages(main.STAGES_DB)
    mutar(nodos)
    main.save_stages(main.STAGES_DB, nodos)


@pytest.mark.parametrize(
    "cambio",
    [
        pytest.param(lambda n: n[1].__setitem__("lat", 41.25), id="coordenadas de un nodo"),
        pytest.param(lambda n: n[0].__setitem__("title", "Titulo nuevo"), id="texto de un nodo"),
        pytest.param(lambda n: n[2].__setitem__("radius", 90), id="radio de un nodo"),
        # La foto de la pista de «mapa mudo» sí viaja al móvil (un checkpoint no la lleva).
        pytest.param(lambda n: n[4]["config"].__setitem__("image_data_url", PNG), id="foto de un nodo"),
        pytest.param(lambda n: n.pop(), id="quitar un nodo"),
    ],
)
def test_cambia_cuando_cambia_el_contenido_de_los_nodos(sitio, cambio):
    antes = _config(sitio)

    _guardar(cambio)

    despues = _config(sitio)
    assert despues != antes
    assert _partida(sitio) == despues, "config y partida no pueden discrepar"


def test_cambia_con_la_version_de_la_proyeccion_por_jugador(sitio, monkeypatch):
    antes = _partida(sitio)

    monkeypatch.setattr(mision, "PROYECCION_VERSION", mision.PROYECCION_VERSION + 1)
    main._HUELLA_DE_NODOS_EN_MEMORIA.clear()

    assert _partida(sitio) != antes
    assert _config(sitio) == _partida(sitio)


def test_cambia_con_la_foto_de_un_jugador(sitio):
    antes = _config(sitio)

    main.save_config({
        "site_name": "Prueba", "map_center": [40.5, -3.5], "map_zoom": 12,
        "player_profiles": [{"id": USUARIO, "display_name": USUARIO, "mode": "solo", "avatar_url": PNG}],
    })

    assert _config(sitio) != antes


def test_cambia_con_el_centro_y_el_zoom_del_mapa(sitio):
    antes = _config(sitio)
    main.save_config({"site_name": "Prueba", "map_center": [40.5, -3.5], "map_zoom": 13})
    con_zoom = _config(sitio)
    main.save_config({"site_name": "Prueba", "map_center": [41.5, -3.5], "map_zoom": 13})

    assert con_zoom != antes
    assert _config(sitio) != con_zoom


def test_cambia_cuando_se_construye_la_red_de_caminos(sitio, tmp_path):
    from backend.app.runtime import road_graph

    antes = _config(sitio)

    fichero = road_graph.ruta_fichero(str(tmp_path))
    fichero.parent.mkdir(parents=True, exist_ok=True)
    fichero.write_text('{"nodos": []}', encoding="utf-8")

    assert _config(sitio) != antes


def test_la_huella_de_los_nodos_se_recalcula_al_guardar_no_a_los_30_segundos(sitio):
    """`/api/config` la pide cada móvil cada 30 s: se cachea, pero un guardado la invalida."""
    antes = _config(sitio)
    assert _config(sitio) == antes  # segunda llamada: sale de la copia en memoria

    _guardar(lambda nodos: nodos[0].__setitem__("title", "Cambiado ya"))

    assert _config(sitio) != antes


def test_un_cambio_que_llega_por_fuera_como_el_rsync_de_la_replica_tambien_se_nota(sitio, tmp_path):
    """La réplica recibe los datos por rsync, no por `save_stages`: la copia en
    memoria se invalida por la firma de lo guardado, no por un contador del proceso."""
    from backend.app.storage.sqlite_store import save_sqlite_stages

    antes = _config(sitio)
    nodos = main.load_stages(main.STAGES_DB)
    nodos[0]["title"] = "Llego por rsync"

    save_sqlite_stages(str(tmp_path / "saga.sqlite3"), nodos)

    assert _config(sitio) != antes
    assert _partida(sitio) == _config(sitio)


def test_sin_contrasena_de_mision_o_con_ella_la_huella_no_filtra_nada_secreto(sitio):
    main.set_mission_password("clave-de-mision-123")
    try:
        revision = TestClient(main.app).get("/api/config").json()["mission_revision"]
        assert re.fullmatch(r"[0-9a-f]{16}", revision)
    finally:
        main.set_mission_password("")
        main.MISSION_UNLOCK_ATTEMPTS.clear()


def test_a_rede_de_camiños_leva_a_sua_version_na_cabeceira_e_na_config(sitio, tmp_path):
    """Si el panel reconstruye la red sin mover la ruta, el móvil guardaba la vieja
    para siempre: ahora compara `road_graph_version` con la cabecera de su copia."""
    import os as _os
    from backend.app.runtime import road_graph

    assert sitio.get("/api/config").json()["road_graph_version"] == ""

    fichero = road_graph.ruta_fichero(str(tmp_path))
    fichero.parent.mkdir(parents=True, exist_ok=True)
    fichero.write_text('{"nodos": []}', encoding="utf-8")
    primera = sitio.get("/api/config").json()["road_graph_version"]
    respuesta = sitio.get("/api/road-graph")
    assert primera and respuesta.headers["x-road-graph-version"] == primera

    fichero.write_text('{"nodos": [1, 2]}', encoding="utf-8")
    estado = fichero.stat()
    _os.utime(fichero, ns=(estado.st_atime_ns, estado.st_mtime_ns + 1_000_000))
    segunda = sitio.get("/api/config").json()["road_graph_version"]
    assert segunda != primera
    assert sitio.get("/api/road-graph").headers["x-road-graph-version"] == segunda
