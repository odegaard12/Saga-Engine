# -*- coding: utf-8 -*-
"""Integridad y antifallos del servidor (auditoría 13/11/2026). Cada prueba reproduce un fallo que ya no puede pasar.

Corte de luz, fichero vacío o ilegible, base corrupta, reloj adelantado, guardado a medias, perfil borrado, PIN sin asignar.
"""
import json
import os
import sqlite3
import tempfile
import threading
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-integridad-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import integridad, pines_jugador  # noqa: E402
from backend.app.storage import json_store, runtime_store, sqlite_store  # noqa: E402


@pytest.fixture(autouse=True)
def _aislado(monkeypatch, tmp_path):
    """Datos propios en cada prueba: nada de lo que se guarda aquí (PINs, misión, niveles, fotos) queda para las demás."""
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    for nombre, fichero in (
        ("GAME_DB", "gamestate.json"), ("STAGES_DB", "stages.json"), ("EVENT_LOG_DB", "events.json"),
        ("POSITIONS_DB", "positions.json"), ("INVENTORY_DB", "inventory.json"), ("TIMERS_DB", "timers.json"),
        ("ANTI_CHEAT_DB", "anti_cheat.json"), ("PLAYER_PINS_DB", "player_pins.json"),
        ("ADMIN_SESSIONS_DB", "admin_sessions.json"), ("MATCH_LOG_DB", "match_log.sqlite3"),
        ("RECHAZOS_DE_AVANCE_DB", "rechazos_de_avance.json"), ("PERSONAJES_DB", "personajes.json"),
    ):
        monkeypatch.setattr(main, nombre, str(tmp_path / fichero))
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    integridad._reiniciar_para_tests()
    yield
    integridad._reiniciar_para_tests()
    sqlite_store.cerrar_conexiones()


# --- JSON compartidos: copia .bak, fichero vacío o ilegible -------------------------------------------------------


def _con_bak_cada_vez(monkeypatch):
    monkeypatch.setattr(json_store, "BAK_CADA_S", 0.0)


def test_un_json_ilegible_se_recupera_de_su_bak(tmp_path, monkeypatch):
    _con_bak_cada_vez(monkeypatch)
    f = str(tmp_path / "game_timers.json")
    json_store.update_json(f, {}, lambda t: {**t, "ana": 1})
    json_store.update_json(f, {}, lambda t: {**t, "ana": 2})  # la segunda escritura deja el estado anterior en .bak
    assert json.loads(open(f + ".bak", encoding="utf-8").read()) == {"ana": 1}
    open(f, "w", encoding="utf-8").write('{"ana": 2, "rot')  # la SD deja el fichero a medias

    # Antes: ErrorDeAlmacen en cada escritura (503 para todos). Ahora recupera el último estado bueno y lo restaura.
    json_store.update_json(f, {}, lambda t: {**t, "luis": 3})
    assert json.loads(open(f, encoding="utf-8").read()) == {"ana": 1, "luis": 3}


def test_sin_bak_un_json_ilegible_sigue_sin_escribirse_encima(tmp_path):
    f = str(tmp_path / "inventory.json")
    open(f, "w", encoding="utf-8").write("{no es json")
    with pytest.raises(json_store.ErrorDeAlmacen):
        json_store.update_json(f, {}, lambda t: {"x": 1})
    assert open(f, encoding="utf-8").read() == "{no es json"


def test_un_json_de_cero_bytes_se_recupera_del_bak_y_no_pisa_en_silencio(tmp_path, monkeypatch):
    _con_bak_cada_vez(monkeypatch)
    f = str(tmp_path / "game_timers.json")
    json_store.update_json(f, {}, lambda t: {**t, "ana": 1, "luis": 2})
    json_store.update_json(f, {}, lambda t: {**t, "ana": 5})
    open(f, "w", encoding="utf-8").close()  # 0 bytes: lo que deja un corte de luz

    # La lectura (GET) ya ve la copia, no «no hay datos»...
    assert json_store.load_json(f, {}) == {"ana": 1, "luis": 2}
    # ...y la siguiente escritura parte de ella: no deja sólo la entrada de quien escribe.
    json_store.update_json(f, {}, lambda t: {**t, "pepa": 9})
    assert json.loads(open(f, encoding="utf-8").read()) == {"ana": 1, "luis": 2, "pepa": 9}


