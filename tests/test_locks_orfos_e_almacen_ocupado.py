# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S7: un `.lock` huérfano bloqueaba el bucle y
hacía perder escrituras.

Tras un corte de luz o un `docker kill`, el `.lock` de una escritura quedaba en el
disco: cada latido esperaba diez segundos (durmiendo EN el bucle de eventos), el
`TimeoutError` se tragaba dentro de `save_json`/`update_json` y anti_cheat,
game_timers e inventory dejaban de guardarse sin que nadie lo supiera.
"""
import os
import tempfile
import threading
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-locks-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.storage import json_store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402


def test_al_arrancar_se_limpian_los_locks_y_los_temporales_viejos(tmp_path):
    hace_un_rato = time.time() - 120
    for nombre, contenido in (("gamestate.json.lock", "4242"), ("inventory.json.lock", "")):
        lock = tmp_path / nombre
        lock.write_text(contenido)
        os.utime(lock, (hace_un_rato, hace_un_rato))
    viejo = tmp_path / ".game_timers.json.abc123.tmp"
    viejo.write_text("{")
    os.utime(viejo, (1_000_000, 1_000_000))
    reciente = tmp_path / ".otro.json.def456.tmp"  # de una escritura que puede seguir en marcha
    reciente.write_text("{")
    lock_recien_cogido = tmp_path / "anticheat.json.lock"  # de otro proceso, hace un instante
    lock_recien_cogido.write_text("31337")
    datos = tmp_path / "gamestate.json"
    datos.write_text("{}")

    quitados = json_store.clean_stale_locks(str(tmp_path))

    assert quitados == 3
    assert not (tmp_path / "gamestate.json.lock").exists()
    assert not (tmp_path / "inventory.json.lock").exists()
    assert not viejo.exists()
    assert reciente.exists() and datos.exists()
    assert lock_recien_cogido.exists(), "un .lock de hace un instante no es un huérfano"


def test_un_lock_huerfano_con_nuestro_pid_no_bloquea(tmp_path):
    """En Docker el pid se repite tras cada reinicio: el `.lock` es de la vida anterior."""
    ficheiro = tmp_path / "estado.json"
    lock = tmp_path / "estado.json.lock"
    lock.write_text(str(os.getpid()))
    hace_un_rato = time.time() - 10  # el reinicio tardó más de unos segundos
    os.utime(lock, (hace_un_rato, hace_un_rato))

    inicio = time.perf_counter()
    json_store.update_json(str(ficheiro), {}, lambda estado: {**estado, "ok": True})

    assert time.perf_counter() - inicio < 1.5, "esperó al lock huérfano en vez de recuperarlo"
    assert json_store.load_json(str(ficheiro), {}) == {"ok": True}
    assert not (tmp_path / "estado.json.lock").exists()


def test_un_lock_con_nuestro_pid_pero_recien_creado_se_respeta(tmp_path, monkeypatch):
    """Podría ser de OTRO proceso con el mismo pid (dos contenedores en el mismo volumen)."""
    ficheiro = tmp_path / "estado.json"
    (tmp_path / "estado.json.lock").write_text(str(os.getpid()))
    real = json_store._acquire_json_lock
    monkeypatch.setattr(json_store, "_acquire_json_lock", lambda f, timeout=0.3: real(f, timeout=0.3))

    with pytest.raises(TimeoutError):
        json_store.save_json(str(ficheiro), {"a": 1})


def test_un_lock_ajeno_y_viejo_se_recupera(tmp_path):
    ficheiro = tmp_path / "estado.json"
    lock = tmp_path / "estado.json.lock"
    lock.write_text("999999")
    hace_un_minuto = time.time() - 60
    os.utime(lock, (hace_un_minuto, hace_un_minuto))

    inicio = time.perf_counter()
    json_store.save_json(str(ficheiro), {"a": 1})

    assert time.perf_counter() - inicio < 1.5
    assert json_store.load_json(str(ficheiro), {}) == {"a": 1}


def test_un_lock_ajeno_y_reciente_da_timeout_que_se_registra_y_se_ve(tmp_path, monkeypatch):
    ficheiro = tmp_path / "estado.json"
    (tmp_path / "estado.json.lock").write_text("999999")  # de otro proceso, recién creado
    antes = json_store.storage_health()["lock_timeouts"]

    # El timeout de verdad son cinco segundos; aquí, unas décimas.
    real = json_store._acquire_json_lock
    monkeypatch.setattr(json_store, "_acquire_json_lock", lambda fichero, timeout=0.3: real(fichero, timeout=0.3))

    # Por el camino público: el TimeoutError sale (antes se tragaba y el dato se perdía).
    with pytest.raises(TimeoutError):
        json_store.save_json(str(ficheiro), {"a": 1})
    with pytest.raises(TimeoutError):
        json_store.update_json(str(ficheiro), {}, lambda estado: {**estado, "a": 1})

    salud = json_store.storage_health()
    assert salud["lock_timeouts"] == antes + 2
    assert salud["ultimo"]["tipo"] == "lock_timeout" and salud["ultimo"]["fichero"] == "estado.json"
    assert not ficheiro.exists()


def test_si_el_almacen_esta_ocupado_la_ruta_contesta_503_y_no_ok(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200

    def ocupado(fichero, timeout=0):
        raise TimeoutError("Timed out waiting for JSON lock: %s" % fichero)

    monkeypatch.setattr(json_store, "_acquire_json_lock", ocupado)

    resposta = cliente.post("/api/advance", json={"user": "PLAYER 1", "code": "OK"})

    assert resposta.status_code == 503
    assert resposta.json()["detail"] == "storage_busy"
    assert resposta.headers["retry-after"]


def test_dos_hilos_no_pisan_la_escritura_del_otro(tmp_path):
    ficheiro = str(tmp_path / "contador.json")
    json_store.save_json(ficheiro, {"n": 0})

    def sumar():
        for _ in range(15):
            json_store.update_json(ficheiro, {}, lambda estado: {"n": estado.get("n", 0) + 1})

    hilos = [threading.Thread(target=sumar) for _ in range(6)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join()

    assert json_store.load_json(ficheiro, {})["n"] == 6 * 15
