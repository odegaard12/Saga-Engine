# -*- coding: utf-8 -*-
"""Auditoría 23/10 (rendimiento): SQLite abría y cerraba una conexión en cada
llamada -unas veinte por latido- y la clave de misión se leía cuatro veces por
petición dentro del bucle de eventos.

Ahora hay una conexión por hilo y por fichero, y una copia en memoria de los
documentos (`app_documents`) que se valida con la fecha de la fila. Aquí se fija
que eso no trae fugas ni datos viejos: cada base tiene su conexión, un cambio
hecho desde otra conexión se ve enseguida, un fichero sustituido se reabre, y
cambiar la clave de misión invalida la copia.
"""
import asyncio
import os
import sqlite3
import tempfile
import threading

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-conexiones-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.storage import sqlite_store  # noqa: E402


def _conexion(ruta):
    with sqlite_store.sqlite_connection(str(ruta)) as conn:
        return conn


def _en_otro_hilo(funcion):
    resultado = {}

    def correr():
        try:
            resultado["valor"] = funcion()
        except BaseException as error:  # noqa: BLE001 - se relanza en el hilo del test
            resultado["error"] = error

    hilo = threading.Thread(target=correr)
    hilo.start()
    hilo.join()
    if "error" in resultado:
        raise resultado["error"]
    return resultado.get("valor")


# ---------------------------------------------------------------------------
# Una conexión por hilo y por fichero
# ---------------------------------------------------------------------------

def test_la_misma_base_en_el_mismo_hilo_reutiliza_la_conexion(tmp_path):
    ruta = tmp_path / "una.sqlite3"
    sqlite_store.init_sqlite_schema(str(ruta))
    assert _conexion(ruta) is _conexion(ruta)


def test_cada_base_tiene_su_conexion_y_no_se_mezclan(tmp_path):
    """Los tests cambian de base entre casos: la conexión va por ruta."""
    a, b = str(tmp_path / "a.sqlite3"), str(tmp_path / "b.sqlite3")
    sqlite_store.set_sqlite_player_level(a, "PLAYER 1", 3)

    assert _conexion(a) is not _conexion(b)
    assert sqlite_store.load_sqlite_game_state(b) == {}
    assert sqlite_store.load_sqlite_game_state(a) == {"PLAYER 1": 3}


def test_cada_hilo_tiene_su_conexion(tmp_path):
    ruta = tmp_path / "hilos.sqlite3"
    sqlite_store.init_sqlite_schema(str(ruta))
    assert _en_otro_hilo(lambda: _conexion(ruta)) is not _conexion(ruta)


def test_lo_que_escribe_otro_hilo_se_ve_al_momento(tmp_path):
    ruta = str(tmp_path / "fresca.sqlite3")
    sqlite_store.set_sqlite_player_level(ruta, "PLAYER 1", 1)
    assert sqlite_store.get_sqlite_player_level(ruta, "PLAYER 1") == 1  # deja la conexión abierta

    _en_otro_hilo(lambda: sqlite_store.set_sqlite_player_level(ruta, "PLAYER 1", 5))

    assert sqlite_store.get_sqlite_player_level(ruta, "PLAYER 1") == 5


def test_una_lectura_repetida_no_abre_conexiones(tmp_path, monkeypatch):
    ruta = str(tmp_path / "sin_aperturas.sqlite3")
    sqlite_store.load_sqlite_positions(ruta)

    abiertas = []
    real = sqlite3.connect
    monkeypatch.setattr(sqlite3, "connect", lambda *a, **k: abiertas.append(a) or real(*a, **k))
    for _ in range(5):
        sqlite_store.load_sqlite_positions(ruta)
        sqlite_store.load_sqlite_document(ruta, "config", {})

    assert abiertas == []


def test_un_fichero_sustituido_se_reabre(tmp_path, monkeypatch):
    """La réplica recibe la base con un `mv` encima: si cambia la huella del
    fichero, la conexión vieja (que seguiría leyendo el borrado) se cambia."""
    ruta = str(tmp_path / "huella.sqlite3")
    sqlite_store.init_sqlite_schema(ruta)
    vieja = _conexion(ruta)

    real = sqlite_store._huella_fichero
    monkeypatch.setattr(sqlite_store, "_huella_fichero", lambda r: ("otro", real(r)))

    nueva = _conexion(ruta)
    assert nueva is not vieja
    with pytest.raises(sqlite3.ProgrammingError):
        vieja.execute("SELECT 1")  # cerrada, no olvidada abierta