def test_un_json_de_cero_bytes_sin_bak_cuenta_como_vacio_pero_queda_dicho(tmp_path, caplog):
    f = str(tmp_path / "x.json")
    open(f, "w", encoding="utf-8").close()
    with caplog.at_level("ERROR", logger="saga.storage"):
        assert json_store.update_json(f, {}, lambda t: {"a": 1}) == {"a": 1}
    assert "vacío" in caplog.text


def test_el_bak_no_se_hace_en_cada_escritura(tmp_path):
    f = str(tmp_path / "game_timers.json")
    json_store.update_json(f, {}, lambda t: {"a": 1})
    json_store.update_json(f, {}, lambda t: {"a": 2})  # crea el .bak (no había)
    json_store.update_json(f, {}, lambda t: {"a": 3})  # dentro de BAK_CADA_S: no lo rehace
    assert json.loads(open(f + ".bak", encoding="utf-8").read()) == {"a": 1}


# --- SQLite: durabilidad, quick_check, ALTER ----------------------------------------------------------------------


def test_asegurar_durabilidad_deja_la_conexion_en_normal_y_apunta_la_marca(tmp_path):
    db = str(tmp_path / "x.sqlite3")
    sqlite_store.set_sqlite_player_level(db, "ana", 2)
    assert sqlite_store.asegurar_durabilidad(db) is True
    with sqlite_store.sqlite_connection(db) as conn:
        assert conn.execute("PRAGMA synchronous").fetchone()[0] == 1  # NORMAL: el resto de commits no paga fsync
        assert conn.execute("SELECT value FROM schema_meta WHERE key = 'durable_ms'").fetchone() is not None


def test_el_avance_en_linea_asegura_la_durabilidad_antes_de_contestar(monkeypatch):
    llamadas = []
    monkeypatch.setattr(main, "asegurar_durabilidad_de_la_partida", lambda: llamadas.append(1))
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    from backend.app.routers import game as game_router
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(game_router.router)
    runtime_store.save_stages(main.STAGES_DB, [{"id": "d0", "title": "N0", "lat": 40.4, "lon": -3.7, "radius": 40,
                                               "type": "signal_hunt", "config": {"game_id": "spark_radar", "success_code": "C1"}}])
    main.set_player_progress_level("PLAYER 1", 0)
    r = TestClient(app).post("/api/advance", json={"user": "PLAYER 1", "code": "C1", "manual": True, "level_before": 0}).json()
    assert r["status"] == "ok" and llamadas == [1]


def test_quick_check_detecta_una_base_rota_y_no_se_queja_de_una_sana(tmp_path):
    sana = str(tmp_path / "sana.sqlite3")
    for i in range(200):
        sqlite_store.set_sqlite_player_level(sana, f"u{i}", i)
    sqlite_store.cerrar_conexiones()
    assert sqlite_store.quick_check(sana) == (True, "ok")
    assert sqlite_store.quick_check(str(tmp_path / "no-existe.sqlite3"))[0] is True

    rota = tmp_path / "rota.sqlite3"
    rota.write_bytes(open(sana, "rb").read())
    with open(rota, "r+b") as f:  # páginas de datos pisadas con basura (una SD dañada)
        f.seek(4096 * 2)
        f.write(b"\xff" * 4096)
    assert sqlite_store.quick_check(str(rota))[0] is False


def test_una_base_rota_pone_la_salud_en_503_y_no_tumba_nada(tmp_path, monkeypatch):
    rota = tmp_path / "registro.sqlite3"
    rota.write_bytes(b"esto no es una base de sqlite" * 200)
    monkeypatch.setattr(main, "_bases_a_comprobar", lambda: {"registro": str(rota)})
    resultado = integridad.comprobar_bases({"registro": str(rota)})
    assert resultado["registro"]["ok"] is False
    r = TestClient(main.app).get("/api/salud")
    assert r.status_code == 503
    assert "registro" in r.json()["bases_con_problemas"]


def test_un_json_clave_vacio_pone_la_salud_en_503(tmp_path, monkeypatch):
    vacio = tmp_path / "game_timers.json"
    vacio.write_text("")
    monkeypatch.setattr(main, "TIMERS_DB", str(vacio))
    r = TestClient(main.app).get("/api/salud")
    assert r.status_code == 503 and r.json()["json_ilegibles"] == ["game_timers.json"]


