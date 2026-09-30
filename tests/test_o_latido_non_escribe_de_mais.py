# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S1: cada lectura de SQLite era una escritura
con fsync, y `update_json` reescribía el fichero aunque no cambiase nada.

Un latido con `?equipo=1` hacía 14-15 commits de escritura y una reescritura de
JSON, en el bucle de eventos: 15 móviles a un latido cada 5 s dejaban el
servidor medio segundo de cada segundo bloqueado. Aquí se comprueba, con
contadores y no con cronómetros, que ya no.
"""
import os
import sqlite3
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-latido-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.storage import json_store, sqlite_store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"


def _contar_escrituras_json(monkeypatch):
    escrituras = []
    real = json_store._write_text_unlocked

    def contada(ficheiro, texto):
        escrituras.append(os.path.basename(str(ficheiro)))
        return real(ficheiro, texto)

    monkeypatch.setattr(json_store, "_write_text_unlocked", contada)
    return escrituras


def _contar_conexions_sqlite(monkeypatch):
    """Devolve (conexións abertas, conexións que CAMBIARON filas): as segundas son
    as que fan un commit de escritura (e un fsync)."""
    conexions = []
    escritoras = []
    real = sqlite3.connect

    class Contada(sqlite3.Connection):
        def close(self):
            if self.total_changes:
                escritoras.append(1)
            return super().close()

    def contada(*args, **kwargs):
        conexions.append(str(args[0]) if args else "")
        kwargs.setdefault("factory", Contada)
        return real(*args, **kwargs)

    monkeypatch.setattr(sqlite3, "connect", contada)
    return conexions, escritoras


# ---------------------------------------------------------------------------
# El esquema se crea una vez, no en cada lectura
# ---------------------------------------------------------------------------

def test_o_esquema_so_se_crea_unha_vez_por_ficheiro(tmp_path, monkeypatch):
    creadas = []
    real = sqlite_store._crear_esquema

    def contada(ruta):
        creadas.append(ruta)
        return real(ruta)

    monkeypatch.setattr(sqlite_store, "_crear_esquema", contada)
    ruta = str(tmp_path / "unha.sqlite3")

    for _ in range(6):
        sqlite_store.load_sqlite_positions(ruta)
        sqlite_store.load_sqlite_game_state(ruta)

    assert len(creadas) == 1


def test_unha_lectura_de_posicions_non_abre_conexions_de_esquema(tmp_path, monkeypatch):
    """Antes: 2 conexións e un commit de escritura só para ler unha táboa."""
    ruta = str(tmp_path / "lectura.sqlite3")
    sqlite_store.init_sqlite_schema(ruta)

    conexions, escritoras = _contar_conexions_sqlite(monkeypatch)
    sqlite_store.load_sqlite_positions(ruta)

    assert len(conexions) == 1
    assert escritoras == []


def test_un_ficheiro_borrado_volve_a_inicializarse(tmp_path):
    """A caché mira o ficheiro, non só a ruta: se o borran, cría de novo o esquema."""
    ruta = tmp_path / "borrado.sqlite3"
    sqlite_store.init_sqlite_schema(str(ruta))
    sqlite_store.set_sqlite_player_level(str(ruta), "PLAYER 1", 2)

    for extra in (ruta, Path(str(ruta) + "-wal"), Path(str(ruta) + "-shm")):
        if extra.exists():
            extra.unlink()

    assert sqlite_store.load_sqlite_game_state(str(ruta)) == {}


# ---------------------------------------------------------------------------
# update_json / save_json non reescriben o que non cambiou
# ---------------------------------------------------------------------------

def test_update_json_non_reescribe_se_o_updater_non_cambia_nada(tmp_path, monkeypatch):
    ficheiro = tmp_path / "estado.json"
    json_store.save_json(str(ficheiro), {"a": 1, "b": [1, 2]})
    escrituras = _contar_escrituras_json(monkeypatch)

    # Muta en sitio e devolve o mesmo obxecto: o caso que rompe unha comparación
    # por obxectos (o «antes» e o «despois» son o mesmo dicionario).
    def sen_cambios(estado):
        estado["b"] = list(estado["b"])
        return estado

    json_store.update_json(str(ficheiro), {}, sen_cambios)
    json_store.update_json(str(ficheiro), {}, lambda estado: dict(estado))
    assert escrituras == []

    json_store.update_json(str(ficheiro), {}, lambda estado: {**estado, "c": 3})
    assert len(escrituras) == 1
    assert json_store.load_json(str(ficheiro), {})["c"] == 3


def test_save_json_non_reescribe_o_mesmo_contido(tmp_path, monkeypatch):
    ficheiro = tmp_path / "igual.json"
    json_store.save_json(str(ficheiro), {"nivel": 3})
    escrituras = _contar_escrituras_json(monkeypatch)

    json_store.save_json(str(ficheiro), {"nivel": 3})
    assert escrituras == []

    json_store.save_json(str(ficheiro), {"nivel": 4})
    assert len(escrituras) == 1


# ---------------------------------------------------------------------------
# A sesión de administración non toca o disco sen motivo
# ---------------------------------------------------------------------------

def test_verificar_unha_sesion_de_admin_sen_cookie_non_toca_o_disco(monkeypatch):
    chamadas = []
    monkeypatch.setattr(
        main.admin_auth_security, "load_admin_sessions", lambda ruta: chamadas.append("ler") or {}
    )
    monkeypatch.setattr(
        main.admin_auth_security, "save_admin_sessions", lambda ruta, sesions: chamadas.append("gardar")
    )

    assert main.verify_admin_session_token(None) is False
    assert main.verify_admin_session_token("") is False
    assert main.verify_admin_session_token("   ") is False

    assert chamadas == []


def test_verificar_unha_sesion_valida_non_garda_nada_se_non_cambiou(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    token = main.create_admin_session()
    gardados = []
    real = main.admin_auth_security.save_admin_sessions
    monkeypatch.setattr(
        main.admin_auth_security,
        "save_admin_sessions",
        lambda ruta, sesions: (gardados.append(1), real(ruta, sesions)),
    )

    assert main.verify_admin_session_token(token) is True
    assert main.verify_admin_session_token(token) is True
    assert gardados == []


def test_unha_sesion_caducada_si_se_poda_e_garda(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    token = main.create_admin_session()
    sesions = main.admin_auth_security.load_admin_sessions(main.ADMIN_SESSIONS_DB)
    sesions[token]["expires_at"] = 1
    main.admin_auth_security.save_admin_sessions(main.ADMIN_SESSIONS_DB, sesions)

    assert main.verify_admin_session_token(token) is False
    assert token not in main.admin_auth_security.load_admin_sessions(main.ADMIN_SESSIONS_DB)


# ---------------------------------------------------------------------------
# As rutas de xogador, sen escribir
# ---------------------------------------------------------------------------

def _estado_dos_ficheiros(carpeta: Path):
    return {
        p.name: (p.stat().st_mtime_ns, p.stat().st_size)
        for p in carpeta.iterdir()
        if p.is_file() and not p.name.endswith("-shm")
    }


def test_a_taboa_do_equipo_sen_cookie_da_403_sen_escribir_nada(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)

    assert cliente.get("/api/team/PLAYER%201").status_code == 403  # quenta o que faga falta
    antes = _estado_dos_ficheiros(tmp_path)
    sesions_antes = os.path.exists(main.ADMIN_SESSIONS_DB) and os.path.getmtime(main.ADMIN_SESSIONS_DB)

    for _ in range(5):
        assert cliente.get("/api/team/PLAYER%201").status_code == 403

    assert _estado_dos_ficheiros(tmp_path) == antes
    if sesions_antes:
        assert os.path.getmtime(main.ADMIN_SESSIONS_DB) == sesions_antes


def test_un_latido_con_equipo_non_reescribe_json_nin_abre_conexions_de_mais(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    body = {"user": USUARIO, "lat": 40.5, "lon": -3.5, "accuracy": 8, "gps_status": "ok"}
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    assert cliente.post("/api/heartbeat?equipo=1", json=body).status_code == 200  # quenta

    escrituras_json = _contar_escrituras_json(monkeypatch)
    conexions, escritoras = _contar_conexions_sqlite(monkeypatch)

    latidos = 4
    for _ in range(latidos):
        main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
        resposta = cliente.post("/api/heartbeat?equipo=1", json=body)
        assert resposta.status_code == 200
        assert resposta.json()["team"]["profiles"]

    # Ningún JSON se reescribe (a racha de velocidade e a nota manual miran antes
    # de bloquear/escribir) e as únicas escrituras a SQLite son as de verdade:
    # a posición do xogador e, como moito, unha mostra do Rexistro de partida.
    # Antes eran 14-15 commits con fsync por latido.
    assert escrituras_json == []
    assert len(escritoras) / latidos <= 2, "escrituras a SQLite por latido: %s" % (len(escritoras) / latidos)
    assert len(conexions) / latidos <= 20