@pytest.mark.skipif(os.name == "nt", reason="en Windows no se puede sustituir un fichero abierto")
def test_un_mv_encima_de_la_base_se_lee_la_nueva(tmp_path):
    ruta = str(tmp_path / "saga.sqlite3")
    otra = str(tmp_path / "llegada.sqlite3")
    sqlite_store.set_sqlite_player_level(ruta, "PLAYER 1", 1)
    sqlite_store.set_sqlite_player_level(otra, "PLAYER 1", 7)
    assert sqlite_store.get_sqlite_player_level(ruta, "PLAYER 1") == 1

    sqlite_store.cerrar_conexiones()  # la que llega viene cerrada, como la del rsync
    sqlite_store.set_sqlite_player_level(ruta, "PLAYER 2", 0)  # la vieja vuelve a estar abierta
    os.replace(otra, ruta)

    assert sqlite_store.get_sqlite_player_level(ruta, "PLAYER 1") == 7


def test_cerrar_conexiones_las_cierra_todas_y_se_vuelven_a_abrir(tmp_path):
    """También la de otro hilo vivo (el pool del servidor), que luego abre otra sola."""
    ruta = str(tmp_path / "cerrar.sqlite3")
    sqlite_store.set_sqlite_player_level(ruta, "PLAYER 1", 2)
    abierta, cerradas, fin = threading.Event(), threading.Event(), {}

    def hilo_del_pool():
        fin["vieja"] = _conexion(ruta)
        abierta.set()
        cerradas.wait(10)
        fin["nivel"] = sqlite_store.get_sqlite_player_level(ruta, "PLAYER 1")
        fin["nueva"] = _conexion(ruta)

    hilo = threading.Thread(target=hilo_del_pool)
    hilo.start()
    abierta.wait(10)
    propia = _conexion(ruta)

    assert sqlite_store.cerrar_conexiones() >= 2
    cerradas.set()
    hilo.join(10)

    for conn in (propia, fin["vieja"]):
        with pytest.raises(sqlite3.ProgrammingError):
            conn.execute("SELECT 1")
    assert fin["nivel"] == 2 and fin["nueva"] is not fin["vieja"]
    assert sqlite_store.get_sqlite_player_level(ruta, "PLAYER 1") == 2


# ---------------------------------------------------------------------------
# Transacciones: una conexión reutilizada no puede quedar a medias
# ---------------------------------------------------------------------------

def test_un_fallo_deshace_y_no_deja_el_cerrojo_cogido(tmp_path):
    ruta = str(tmp_path / "fallo.sqlite3")
    sqlite_store.init_sqlite_schema(ruta)

    with pytest.raises(RuntimeError):
        with sqlite_store.sqlite_connection(ruta) as conn:
            conn.execute("INSERT INTO game_state (user, level, updated_at) VALUES ('X', 9, 'ya')")
            raise RuntimeError("a medias")

    assert not _conexion(ruta).in_transaction
    # Otro hilo escribe sin esperar al busy_timeout: nadie tiene el cerrojo.
    _en_otro_hilo(lambda: sqlite_store.set_sqlite_player_level(ruta, "Y", 1))
    assert sqlite_store.load_sqlite_game_state(ruta) == {"Y": 1}


def test_anidadas_solo_confirma_la_de_fuera(tmp_path):
    ruta = str(tmp_path / "anidada.sqlite3")
    sqlite_store.init_sqlite_schema(ruta)

    with pytest.raises(RuntimeError):
        with sqlite_store.sqlite_connection(ruta) as fuera:
            fuera.execute("INSERT INTO game_state (user, level, updated_at) VALUES ('A', 1, 'ya')")
            with sqlite_store.sqlite_connection(ruta) as dentro:
                assert dentro is fuera
                dentro.execute("INSERT INTO game_state (user, level, updated_at) VALUES ('B', 2, 'ya')")
            raise RuntimeError("falla después del bloque de dentro")

    assert sqlite_store.load_sqlite_game_state(ruta) == {}


# ---------------------------------------------------------------------------
# Copia en memoria de los documentos
# ---------------------------------------------------------------------------

def test_un_documento_repetido_no_se_vuelve_a_decodificar(tmp_path, monkeypatch):
    ruta = str(tmp_path / "doc.sqlite3")
    sqlite_store.save_sqlite_document(ruta, "config", {"players": ["A"]})
    sqlite_store.load_sqlite_document(ruta, "config", {})

    decodificados = []
    real = sqlite_store._json_loads_any
    monkeypatch.setattr(sqlite_store, "_json_loads_any", lambda *a: decodificados.append(1) or real(*a))
    for _ in range(5):
        assert sqlite_store.load_sqlite_document(ruta, "config", {}) == {"players": ["A"]}

    assert decodificados == []