def test_alter_y_relleno_de_client_event_id_van_en_una_sola_transaccion(tmp_path, monkeypatch):
    vistos = {}
    original = sqlite_store._rellenar_client_event_id

    def espia(conn):
        vistos["en_transaccion"] = conn.in_transaction  # tras el ALTER: si no hay transacción, un corte deja la columna sin rellenar
        original(conn)

    monkeypatch.setattr(sqlite_store, "_rellenar_client_event_id", espia)
    db = str(tmp_path / "vieja.sqlite3")
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE events (id TEXT PRIMARY KEY, user TEXT, type TEXT, status TEXT, payload_json TEXT, created_at TEXT, synced_at TEXT, error TEXT)")
    c.commit()
    c.close()
    sqlite_store.init_sqlite_schema(db)
    assert vistos == {"en_transaccion": True}


# --- Guardar la misión y reindexar niveles ------------------------------------------------------------------------


def _mision(ids):
    return [{"id": i, "title": i, "lat": 40.4, "lon": -3.7, "radius": 40, "type": "signal_hunt",
             "config": {"game_id": "spark_radar", "success_code": "K" + i}} for i in ids]


def test_un_corte_entre_guardar_la_mision_y_reindexar_se_repara_al_arrancar():
    runtime_store.save_stages(main.STAGES_DB, _mision(["a", "b", "c", "d"]))
    main.save_game_state(main.GAME_DB, {"PLAYER 1": 2, "PLAYER 2": 3})  # en «c» y en «d»

    # Se guarda la misión SIN a (se borró el primer nodo)... y el proceso muere antes de reindexar.
    runtime_store.save_stages(main.STAGES_DB, _mision(["b", "c", "d"]), reindexar_desde=["a", "b", "c", "d"])
    assert main.load_game_state(main.GAME_DB) == {"PLAYER 1": 2, "PLAYER 2": 3}  # niveles aún de la misión vieja

    assert main.reparar_reindex_pendiente()["estado"] == "reparado"
    assert main.load_game_state(main.GAME_DB) == {"PLAYER 1": 1, "PLAYER 2": 2}  # «c» y «d» siguen siendo «c» y «d»
    assert main.reparar_reindex_pendiente() is None  # la marca se borró en la misma transacción: no se repite
    assert main.load_game_state(main.GAME_DB) == {"PLAYER 1": 1, "PLAYER 2": 2}


def test_si_stages_json_falla_el_guardado_ya_esta_hecho_y_se_puede_reindexar(monkeypatch):
    def falla(*a, **k):
        raise json_store.ErrorDeAlmacen("disco lleno")

    monkeypatch.setattr(runtime_store, "save_json", falla)
    runtime_store.save_stages(main.STAGES_DB, _mision(["a", "b"]))  # antes lanzaba y el reindexado nunca corría
    assert [s["id"] for s in runtime_store.load_stages(main.STAGES_DB)] == ["a", "b"]


def test_el_guardado_del_panel_termina_antes_un_reindexado_pendiente():
    runtime_store.save_stages(main.STAGES_DB, _mision(["a", "b", "c"]))
    main.save_game_state(main.GAME_DB, {"PLAYER 1": 2})
    runtime_store.save_stages(main.STAGES_DB, _mision(["b", "c"]), reindexar_desde=["a", "b", "c"])  # corte
    from backend.app.routers import admin as admin_router

    admin_router._guardar_mision(main, {}, _mision(["b", "c", "e"]))  # el organizador guarda otra vez
    assert main.load_game_state(main.GAME_DB)["PLAYER 1"] == 1  # «c» en la misión nueva: ni se perdió ni se desplazó dos veces


# --- Avance repetido: premio y hora de fin ------------------------------------------------------------------------


def test_un_aviso_repetido_completa_premio_y_hora_de_fin_sin_pisarla(monkeypatch):
    runtime_store.save_stages(main.STAGES_DB, _mision(["a", "b"]))
    premios = []
    monkeypatch.setattr(main, "grant_stage_reward", lambda u, p, nodo: premios.append(nodo["id"]))
    main.save_json(main.TIMERS_DB, {"PLAYER 1": {"stage_times_ms": {}}})

    main.completar_avance_repetido("PLAYER 1", "PLAYER 1", 0)
    assert premios == ["a"] and "finished_at" not in main.load_json(main.TIMERS_DB, {})["PLAYER 1"]  # no es el último nodo

    main.completar_avance_repetido("PLAYER 1", "PLAYER 1", 1)
    fin = main.load_json(main.TIMERS_DB, {})["PLAYER 1"]["finished_at"]
    assert premios == ["a", "b"] and fin > 0

    main.completar_avance_repetido("PLAYER 1", "PLAYER 1", 1)  # otra vez: el premio es idempotente y la hora no cambia
    assert main.load_json(main.TIMERS_DB, {})["PLAYER 1"]["finished_at"] == fin
    main.completar_avance_repetido("PLAYER 1", "PLAYER 1", 99)  # un índice absurdo no tira nada


