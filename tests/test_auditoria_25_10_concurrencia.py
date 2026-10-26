# -*- coding: utf-8 -*-
"""Auditoría 25/10: el limitador por jugador aguanta muchos hilos a la vez (antes: «dictionary changed size during
iteration», un 500 en un avance), y el Registro de partida reutiliza su conexión por hilo."""
import os
import tempfile
import threading

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-concurrencia-"))

from starlette.requests import Request  # noqa: E402

import main  # noqa: E402


def _peticion(ip):
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": (ip, 1234), "query_string": b""})


def test_limitador_sin_errores_con_hilos():
    errores = []

    def golpear(n):
        try:
            for i in range(400):
                try:
                    main.enforce_player_rate_limit("prueba_hilos", _peticion(f"10.0.{n}.{i % 250}"), f"J{i}", 10_000)
                except main.HTTPException:
                    pass
        except Exception as e:  # noqa: BLE001
            errores.append(repr(e))

    hilos = [threading.Thread(target=golpear, args=(n,)) for n in range(12)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    main.PLAYER_RATE_LIMITS.pop("prueba_hilos", None)
    assert not errores, errores[:3]


def test_registro_de_partida_reutiliza_la_conexion(tmp_path):
    from backend.app.storage import match_log_store as m

    ruta = str(tmp_path / "ml.sqlite3")
    with m._connection(ruta) as a:
        a.execute("CREATE TABLE IF NOT EXISTS t (x)")
    with m._connection(ruta) as b:
        assert b is a
        assert b.execute("PRAGMA synchronous").fetchone()[0] == 1  # NORMAL


def test_el_lote_de_teselas_no_gasta_las_escrituras_de_la_ip():
    from backend.app.security import peticiones

    peticiones.limpiar_ritmo()
    lote = Request({"type": "http", "method": "POST", "path": "/api/teselas/lote", "headers": [], "client": ("10.9.9.9", 1), "query_string": b""})
    for _ in range(peticiones.LIMITE_ESCRITURAS_POR_MINUTO + 5):
        assert peticiones.ritmo_excedido(lote, "10.9.9.9") == 0
    assert main.TESELAS_LOTE_RATE_LIMIT_MAX >= 1000


def test_la_subida_de_foto_y_git_no_bloquean_el_bucle():
    import inspect

    from backend.app import build_frontend
    from backend.app.routers import field_proofs

    assert "run_in_threadpool(_crear_foto_de_campo" in inspect.getsource(field_proofs.create_field_proof)
    build_frontend._commit_de_git.cache_clear()
    build_frontend._commit_de_git()
    build_frontend._commit_de_git()
    assert build_frontend._commit_de_git.cache_info().hits >= 1
