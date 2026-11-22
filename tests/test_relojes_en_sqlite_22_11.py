# -*- coding: utf-8 -*-
"""22/11 (mejora 8): los relojes (`game_timers.json`) pasan a SQLite.

- La primera vez se importa el JSON que haya, UNA vez, sin tocarlo (queda de copia).
- 15 jugadores escribiendo a la vez no pierden ninguna escritura.
- Lo guardado sigue ahí al reiniciar (conexiones cerradas, proceso nuevo).
"""
import json
import os
import subprocess
import sys
import threading

import pytest

from backend.app.runtime import player_timers
from backend.app.storage import json_store, sqlite_store, timers_store

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture
def rutas(monkeypatch, tmp_path):
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    yield str(tmp_path / "game_timers.json"), str(tmp_path / "saga.sqlite3")
    sqlite_store.cerrar_conexiones()


VIEJO = {
    "Bruma Ferreiro": {"stage_times_ms": {"0": 12000, "1": 30500}, "started_at": 1700000000000, "penalties_ms": 120000},
    "Lito Carballo": {"stage_times_ms": {"0": 9000}, "nodos": {"0": {"node_id": "a", "level": 0, "time_ms": 9000}}},
}


def _filas(db):
    conn = sqlite_store.connect_sqlite(db)
    try:
        return {f["user"]: json.loads(f["entrada_json"]) for f in conn.execute("SELECT * FROM player_timers")}
    finally:
        conn.close()


def test_importa_el_json_una_vez_y_lo_deja_de_copia(rutas):
    relojes, db = rutas
    with open(relojes, "w", encoding="utf-8") as f:
        json.dump(VIEJO, f)
    antes = open(relojes, encoding="utf-8").read()

    assert timers_store.json_en_uso(relojes)
    assert player_timers.load_player_timers(relojes) == VIEJO
    assert _filas(db) == VIEJO
    assert not timers_store.json_en_uso(relojes)
    assert open(relojes, encoding="utf-8").read() == antes, "el JSON no se toca"

    # Cambia en SQLite; un JSON que alguien «recupera» después NO se vuelve a importar encima.
    player_timers.add_player_penalty(relojes, "Lito Carballo", 5000)
    with open(relojes, "w", encoding="utf-8") as f:
        json.dump({"Nadia Souto": {"stage_times_ms": {}}}, f)
    timers = player_timers.load_player_timers(relojes)
    assert set(timers) == set(VIEJO) and timers["Lito Carballo"]["penalties_ms"] == 5000
    assert player_timers.get_player_total_time_ms(relojes, "Bruma Ferreiro") == player_timers.total_de_la_entrada(
        VIEJO["Bruma Ferreiro"]
    )


def test_sin_json_arranca_vacio_y_marca(rutas):
    relojes, db = rutas
    assert player_timers.load_player_timers(relojes) == {}
    assert not timers_store.json_en_uso(relojes)
    assert not os.path.exists(relojes), "no se crea el JSON"


def test_un_json_ilegible_no_se_marca_ni_se_pisa(rutas):
    relojes, db = rutas
    roto = '{"Bruma Ferreiro": {"penalties_ms": 1}, "Li'
    with open(relojes, "w", encoding="utf-8") as f:
        f.write(roto)

    assert player_timers.load_player_timers(relojes) == {}  # una lectura no tumba los GET
    with pytest.raises(json_store.ErrorDeAlmacen):
        player_timers.add_player_penalty(relojes, "Bruma Ferreiro", 1000)  # una escritura sí lanza, como antes
    assert timers_store.json_en_uso(relojes), "pendiente: la salud lo sigue enseñando"
    assert open(relojes, encoding="utf-8").read() == roto

    # Arreglado a mano, se importa a la siguiente.
    with open(relojes, "w", encoding="utf-8") as f:
        json.dump(VIEJO, f)
    player_timers.add_player_penalty(relojes, "Bruma Ferreiro", 1000)
    assert player_timers.load_player_timers(relojes)["Bruma Ferreiro"]["penalties_ms"] == 121000


