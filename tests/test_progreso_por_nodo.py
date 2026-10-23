# -*- coding: utf-8 -*-
"""Entrega 1 de «progreso por id de nodo»: la tabla `superados` y el arreglo de la cola.

El nivel (`game_state.level`) sigue siendo la fuente de verdad; `superados` se
escribe en paralelo y su puntero derivado tiene que coincidir con él en todos los
caminos que mueven el progreso. Lo único que ya LEE `superados` es la cola: un
`node_completed` con el id de un nodo reconocible se decide por el id, no por el
`level_before` (un índice que se queda viejo al editar la misión).

Se prueba con TestClient y con las funciones puras, no con el texto del código.
"""
import os
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-superados-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers.game import ordenar_avances_de_la_tanda  # noqa: E402
from backend.app.runtime import superados as sup  # noqa: E402
from backend.app.runtime import superados_migracion as mig  # noqa: E402
from backend.app.storage import sqlite_store as sql  # noqa: E402
from ruta_de_proba import preparar_mision, ruta_de_seis_nodos  # noqa: E402

USUARIO = "PLAYER 1"
CODIGOS = ["OK", "SAGA_QR_1", "OK", "OK", "OK", "OK"]
IDS = ["101", "102", "103", "104", "105", "106"]


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def _db():
    return main.resolve_game_state_db_path(main.GAME_DB)


def _ids_mision():
    return [str(s["id"]) for s in main.get_runtime_stages()]


def _activar():
    """Migra la base de la prueba: sin la marca el servidor sigue en modo antiguo."""
    assert mig.migrar(_db(), _ids_mision(), {})["estado"] in ("migrada", "ya_hecha")


def _filas(user=USUARIO):
    return main.get_player_superados(main.GAME_DB, user) or {}


def _derivado(user=USUARIO):
    return sup.nivel_derivado(_ids_mision(), _filas(user))


def _paridad(user=USUARIO):
    nivel = min(main.get_player_progress_level(user, 0), len(_ids_mision()))
    assert _derivado(user) == nivel, (nivel, _derivado(user), _filas(user))


def _cliente():
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _hai(minutos_atras):
    momento = datetime.now(timezone.utc) - timedelta(minutes=minutos_atras)
    return momento.isoformat().replace("+00:00", "Z")


def _avance(nivel, minutos_atras, con_id=True, eid=None, level_before=None, node_id=None):
    evento = {
        "client_event_id": eid or f"sup-{nivel}",
        "type": "node_completed",
        "source": "offline_queue",
        "payload": {
            "code": CODIGOS[nivel],
            "level_before": nivel if level_before is None else level_before,
            "time_spent_ms": 20_000,
            "penalty_ms": 0,
            "local_created_at": _hai(minutos_atras),
            "offline_at_creation": True,
            "evidence": {"v": 1, "via": "qr" if nivel == 1 else "juego"},
        },
    }
    if con_id:
        evento["node_id"] = node_id or IDS[nivel]
    return evento


def _sincronizar(cliente, eventos):
    respuesta = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["events"]


def _jugar(cliente, hasta, con_id=True):
    resultado = _sincronizar(cliente, [_avance(n, 40 - n * 5, con_id=con_id) for n in range(hasta)])
    assert all(e["status"] == "synced" for e in resultado), resultado
    assert main.get_player_progress_level(USUARIO, 0) == hasta


def _nodo(id_nuevo):
    return {
        "id": id_nuevo,
        "title": "Nuevo",
        "lat": 40.5,
        "lon": -3.5,
        "radius": 25,
        "minigame": {"type": "checkpoint", "config": {}},
        "config": {},
    }


def _guardar_mision(despues):
    antes = main.get_runtime_stages()
    main.save_stages(main.STAGES_DB, despues)
    main.reindex_player_levels_on_save(antes, despues)


def _fila_cruda(user, node_id):
    con = sqlite3.connect(_db())
    try:
        return con.execute(
            "SELECT retirado, origen FROM superados WHERE user = ? AND node_id = ?", (user, node_id)
        ).fetchone()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Funciones puras