def test_la_rama_duplicate_de_avance_llama_a_completar(monkeypatch):
    llamadas = []
    monkeypatch.setattr(main, "completar_avance_repetido", lambda u, p, i: llamadas.append(i))
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    runtime_store.save_stages(main.STAGES_DB, _mision(["a", "b", "c"]))
    main.set_player_progress_level("PLAYER 1", 2)
    from backend.app.routers import game as game_router
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(game_router.router)
    r = TestClient(app).post("/api/advance", json={"user": "PLAYER 1", "code": "Ka", "level_before": 0}).json()
    assert r["status"] == "ok" and r["duplicate"] is True and llamadas == [0]


# --- Registro de partida: un fichero auxiliar no tumba el avance -------------------------------------------------


def test_el_registro_roto_no_tumba_la_anotacion(monkeypatch):
    def explota(*a, **k):
        raise sqlite3.DatabaseError("database disk image is malformed")

    monkeypatch.setattr(main._match_log, "record", explota)
    monkeypatch.setattr(main._match_log, "record_many", explota)
    assert main.match_log_record("advance", "PLAYER 1", payload={}, active=True) is None
    assert main.match_log_record_many([], active=True) is None


# --- El reloj: no se borra por fecha con una hora que no es de fiar ------------------------------------------------


def test_no_se_borra_nada_recien_arrancado_ni_con_la_hora_imposible_ni_atrasada(tmp_path):
    integridad.iniciar_reloj(str(tmp_path))
    ahora = time.time()
    assert integridad.puede_borrar_por_fecha()[1] == "recien_arrancado"  # los primeros 10 minutos
    assert integridad.puede_borrar_por_fecha(None, ahora=0.0) == (False, "anio_imposible")  # sin RTC: 1970
    assert integridad.puede_borrar_por_fecha(None, ahora=ahora)[0] is True
    integridad.apuntar_instante(ahora)
    assert integridad.puede_borrar_por_fecha(None, ahora=ahora - 3600) == (False, "reloj_atrasado")
    assert integridad.puede_borrar_por_fecha(ahora + 86400, ahora=ahora) == (False, "reloj_antes_del_ultimo_dato")


def test_el_ultimo_instante_visto_sobrevive_a_un_reinicio(tmp_path):
    integridad.iniciar_reloj(str(tmp_path))
    integridad.apuntar_instante(time.time())
    integridad.iniciar_reloj(str(tmp_path))  # «otro proceso»: lee el fichero
    assert integridad.hora_sana(time.time() - 7200) == (False, "reloj_atrasado")


def test_la_caducidad_no_borra_con_el_reloj_mal_y_si_con_la_hora_buena(monkeypatch):
    from backend.app.routers import field_proofs

    borradas = []
    monkeypatch.setattr(field_proofs, "caducar_pruebas", lambda dias, ahora=None: borradas.append(ahora) or 0)
    cfg = {"field_proof_retention_days": 30}
    assert main.caducar_con_guarda(cfg, ahora=0.0) == {"saltada": "anio_imposible"}
    assert borradas == []
    assert "pruebas" in main.caducar_con_guarda(cfg, ahora=time.time()) and len(borradas) == 1
    assert main.caducar_con_guarda(cfg)["saltada"] == "recien_arrancado"  # sin `ahora`: el reloj de verdad, recién arrancado


def test_una_hora_adelantada_que_ntp_corrige_no_deja_la_caducidad_muerta_para_siempre(tmp_path):
    integridad.iniciar_reloj(str(tmp_path))
    ahora = time.time()
    integridad.apuntar_instante(ahora + 86400 * 3)  # la Pi arrancó con 3 días de más y se apuntó
    assert integridad.hora_sana(ahora)[0] is False
    integridad.apuntar_instante(ahora)  # dentro de la gracia: no se acepta todavía
    assert integridad.hora_sana(ahora)[0] is False
    integridad._ARRANCO -= integridad.GRACIA_ARRANQUE_S + 1  # pasa el rato de gracia
    integridad.apuntar_instante(ahora)  # NTP ya corrigió: la hora de ahora es la verdad
    assert integridad.hora_sana(ahora) == (True, "ok")