def test_quince_jugadores_a_la_vez_no_pierden_nada(rutas):
    relojes, _db = rutas
    jugadores = [f"Jugador {i}" for i in range(15)]
    por_hilo = 20
    errores = []
    salida = threading.Barrier(len(jugadores) * 2)

    def penalizar(user):
        try:
            salida.wait()
            for _ in range(por_hilo):
                player_timers.add_player_penalty(relojes, user, 1000)
                player_timers.add_player_penalty(relojes, "Comun", 1)  # todos sobre la MISMA entrada
        except Exception as error:  # noqa: BLE001
            errores.append(error)

    def tiempos(user):
        try:
            salida.wait()
            for nivel in range(por_hilo):
                player_timers.record_player_stage_time(relojes, user, nivel, 1000 + nivel)
        except Exception as error:  # noqa: BLE001
            errores.append(error)

    hilos = [threading.Thread(target=penalizar, args=(u,)) for u in jugadores]
    hilos += [threading.Thread(target=tiempos, args=(u,)) for u in jugadores]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(120)
    assert not errores, errores

    timers = player_timers.load_player_timers(relojes)
    assert timers["Comun"]["penalties_ms"] == len(jugadores) * por_hilo
    for user in jugadores:
        assert timers[user]["penalties_ms"] == 1000 * por_hilo
        assert len(timers[user]["stage_times_ms"]) == por_hilo


def test_lo_guardado_sigue_tras_reiniciar(rutas, tmp_path):
    relojes, db = rutas
    player_timers.mark_player_started(relojes, "Bruma Ferreiro")
    player_timers.record_player_stage_time(relojes, "Bruma Ferreiro", 0, 4321)
    sqlite_store.cerrar_conexiones()

    # Un proceso nuevo, como el servidor tras un corte de luz.
    codigo = (
        "import json,sys; sys.path.insert(0, sys.argv[1]);"
        "from backend.app.runtime import player_timers as p;"
        "print(json.dumps(p.load_player_timers(sys.argv[2])))"
    )
    entorno = {**os.environ, "SAGA_STORAGE_BACKEND": "sqlite", "SAGA_SQLITE_DB": db}
    salida = subprocess.run([sys.executable, "-c", codigo, RAIZ, relojes], capture_output=True, text=True, env=entorno,
                            timeout=60)
    assert salida.returncode == 0, salida.stderr
    entrada = json.loads(salida.stdout.strip().splitlines()[-1])["Bruma Ferreiro"]
    assert entrada["stage_times_ms"] == {"0": 4321} and entrada["started_at"] > 0


def test_sin_cambios_no_escribe_y_un_updater_raro_no_borra_a_todos(rutas, monkeypatch):
    relojes, db = rutas
    player_timers.save_player_timers(relojes, VIEJO)
    escrituras = []
    original = timers_store._escribir
    monkeypatch.setattr(timers_store, "_escribir", lambda *a: escrituras.append(original(*a)) or escrituras[-1])
    player_timers.save_player_timers(relojes, json.loads(json.dumps(VIEJO)))
    assert escrituras == [0]
    with pytest.raises(TypeError):
        timers_store.actualizar(relojes, lambda t: None)
    assert _filas(db) == VIEJO


def test_con_backend_json_sigue_en_el_fichero(monkeypatch, tmp_path):
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "json")
    relojes = str(tmp_path / "game_timers.json")
    player_timers.add_player_penalty(relojes, "Bruma Ferreiro", 1000)
    with open(relojes, encoding="utf-8") as f:
        assert json.load(f) == {"Bruma Ferreiro": {"stage_times_ms": {}, "penalties_ms": 1000}}
    assert not os.path.exists(tmp_path / "saga.sqlite3")