# ---------------------------------------------------------------------------

def test_nivel_derivado_es_el_primer_vigente_no_superado():
    filas = {"a": {"retirado": 0}, "b": {"retirado": 0}}
    assert sup.nivel_derivado(["a", "b", "c"], filas) == 2
    assert sup.nivel_derivado(["a", "b"], filas) == 2  # terminado
    assert sup.nivel_derivado(["x", "a", "b"], filas) == 0  # lo nuevo delante, sin hacer
    assert sup.hechos(["x", "a", "b"], filas) == ["a", "b"]


def test_un_id_retirado_no_cuenta_aunque_se_reutilice():
    filas = {"a": {"retirado": 0}, "z": {"retirado": 1}}
    assert sup.nivel_derivado(["a", "z"], filas) == 1, "el z nuevo empieza limpio"
    assert sup.hechos(["a", "z"], filas) == ["a"]


def test_ids_numericos_no_se_confunden_con_indices():
    # Ids 0..3: el id 1 está en el índice 1, pero en la lista 1..4 el índice 1 es el id 2.
    filas = {"0": {"retirado": 0}, "1": {"retirado": 0}}
    assert sup.nivel_derivado([0, 1, 2, 3], filas) == 2
    assert sup.nivel_derivado([1, 2, 3, 4], filas) == 0 + 1  # sólo el "1" está hecho
    altas, bajas = sup.aplicar_nivel_numerico([1, 2, 3, 4], filas, 3, False, ts=7)
    assert sorted(altas) == ["2", "3"] and bajas == []


def test_aplicar_nivel_subir_baja_y_reset():
    ids = ["a", "b", "c", "d"]
    filas = {"a": {"retirado": 0}, "b": {"retirado": 0}, "c": {"retirado": 0}}
    altas, bajas = sup.aplicar_nivel_numerico(ids, filas, 4, False, ts=5)
    assert altas == {"d": (5, "avance")} and bajas == []
    altas, bajas = sup.aplicar_nivel_numerico(ids, filas, 4, True, ts=5)
    assert altas == {"d": (5, "panel")}
    altas, bajas = sup.aplicar_nivel_numerico(ids, filas, 1, True)
    assert altas == {} and sorted(bajas) == ["b", "c"]
    altas, bajas = sup.aplicar_nivel_numerico(ids, filas, 1, False)  # sin panel no se retrocede
    assert altas == {} and bajas == []
    assert sup.aplicar_nivel_numerico(ids, filas, 0, False)[1] == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# Paridad: nivel_derivado == nivel en cada camino
# ---------------------------------------------------------------------------