def test_se_espera_a_una_hora_sana_pero_no_para_siempre(monkeypatch):
    horas = iter([0.0, 0.0, 1_900_000_000.0])
    monkeypatch.setattr(integridad.time, "time", lambda: next(horas, 1_900_000_000.0))
    dormidas = []
    assert integridad.esperar_hora_sana(maximo_s=60, cada_s=1, dormir=dormidas.append) is True and len(dormidas) == 2

    monkeypatch.setattr(integridad.time, "time", lambda: 0.0)
    assert integridad.esperar_hora_sana(maximo_s=0.0, dormir=lambda s: None) is False  # arranca igualmente...
    assert integridad.estado_del_reloj()["fiable"] is False  # ...con el aviso a la vista


# --- Hilos de fondo -----------------------------------------------------------------------------------------------


def test_un_hilo_que_deja_de_latir_se_ve_en_la_salud(monkeypatch):
    integridad.latido_de_hilo("caducidad", 3600)
    assert integridad.estado_de_hilos()["caducidad"]["vivo"] is True
    integridad.latido_de_hilo("caducidad", 3600, error=ValueError("boom"))
    assert integridad.estado_de_hilos()["caducidad"]["ultimo_error"] == "boom"
    integridad._HILOS["caducidad"]["ultima_vuelta"] = time.time() - 4 * 3600  # lleva cuatro horas sin dar una vuelta
    assert integridad.estado_de_hilos()["caducidad"]["vivo"] is False
    cuerpo = TestClient(main.app).get("/api/salud").json()
    assert cuerpo["hilos"]["caducidad"]["vivo"] is False


# --- Fotos de campo -----------------------------------------------------------------------------------------------


def test_el_barrido_marca_missing_las_fotos_sin_fichero_o_de_cero_bytes():
    from backend.app.routers import field_proofs

    field_proofs.init_field_proof_schema()
    base = field_proofs.resolve_field_proofs_dir()
    (base / "t").mkdir(parents=True, exist_ok=True)
    (base / "t" / "buena.jpg").write_bytes(b"x" * 10)
    (base / "t" / "vacia.jpg").write_bytes(b"")
    for pid, nombre in (("p_buena", "t/buena.jpg"), ("p_vacia", "t/vacia.jpg"), ("p_falta", "t/falta.jpg")):
        field_proofs.insert_field_proof_record({
            "id": pid, "user": "PLAYER 1", "display_name": "x", "stage_id": "", "stage_title": "", "lat": 0, "lon": 0,
            "note": "", "image_filename": nombre, "media_type": "image/jpeg", "created_at": int(time.time()),
            "visibility": "team", "status": "active", "content_sha256": pid, "client_id": pid, "es_original": True,
        })
    res = field_proofs.barrer_fotos_perdidas()
    assert sorted(res["ids"]) == ["p_falta", "p_vacia"] and res["perdidas"] == 2
    conn = field_proofs.connect_runtime_sqlite()
    estados = {r["id"]: r["status"] for r in conn.execute("SELECT id, status FROM field_proofs WHERE id LIKE 'p\\_%' ESCAPE '\\'")}
    conn.close()
    assert estados == {"p_buena": "active", "p_vacia": "missing", "p_falta": "missing"}


def test_el_barrido_no_marca_nada_si_la_carpeta_entera_falta():
    from backend.app.routers import field_proofs

    field_proofs.init_field_proof_schema()
    conn = field_proofs.connect_runtime_sqlite()
    conn.execute("DELETE FROM field_proofs")
    conn.commit()
    conn.close()
    for i in range(7):
        field_proofs.insert_field_proof_record({
            "id": f"q{i}", "user": "PLAYER 1", "display_name": "x", "stage_id": "", "stage_title": "", "lat": 0, "lon": 0,
            "note": "", "image_filename": f"nada/q{i}.jpg", "media_type": "image/jpeg", "created_at": int(time.time()),
            "visibility": "team", "status": "active", "content_sha256": f"q{i}", "client_id": f"q{i}", "es_original": True,
        })
    res = field_proofs.barrer_fotos_perdidas()  # carpeta sin montar tras una restauración a medias
    assert res["perdidas"] == 0 and res["carpeta_vacia"] is True