def test_cada_lectura_devuelve_un_objeto_nuevo(tmp_path):
    """`load_config` modifica lo que recibe: eso no puede ensuciar la copia."""
    ruta = str(tmp_path / "mutable.sqlite3")
    sqlite_store.save_sqlite_document(ruta, "config", {"players": ["A"], "map": {"zoom": 13}})

    primera = sqlite_store.load_sqlite_document(ruta, "config", {})
    primera["players"].append("INTRUSO")
    primera["map"]["zoom"] = 1

    assert sqlite_store.load_sqlite_document(ruta, "config", {}) == {"players": ["A"], "map": {"zoom": 13}}


def test_guardar_invalida_la_copia(tmp_path):
    ruta = str(tmp_path / "guardar.sqlite3")
    sqlite_store.save_sqlite_document(ruta, "config", {"v": 1})
    assert sqlite_store.load_sqlite_document(ruta, "config", {}) == {"v": 1}

    sqlite_store.save_sqlite_document(ruta, "config", {"v": 2})
    assert sqlite_store.load_sqlite_document(ruta, "config", {}) == {"v": 2}


def test_un_cambio_de_otro_proceso_se_ve(tmp_path):
    """Un script o la réplica escriben con su propia conexión: lo delata `updated_at`."""
    ruta = str(tmp_path / "fuera.sqlite3")
    sqlite_store.save_sqlite_document(ruta, "config", {"v": 1})
    assert sqlite_store.load_sqlite_document(ruta, "config", {}) == {"v": 1}

    ajena = sqlite3.connect(ruta)
    ajena.execute(
        "UPDATE app_documents SET value_json = ?, updated_at = ? WHERE key = 'config'",
        ('{"v": 2}', "2099-01-01T00:00:00+00:00"),
    )
    ajena.commit()
    ajena.close()

    assert sqlite_store.load_sqlite_document(ruta, "config", {}) == {"v": 2}


def test_un_documento_borrado_vuelve_al_defecto(tmp_path):
    ruta = str(tmp_path / "borrado_doc.sqlite3")
    sqlite_store.save_sqlite_document(ruta, "mission_auth", {"salt": "s"})
    assert sqlite_store.load_sqlite_document(ruta, "mission_auth", {}) == {"salt": "s"}

    with sqlite_store.sqlite_connection(ruta) as conn:
        conn.execute("DELETE FROM app_documents WHERE key = 'mission_auth'")

    assert sqlite_store.load_sqlite_document(ruta, "mission_auth", {"defecto": 1}) == {"defecto": 1}


# ---------------------------------------------------------------------------
# Clave de misión: la copia se invalida al cambiarla, y nada toca el bucle
# ---------------------------------------------------------------------------

@pytest.fixture
def con_clave(monkeypatch, tmp_path):
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(
        main.admin_auth_security,
        "hash_password",
        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations),
    )
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "ADMIN_SESSIONS_DB", str(tmp_path / "admin_sessions.json"))
    main.set_mission_password("clave uno")
    return TestClient(main.app)


def _pedir(cliente, cookie):
    return cliente.get("/api/no-existe", headers={"Cookie": "%s=%s" % (main.MISSION_COOKIE, cookie)})


def test_cambiar_la_clave_invalida_la_copia_y_la_cookie_vieja(con_clave):
    vieja = main._mission_cookie_value()
    assert _pedir(con_clave, vieja).status_code == 404  # pasa la puerta: la ruta no existe

    main.set_mission_password("clave dos")

    assert main.check_mission_password("clave dos")
    assert not main.check_mission_password("clave uno")
    assert _pedir(con_clave, vieja).status_code == 401
    assert _pedir(con_clave, main._mission_cookie_value()).status_code == 404


def test_quitar_la_clave_abre_la_puerta_al_momento(con_clave):
    assert _pedir(con_clave, "").status_code == 401
    main.set_mission_password("")
    assert _pedir(con_clave, "").status_code == 404


def test_la_cookie_se_renueva_con_el_valor_de_la_clave_actual(con_clave):
    respuesta = _pedir(con_clave, main._mission_cookie_value())
    assert respuesta.cookies.get(main.MISSION_COOKIE) == main._mission_cookie_value()


def test_la_puerta_no_lee_el_almacen_desde_el_bucle_de_eventos(con_clave, monkeypatch):
    en_el_bucle = []
    real = sqlite_store.load_sqlite_document

    def espia(*args, **kwargs):
        try:
            asyncio.get_running_loop()
            en_el_bucle.append(args[1])
        except RuntimeError:
            pass  # en un hilo del pool: bien
        return real(*args, **kwargs)

    monkeypatch.setattr(sqlite_store, "load_sqlite_document", espia)
    monkeypatch.setattr(main._runtime_store, "load_sqlite_document", espia)

    assert _pedir(con_clave, main._mission_cookie_value()).status_code == 404
    assert _pedir(con_clave, "mala").status_code == 401
    assert en_el_bucle == []