def test_paridad_tras_avanzar_por_la_cola_y_en_linea(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()

    _jugar(cliente, 3)
    _paridad()
    assert _fila_cruda(USUARIO, "103")[1] == "avance"

    main.set_player_progress_level(USUARIO, 4)  # el camino en línea (/api/advance)
    _paridad()


def test_paridad_tras_retroceder_desde_el_panel(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()
    _jugar(cliente, 4)

    main.set_player_progress_level(USUARIO, 2, desde_admin=True)
    _paridad()
    assert set(_filas()) == {"101", "102"}, "lo que se rehace deja de estar superado"

    main.set_player_progress_level(USUARIO, 5, desde_admin=True)  # saltar con el panel
    _paridad()
    assert _fila_cruda(USUARIO, "105")[1] == "panel"

    main.set_player_progress_level(USUARIO, 0)  # reinicio
    _paridad()
    assert _filas() == {}


def test_paridad_tras_guardar_la_mision_con_insercion(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    _jugar(_cliente(), 3)

    # Delante de lo hecho: se regala (quien ya pasó de ahí no lo juega).
    nueva = ruta_de_seis_nodos()
    nueva.insert(1, _nodo(150))
    _guardar_mision(nueva)
    assert main.get_player_progress_level(USUARIO, 0) == 4
    _paridad()
    assert _fila_cruda(USUARIO, "150")[1] == "insercion"

    # Detrás de lo hecho: queda pendiente y es el siguiente.
    nueva = main.get_runtime_stages()
    nueva.insert(5, _nodo(151))
    _guardar_mision(nueva)
    _paridad()
    assert "151" not in _filas()


def test_paridad_tras_guardar_la_mision_con_borrado(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    _jugar(_cliente(), 3)

    _guardar_mision([n for n in ruta_de_seis_nodos() if n["id"] != 102])

    assert main.get_player_progress_level(USUARIO, 0) == 2
    _paridad()
    assert _fila_cruda(USUARIO, "102")[0] == 1, "el id borrado se archiva, no se borra"
    assert _fila_cruda(USUARIO, "101")[0] == 0


def test_paridad_tras_guardar_la_mision_reordenada(monkeypatch, tmp_path, capsys):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    _jugar(_cliente(), 2)

    nodos = ruta_de_seis_nodos()
    nodos[0], nodos[1] = nodos[1], nodos[0]
    _guardar_mision(nodos)

    # Manda el nivel que calcula `reindex_player_levels` (1): superados se fuerza a él.
    assert main.get_player_progress_level(USUARIO, 0) == 1
    _paridad()
    assert "superados diverge" in capsys.readouterr().out


def test_paridad_con_ids_numericos_que_colisionan_con_indices(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    base = [_nodo(i) for i in range(0, 5)]  # ids 0..4: el id N está en el índice N
    main.save_stages(main.STAGES_DB, base)
    _activar()
    main.set_player_progress_level(USUARIO, 0)
    main.set_player_progress_level(USUARIO, 2)
    _paridad()

    # Se borra el 0: ahora el id 1 está en el índice 0 y los ids ya no valen índices.
    _guardar_mision([_nodo(i) for i in range(1, 5)])

    assert main.get_player_progress_level(USUARIO, 0) == 1
    _paridad()
    assert set(hechos for hechos in sup.hechos(_ids_mision(), _filas())) == {"1"}


def test_jugador_terminado_con_nodos_anadidos_sigue_terminado(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    _jugar(_cliente(), 6)

    nueva = ruta_de_seis_nodos()
    nueva.insert(0, _nodo(150))
    nueva.append(_nodo(151))
    _guardar_mision(nueva)

    assert main.get_player_progress_level(USUARIO, 0) == 8
    _paridad()
    assert _derivado() == len(_ids_mision())


def test_id_reutilizado_tras_borrar_el_ultimo_nodo_empieza_limpio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    _jugar(_cliente(), 6)

    _guardar_mision(ruta_de_seis_nodos()[:5])  # se borra el 106
    assert _fila_cruda(USUARIO, "106")[0] == 1
    main.set_player_progress_level(USUARIO, 2, desde_admin=True)  # el organizador lo devuelve al 103

    nueva = main.get_runtime_stages()
    nueva.append(_nodo(106))  # otro nodo, mismo id
    _guardar_mision(nueva)

    _paridad()
    assert "106" not in sup.hechos(_ids_mision(), _filas()), "el 106 nuevo no cuenta como hecho"
    assert main.get_player_progress_level(USUARIO, 0) == 2


# ---------------------------------------------------------------------------
# La cola: el id manda sobre level_before
# ---------------------------------------------------------------------------

def test_el_bug_insercion_delante_con_el_nodo_encolado(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()
    _jugar(cliente, 3)

    d = _avance(3, 5)  # jugado sin cobertura, con el índice antiguo
    nueva = ruta_de_seis_nodos()
    nueva.insert(1, _nodo(150))
    _guardar_mision(nueva)

    (resultado,) = _sincronizar(cliente, [d])

    assert resultado["status"] == "synced", resultado
    assert main.get_player_progress_level(USUARIO, 0) == 5
    assert "104" in sup.hechos(_ids_mision(), _filas())
    _paridad()


def test_id_borrado_se_contesta_como_eco_con_el_mismo_texto(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()
    _jugar(cliente, 2)

    quedan = [n for n in ruta_de_seis_nodos() if n["id"] != 103]
    nivel_antes = main.get_player_progress_level(USUARIO, 0)
    _guardar_mision(quedan)

    # El móvil jugó el 103 sin cobertura y lo tiene en la cola; ya no existe.
    (resultado,) = _sincronizar(cliente, [_avance(2, 5)])

    assert resultado["status"] == "ignored"
    assert resultado["error"] == "already_advanced", "un texto nuevo se reintentaría para siempre"
    assert resultado["node_id"] == "103"
    assert main.get_player_progress_level(USUARIO, 0) == nivel_antes


def test_id_vigente_ya_superado_es_eco_aunque_level_before_diga_otra_cosa(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()
    _jugar(cliente, 3)

    (resultado,) = _sincronizar(cliente, [_avance(1, 30, eid="eco-1", level_before=3)])

    assert (resultado["status"], resultado["error"]) == ("ignored", "already_advanced")
    assert main.get_player_progress_level(USUARIO, 0) == 3


def test_id_detras_de_un_hueco_es_behind(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()
    _jugar(cliente, 1)

    # level_before coincide con el nivel, pero el id es el del nodo 4: falta el 2 y el 3.
    (resultado,) = _sincronizar(cliente, [_avance(3, 5, level_before=1)])

    assert (resultado["status"], resultado["error"]) == ("failed", "behind")
    assert main.get_player_progress_level(USUARIO, 0) == 1


def test_el_id_del_cliente_no_salta_la_validacion_del_codigo(monkeypatch, tmp_path):
    """El id es una reclamación: el código se sigue validando contra el nodo del puntero."""
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()
    _jugar(cliente, 1)

    mal = _avance(1, 5)
    mal["payload"]["code"] = "CODIGO_QUE_NO_ES"
    (resultado,) = _sincronizar(cliente, [mal])

    assert resultado["status"] == "failed"
    assert resultado["error"] == "invalid_completion_code"
    assert main.get_player_progress_level(USUARIO, 0) == 1


def test_una_id_que_no_se_reconoce_cae_al_comportamiento_de_siempre(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()
    _jugar(cliente, 2)

    # Id desconocido (nunca existió) + level_before antiguo: eco por nivel, como hoy.
    (eco,) = _sincronizar(cliente, [_avance(0, 30, eid="raro-1", node_id="999")])
    assert (eco["status"], eco["error"]) == ("ignored", "already_advanced")

    # Id desconocido + level_before al día: se aplica al nodo del puntero, como hoy.
    (bueno,) = _sincronizar(cliente, [_avance(2, 5, eid="raro-2", node_id="999")])
    assert bueno["status"] == "synced"
    assert main.get_player_progress_level(USUARIO, 0) == 3


def test_la_cola_antigua_sin_node_id_funciona_igual_que_antes(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _activar()
    cliente = _cliente()

    eventos = [_avance(n, 30 - n * 5, con_id=False) for n in range(5)]
    mezclados = [eventos[2], eventos[0], eventos[4], eventos[1], eventos[3]]
    resultado = _sincronizar(cliente, mezclados)

    assert all(e["status"] == "synced" for e in resultado), resultado
    assert main.get_player_progress_level(USUARIO, 0) == 5
    _paridad()  # y la doble escritura también se hizo, sin ids en los eventos


def test_la_tanda_se_ordena_por_la_posicion_del_nodo_en_la_mision_de_ahora():
    # `level_before` viejo (3) pero el nodo 104 está ahora ANTES que el 103.
    eventos = [
        {"type": "node_completed", "node_id": "103", "payload": {"level_before": 2}},
        {"type": "node_completed", "node_id": "104", "payload": {"level_before": 3}},
    ]
    nuevo_orden = ["101", "104", "103"]

    resultado = ordenar_avances_de_la_tanda(eventos, nuevo_orden)
    assert [e["node_id"] for e in resultado] == ["104", "103"]
    # Sin ids (o sin node_id en algún evento) vale el criterio de siempre.
    assert [e["node_id"] for e in ordenar_avances_de_la_tanda(eventos)] == ["103", "104"]
    # Un id borrado va primero: es un eco y no estorba.
    con_borrado = eventos + [{"type": "node_completed", "node_id": "999", "payload": {"level_before": 9}}]
    assert ordenar_avances_de_la_tanda(con_borrado, nuevo_orden)[0]["node_id"] == "999"


# ---------------------------------------------------------------------------
# Migración
# ---------------------------------------------------------------------------

def _niveles_sin_marca(niveles):
    for user, nivel in niveles.items():
        sql.set_sqlite_player_level(_db(), user, nivel)  # sin ids: modo antiguo


def test_migracion_idempotente_con_horas_y_terminados(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    ids = _ids_mision()
    _niveles_sin_marca({"ANA": 2, "BEA": 0, "CAL": 6, "DOL": 9})  # CAL termina; DOL: nivel > nodos
    timers = {"ANA": {"nodos": {"0": {"completed_at_ms": 1111}, "1": {"completed_at_ms": 2222}}}}

    primera = mig.migrar(_db(), ids, timers)

    assert primera["estado"] == "migrada"
    con = sqlite3.connect(_db())
    try:
        filas = con.execute("SELECT user, node_id, ts, origen FROM superados ORDER BY user, node_id").fetchall()
    finally:
        con.close()
    assert [f for f in filas if f[0] == "ANA"] == [("ANA", "101", 1111, "migracion"), ("ANA", "102", 2222, "migracion")]
    assert not [f for f in filas if f[0] == "BEA"]
    assert len([f for f in filas if f[0] in ("CAL", "DOL")]) == 12
    for user in ("ANA", "CAL", "DOL"):
        _paridad(user)

    segunda = mig.migrar(_db(), ids, timers)
    assert segunda["estado"] == "ya_hecha" and segunda["filas"] == 0
    con = sqlite3.connect(_db())
    try:
        assert con.execute("SELECT COUNT(*) FROM superados").fetchone()[0] == len(filas)
    finally:
        con.close()


def test_migracion_hace_rollback_si_un_jugador_no_cuadra(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _niveles_sin_marca({"ANA": 1, "BEA": 2})
    ids_rotos = ["a", "b", "a", "c"]  # un id repetido: con el nivel 2 el puntero derivado sale 3

    try:
        mig.migrar(_db(), ids_rotos, {})
    except mig.MigracionIncoherente:
        pass
    else:
        raise AssertionError("tenía que fallar")

    con = sqlite3.connect(_db())
    try:
        assert con.execute("SELECT COUNT(*) FROM superados").fetchone()[0] == 0, "ni una fila: ROLLBACK"
        assert con.execute("SELECT 1 FROM schema_meta WHERE key = ?", (sql.MARCA_SUPERADOS,)).fetchone() is None
    finally:
        con.close()
    # Y sin marca el servidor sigue en modo antiguo: avanzar no escribe en superados.
    main.set_player_progress_level("ANA", 2)
    assert main.get_player_superados(main.GAME_DB, "ANA") is None


def test_migracion_no_acepta_una_mision_vacia_con_jugadores_con_progreso(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _niveles_sin_marca({"ANA": 3})

    try:
        mig.migrar(_db(), [], {})
    except mig.MigracionIncoherente:
        return
    raise AssertionError("una misión que no se pudo leer no debe dar la migración por buena")


def test_migrar_al_arrancar_copia_antes_y_un_fallo_no_impide_arrancar(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    _niveles_sin_marca({"ANA": 2})

    resultado = main.migrar_superados_al_arrancar()

    assert resultado["estado"] == "migrada"
    copias = list((tmp_path / "copias_superados").glob("saga.*.sqlite3"))
    assert len(copias) == 1, "la copia de la base va ANTES de migrar"
    assert main.migrar_superados_al_arrancar()["estado"] == "ya_hecha"

    # Un fallo se registra y NO lanza: el servidor arranca en modo antiguo.
    monkeypatch.setattr(main, "get_runtime_stages", lambda: (_ for _ in ()).throw(RuntimeError("sin misión")))
    assert main.migrar_superados_al_arrancar() is None