def test_guardar_una_foto_hace_fsync_del_fichero(tmp_path, monkeypatch):
    from backend.app.routers import field_proofs

    sincronizados = []
    real = os.fsync
    monkeypatch.setattr(os, "fsync", lambda fd: (sincronizados.append(fd), real(fd))[1])
    field_proofs._guardar_foto_y_miniatura(tmp_path / "a" / "f.jpg", b"datos", tmp_path / "a" / "f_mini.jpg")
    assert sincronizados, "la foto se escribía sin fsync: tras un corte quedaba un fichero de 0 bytes"
    assert (tmp_path / "a" / "f.jpg").read_bytes() == b"datos"


# --- Configuración ------------------------------------------------------------------------------------------------


def test_si_falta_la_fila_config_en_sqlite_se_importa_config_json_sin_tocarlo(tmp_path, monkeypatch):
    monkeypatch.delenv("SAGA_SQLITE_DB", raising=False)
    json_path = str(tmp_path / "config.json")
    json_store.save_json(json_path, {"site_name": "Mi ruta", "players": ["Ana", "Luis"]})
    antes = open(json_path, "rb").read()

    assert runtime_store.load_document(json_path, "config", {"site_name": "PUT TITLE HERE"})["site_name"] == "PUT TITLE HERE"
    assert runtime_store.importar_documento_si_falta(json_path, "config") is True  # lo que hace el arranque
    cfg = runtime_store.load_document(json_path, "config", {"site_name": "PUT TITLE HERE"})
    assert cfg["site_name"] == "Mi ruta" and cfg["players"] == ["Ana", "Luis"]
    assert runtime_store.importar_documento_si_falta(json_path, "config") is False  # ya está: no vuelve a importar
    assert open(json_path, "rb").read() == antes  # el JSON de siempre no se ha tocado
    db = runtime_store.resolve_runtime_db_path(json_path)
    assert sqlite_store.load_sqlite_document(db, "config", None)["site_name"] == "Mi ruta"  # y ya vive en SQLite


def test_sin_json_ni_fila_config_se_usa_el_valor_por_defecto(tmp_path):
    json_path = str(tmp_path / "otra" / "config.json")
    assert runtime_store.importar_documento_si_falta(json_path, "config") is False
    assert runtime_store.load_document(json_path, "config", {"site_name": "x"}) == {"site_name": "x"}
    otro = str(tmp_path / "player_pins.json")
    json_store.save_json(otro, {"pins": {"ana": {}}})
    assert runtime_store.importar_documento_si_falta(otro, "player_pins") is False  # sólo la configuración se resucita


# --- Coherencia ---------------------------------------------------------------------------------------------------


def test_la_coherencia_corrige_lo_seguro_y_avisa_del_resto(tmp_path):
    db = str(tmp_path / "c.sqlite3")
    sqlite_store.save_sqlite_game_state(db, {"Ana": 9, "Fantasma": 1})  # 9 > 3 nodos
    informe = integridad.comprobar_coherencia(db, ["a", "b", "c"], perfiles=["Ana"], corregir=False)
    assert informe["corregidos"] == [{"usuario": "Ana", "campo": "nivel", "antes": 9, "despues": 3}]
    assert sqlite_store.load_sqlite_game_state(db)["Ana"] == 9  # sólo informa

    informe = integridad.comprobar_coherencia(db, ["a", "b", "c"], perfiles=["Ana"], corregir=True)
    assert sqlite_store.load_sqlite_game_state(db) == {"Ana": 3, "Fantasma": 1}
    assert {"usuario": "Fantasma", "problema": "sin_perfil"} in informe["avisos"]  # no se borra: se avisa
    assert integridad.comprobar_coherencia(db, [], perfiles=[], corregir=True)["corregidos"] == []  # misión vacía: no se toca


def test_subir_el_nivel_con_advance_player_level_no_pierde_subidas_a_la_vez(tmp_path):
    db = str(tmp_path / "n.sqlite3")
    sqlite_store.set_sqlite_player_level(db, "ana", 0)
    hilos = [threading.Thread(target=sqlite_store.advance_sqlite_player_level, args=(db, "ana")) for _ in range(8)]
    [h.start() for h in hilos]
    [h.join() for h in hilos]
    assert sqlite_store.get_sqlite_player_level(db, "ana") == 8


# --- Sesión del admin ---------------------------------------------------------------------------------------------


def test_crear_una_sesion_de_admin_espera_al_candado_de_las_comprobaciones():
    hecho = []
    with main._ADMIN_SESSIONS_LOCK:
        t = threading.Thread(target=lambda: hecho.append(main.create_admin_session()))
        t.start()
        t.join(0.3)
        assert t.is_alive() and not hecho  # sin el candado, crear y comprobar a la vez perdían la sesión nueva
    t.join(5)
    assert len(hecho) == 1 and main.verify_admin_session_token(hecho[0])


# --- Perfil desconocido y PIN sin asignar -------------------------------------------------------------------------


def test_un_jugador_que_ya_no_existe_no_avanza_ni_pide_el_paquete(monkeypatch):
    monkeypatch.setattr(main, "EXIGIR_PERFIL_CONOCIDO", True)
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    c = TestClient(main.app)
    r = c.post("/api/advance", json={"user": "Borrada Del Panel", "code": "OK", "level_before": 0})
    assert r.status_code == 403 and r.json()["detail"] == "unknown player"
    r = c.get("/api/game/Borrada Del Panel")
    assert r.status_code == 403 and r.json()["detail"] == "unknown player"
    assert main.get_player_progress_level("Borrada Del Panel", 0) == 0  # y no se escribió nada de ella


def test_un_jugador_conocido_sigue_entrando(monkeypatch):
    monkeypatch.setattr(main, "EXIGIR_PERFIL_CONOCIDO", True)
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    assert TestClient(main.app).get("/api/game/PLAYER 1").status_code == 200


def test_un_jugador_sin_pin_asignado_no_gasta_intentos_y_oye_la_verdad(tmp_path, monkeypatch):
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(main.admin_auth_security, "hash_password",
                        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations))
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "PLAYER_PINS_DB", str(tmp_path / "player_pins.json"))
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "")
    monkeypatch.setattr(pines_jugador, "INTENTOS", {})
    assert main.resolve_known_player_profile("PLAYER 2")
    pin = pines_jugador.generar(["PLAYER 1"])["PLAYER 1"]  # los PINs se generaron ANTES de añadir a PLAYER 2
    c = TestClient(main.app)
    for _ in range(7):  # más que los 5 intentos que bloquean
        r = c.post("/api/jugador/entrar", json={"user": "PLAYER 2", "pin": "123456"})
        assert r.status_code == 403 and r.json()["detail"] == "player has no pin"
    assert all(not v.get("locked_until") for v in pines_jugador.INTENTOS.values())  # no cuenta como contraseña mal puesta
    assert c.post("/api/jugador/entrar", json={"user": "PLAYER 1", "pin": pin}).status_code == 200  # el resto, igual


# --- Mosaico ------------------------------------------------------------------------------------------------------


def test_una_imagen_de_mosaico_demasiado_grande_o_de_otro_tipo_se_avisa_al_guardar():
    from backend.app.runtime.minigames import MOSAIC_IMAGE_MAX_CHARS, validate_minigame_config

    def errores(cfg):
        return [campo for campo, _ in validate_minigame_config("circuit_matrix", {"game_id": "place_mosaic", **cfg})]

    assert errores({}) == []  # sin imagen, como siempre
    assert errores({"image_data_url": "data:image/png;base64,AAAA"}) == []
    assert errores({"image_data_url": "data:image/png;base64," + "A" * MOSAIC_IMAGE_MAX_CHARS}) == ["config.image_data_url"]
    assert errores({"image_data_url": "data:image/gif;base64,AAAA"}) == ["config.image_data_url"]
    assert errores({"image_data_url": "https://x.example/foto.png"}) == ["config.image_data_url"]


# --- /api/admin/coherencia ----------------------------------------------------------------------------------------


def test_el_panel_puede_revisar_y_corregir_la_coherencia(monkeypatch):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    runtime_store.save_stages(main.STAGES_DB, _mision(["a", "b"]))
    main.save_game_state(main.GAME_DB, {"PLAYER 1": 7})
    c = TestClient(main.app)
    r = c.post("/api/admin/coherencia", json={}).json()
    assert r["corregir"] is False and r["corregidos"][0]["despues"] == 2 and main.load_game_state(main.GAME_DB)["PLAYER 1"] == 7
    r = c.post("/api/admin/coherencia", json={"corregir": True}).json()
    assert main.load_game_state(main.GAME_DB)["PLAYER 1"] == 2
