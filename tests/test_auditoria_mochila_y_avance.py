# -*- coding: utf-8 -*-
"""Auditoría del 04/10/2026: mochila de principio a fin, premios de minijuego,
avances por delante en la cola y penalizaciones que decidía el móvil.

Todo con una misión SINTÉTICA (ningún dato de la ruta real) que reproduce el
caso que importa: un minijuego da un premio, un coleccionable da una gema, y
dos nodos posteriores piden esos objetos. Se prueba COMPORTAMIENTO contra el
servidor de verdad (TestClient), no el texto del código.

  n0 (301) Simón con premio «llave_prueba»
  n1 (302) coleccionable de mapa «gema_prueba» (x2)
  n2 (303) pide «llave_prueba» (no la gasta)
  n3 (304) pide 2 «gema_prueba» y las GASTA
  n4 (305) punto final con código de respaldo «RESCATE-305»
"""
import os
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-auditoria-mochila-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import mochila  # noqa: E402
from backend.app.runtime.core_engine import normalize_stage, read_stage_reward  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
BASE = {"lat": 40.5, "lon": -3.5, "radius": 25}


def mision_sintetica():
    return [
        {
            "id": 301,
            "title": "Simón con premio",
            **BASE,
            "minigame": {"type": "circuit_matrix", "config": {"game_id": "sequence_code"}},
            "config": {
                "game_id": "sequence_code",
                "reward_item_id": "llave_prueba",
                "reward_item_label": "Llave de prueba",
                "reward_message": "¡Toma la llave de prueba!",
            },
        },
        {
            "id": 302,
            "title": "Gemas",
            **BASE,
            "physical_node_kind": "collectible",
            "physical_item_id": "gema_prueba",
            "physical_item_label": "Gema de prueba",
            "physical_item_quantity": 2,
            "is_map_collectible": True,
            "minigame": {"type": "checkpoint", "config": {}},
            "config": {
                "is_map_collectible": True,
                "reward_item_id": "gema_prueba",
                "reward_item_label": "Gema de prueba",
            },
        },
        {
            "id": 303,
            "title": "Puerta de la llave",
            **BASE,
            "minigame": {"type": "checkpoint", "config": {}},
            "config": {"required_item_id": "llave_prueba", "required_item_label": "Llave de prueba"},
        },
        {
            "id": 304,
            "title": "Altar de gemas",
            **BASE,
            "minigame": {"type": "checkpoint", "config": {}},
            "config": {
                "required_item_id": "gema_prueba",
                "required_item_quantity": 2,
                "required_item_consume": True,
            },
        },
        {
            "id": 305,
            "title": "Final",
            **BASE,
            "minigame": {"type": "checkpoint", "config": {}},
            "config": {"success_code": "RESCATE-305"},
        },
    ]


def _hace(minutos):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutos)).isoformat().replace("+00:00", "Z")


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, mision_sintetica())
    main.set_player_progress_level(USUARIO, 0)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _avanzar(cliente, nivel, code="OK", **extra):
    cuerpo = {"user": USUARIO, "code": code, "time_spent_ms": 20_000, "level_before": nivel, **extra}
    resposta = cliente.post("/api/advance", json=cuerpo)
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _sync(cliente, eventos, mochila_movil=None):
    cuerpo = {"user": USUARIO, "events": eventos}
    if mochila_movil is not None:
        cuerpo["inventory_snapshot"] = mochila_movil
    resposta = cliente.post("/api/events/sync", json=cuerpo)
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _avance_en_cola(nivel, minutos, code="OK", cid=None, **extra):
    return {
        "client_event_id": cid or f"avance-{nivel}",
        "type": "node_completed",
        "source": "offline_queue",
        "payload": {
            "code": code,
            "level_before": nivel,
            "level_after": nivel + 1,
            "time_spent_ms": 15_000,
            "penalty_ms": 0,
            "local_created_at": _hace(minutos),
            **extra,
        },
    }


def _recogida_en_cola(item, cantidad, grant, minutos, cid=None, nodo=""):
    """Lo que encola `collectInventoryItem` del móvil (qr_scanned con la mochila dentro)."""
    return {
        "client_event_id": cid or f"recogida-{grant}",
        "type": "qr_scanned",
        "source": "manual",
        "node_id": nodo,
        "payload": {
            "inventory_item_id": item,
            "inventory_label": item,
            "inventory_quantity": cantidad,
            "inventory_action": "collected",
            "grant_id": grant,
            "local_created_at": _hace(minutos),
        },
    }


def _cuenta(item):
    return main.count_player_inventory_item(USUARIO, item)


# ---------------------------------------------------------------------------
# P0 · el premio del minijuego se entrega
# ---------------------------------------------------------------------------


def test_el_premio_se_lee_del_nodo_crudo_y_un_coleccionable_no_tiene_premio_aparte():
    simon, gemas = mision_sintetica()[:2]
    assert read_stage_reward(simon) == {
        "item_id": "llave_prueba",
        "label": "Llave de prueba",
        "quantity": 1,
        "message": "¡Toma la llave de prueba!",
    }
    # El editor pone el mismo id en reward_item_id del coleccionable: no son dos.
    assert read_stage_reward(gemas) is None
    # Y llega al nodo normalizado, que es lo que usa el servidor al avanzar.
    assert normalize_stage(simon)["reward"]["item_id"] == "llave_prueba"
    assert "reward" not in normalize_stage(gemas)


def test_el_premio_viaja_al_movil_en_la_partida(cliente):
    partida = cliente.get("/api/game/PLAYER%201").json()
    assert partida["current_stage"]["reward"]["item_id"] == "llave_prueba"
    assert partida["current_stage"]["reward"]["message"] == "¡Toma la llave de prueba!"


def test_superar_el_minijuego_entrega_el_premio_una_sola_vez(cliente):
    respuesta = _avanzar(cliente, 0)
    assert respuesta["status"] == "ok"
    assert respuesta["reward"]["item_id"] == "llave_prueba"
    assert respuesta["reward"]["grant_id"] == "reward:301"
    assert _cuenta("llave_prueba") == 1

    # El eco del mismo avance (respuesta perdida, el móvil reintenta) no da otra.
    eco = _avanzar(cliente, 0)
    assert eco.get("duplicate") is True
    # Y el móvil, que también lo mete en su cola con la misma clave, tampoco.
    _sync(cliente, [_recogida_en_cola("llave_prueba", 1, "reward:301", 1, nodo="301")])
    assert _cuenta("llave_prueba") == 1


def test_ruta_completa_con_red_premio_coleccionable_y_nodos_que_los_piden(cliente):
    _avanzar(cliente, 0)
    # El coleccionable: el móvil encola la recogida ANTES del avance.
    _sync(cliente, [_recogida_en_cola("gema_prueba", 2, "collect:302", 1, nodo="302")])
    assert _avanzar(cliente, 1)["status"] == "ok"
    assert _avanzar(cliente, 2)["status"] == "ok", "la llave del premio abre el nodo"
    assert _avanzar(cliente, 3)["status"] == "ok", "las dos gemas abren el altar"
    assert _cuenta("gema_prueba") == 0, "el altar las gasta"
    assert _cuenta("llave_prueba") == 1
    assert main.get_player_progress_level(USUARIO, 0) == 4


def test_ruta_entera_sin_red_por_la_cola_y_subida_dos_veces(cliente):
    cola = [
        _avance_en_cola(0, 40),
        # El móvil entrega el premio al superar el minijuego (también sin red).
        _recogida_en_cola("llave_prueba", 1, "reward:301", 39, nodo="301"),
        _recogida_en_cola("gema_prueba", 2, "collect:302", 35, nodo="302"),
        _avance_en_cola(1, 34),
        _avance_en_cola(2, 30),
        _avance_en_cola(3, 25),
    ]
    respuesta = _sync(cliente, cola)
    assert [e["status"] for e in respuesta["events"] if e["type"] == "node_completed"] == ["synced"] * 4
    assert main.get_player_progress_level(USUARIO, 0) == 4
    # Servidor y móvil entregaron la llave con la misma clave: cuenta una.
    assert _cuenta("llave_prueba") == 1

    # La cola se vuelve a mandar entera (no vio la respuesta): nada cambia.
    segunda = _sync(cliente, cola)
    assert all(e["duplicate"] for e in segunda["events"])
    assert _cuenta("llave_prueba") == 1
    assert _cuenta("gema_prueba") == 0


def test_el_nodo_que_pide_la_gema_no_se_bloquea_si_la_recogida_va_antes_en_la_misma_tanda(cliente):
    _avanzar(cliente, 0)
    _avanzar(cliente, 1)  # avance del coleccionable llegó, la recogida no
    _avanzar(cliente, 2)
    tanda = [
        _recogida_en_cola("gema_prueba", 2, "collect:302", 10, nodo="302"),
        _avance_en_cola(3, 5),
    ]
    respuesta = _sync(cliente, tanda)
    assert respuesta["events"][1]["status"] == "synced", respuesta
    assert main.get_player_progress_level(USUARIO, 0) == 4


def test_la_mochila_subida_en_la_misma_llamada_tambien_abre_el_nodo(cliente):
    """La gema sólo en la copia del móvil (sin evento): el avance de la cola pasa igual."""
    _avanzar(cliente, 0)
    _avanzar(cliente, 1)
    _avanzar(cliente, 2)
    copia = {
        "user": USUARIO,
        "updated_at": _hace(0),
        "items": [{"item_id": "gema_prueba", "label": "Gema", "state": "collected", "quantity": 2}],
    }
    respuesta = _sync(cliente, [_avance_en_cola(3, 1)], mochila_movil=copia)
    assert respuesta["events"][0]["status"] == "synced"


# ---------------------------------------------------------------------------
# Integridad de la mochila
# ---------------------------------------------------------------------------


def test_con_la_cache_borrada_el_servidor_devuelve_lo_recogido_por_eventos(cliente):
    _sync(
        cliente,
        [
            _avance_en_cola(0, 20),
            _recogida_en_cola("gema_prueba", 2, "collect:302", 18, nodo="302"),
        ],
    )
    # El móvil nunca llegó a subir su copia (se borró la caché antes).
    partida = cliente.get("/api/game/PLAYER%201").json()
    objetos = {o["item_id"]: o for o in partida["inventory_snapshot"]["items"]}
    assert objetos["gema_prueba"]["quantity"] == 2
    assert objetos["llave_prueba"]["quantity"] == 1
    claves = {g["grant_id"] for g in partida["inventory_snapshot"]["grants"]}
    assert {"reward:301", "collect:302"} <= claves


def test_subir_la_mochila_no_borra_lo_que_el_movil_no_menciona(cliente):
    main.save_player_inventory(
        USUARIO,
        {"user": USUARIO, "items": [{"item_id": "sello", "label": "Sello", "state": "collected", "quantity": 1}]},
    )
    # Otro móvil (o el mismo con la caché borrada) sube sólo lo suyo.
    main.save_player_inventory(
        USUARIO,
        {"user": USUARIO, "items": [{"item_id": "gema_prueba", "label": "Gema", "state": "collected", "quantity": 1}]},
    )
    guardada = {o["item_id"] for o in main.load_inventory_state()[USUARIO]["items"]}
    assert guardada == {"sello", "gema_prueba"}


def test_lo_gastado_al_fabricar_no_resucita(cliente):
    _sync(
        cliente,
        [
            _recogida_en_cola("gema_prueba", 2, "collect:302", 20, nodo="302"),
            # La mesa de trabajo: gasta las dos gemas y da un sello.
            {
                "client_event_id": "forja-in",
                "type": "qr_scanned",
                "source": "manual",
                "payload": {
                    "inventory_item_id": "gema_prueba",
                    "inventory_action": "used",
                    "inventory_quantity": 2,
                    "grant_id": "craft:sello:x1:in:gema_prueba",
                    "local_created_at": _hace(10),
                },
            },
            {
                "client_event_id": "forja-out",
                "type": "qr_scanned",
                "source": "manual",
                "payload": {
                    "inventory_item_id": "sello",
                    "inventory_label": "Sello",
                    "inventory_action": "collected",
                    "inventory_quantity": 1,
                    "grant_id": "craft:sello:x1:out:sello",
                    "local_created_at": _hace(10),
                },
            },
        ],
    )
    assert _cuenta("gema_prueba") == 0
    assert _cuenta("sello") == 1
    partida = cliente.get("/api/game/PLAYER%201").json()
    objetos = {o["item_id"]: o for o in partida["inventory_snapshot"]["items"]}
    assert "gema_prueba" not in objetos, "las gemas gastadas no vuelven al móvil"
    assert objetos["sello"]["quantity"] == 1


def test_el_reinicio_vacia_la_mochila_y_lo_de_despues_cuenta(cliente):
    _sync(cliente, [_recogida_en_cola("gema_prueba", 2, "collect:302", 30, nodo="302")])
    assert _cuenta("gema_prueba") == 2

    respuesta = cliente.post("/api/admin/profile-action", json={"profile_id": USUARIO, "action": "reset_profile"})
    assert respuesta.status_code == 200, respuesta.text
    assert _cuenta("gema_prueba") == 0

    # Una recogida de la partida NUEVA (con su hora de después del reinicio).
    _sync(cliente, [_recogida_en_cola("gema_prueba", 2, "collect:302", -1, cid="nueva", nodo="302")])
    assert _cuenta("gema_prueba") == 2


def test_quitar_un_objeto_desde_el_panel_no_tira_los_demas_ni_los_avances_en_cola(cliente):
    _sync(
        cliente,
        [
            _recogida_en_cola("gema_prueba", 2, "collect:302", 30, nodo="302"),
            _recogida_en_cola("llave_prueba", 1, "reward:301", 30, nodo="301"),
        ],
    )
    respuesta = cliente.post(
        "/api/admin/profile-action", json={"profile_id": USUARIO, "action": "remove_item:llave_prueba"}
    )
    assert respuesta.status_code == 200
    assert _cuenta("llave_prueba") == 0
    assert _cuenta("gema_prueba") == 2, "quitar la llave no puede tirar las gemas"

    # Un avance hecho sin red ANTES de quitar la llave sigue valiendo.
    sincronizado = _sync(cliente, [_avance_en_cola(0, 20, cid="previo")])
    assert sincronizado["events"][0]["status"] == "synced"


def test_dar_objeto_desde_el_panel_suma_aunque_el_movil_ya_lo_tenga(cliente):
    _sync(cliente, [_recogida_en_cola("gema_prueba", 1, "collect:otra", 10)])
    copia = {
        "user": USUARIO,
        "updated_at": _hace(0),
        "items": [{"item_id": "gema_prueba", "label": "Gema", "state": "collected", "quantity": 1}],
    }
    main.save_player_inventory(USUARIO, copia)

    respuesta = cliente.post(
        "/api/admin/profile-action", json={"profile_id": USUARIO, "action": "give_item:gema_prueba"}
    )
    assert respuesta.status_code == 200
    # El nodo de las gemas entrega 2: «Dar» da las mismas, no 1.
    assert _cuenta("gema_prueba") == 3

    # El móvil vuelve a subir su copia vieja (1 gema): no se pierden.
    main.save_player_inventory(USUARIO, copia)
    assert _cuenta("gema_prueba") == 3

    # Y la entrega viaja con su clave para que el móvil sume aunque ya la tenga.
    partida = cliente.get("/api/game/PLAYER%201").json()
    entregas = [g for g in partida["inventory_snapshot"]["grants"] if g["grant_id"].startswith("admin:")]
    assert entregas and entregas[0]["quantity"] == 2


def test_dar_objeto_respeta_mayusculas_y_cantidad_pedida(cliente):
    respuesta = cliente.post(
        "/api/admin/profile-action",
        json={"profile_id": USUARIO, "action": "give_item:Llave_Mayus", "quantity": 3},
    )
    assert respuesta.status_code == 200
    assert _cuenta("Llave_Mayus") == 3
    assert _cuenta("llave_mayus") == 0


def test_mochila_cuenta_cada_entrega_una_vez_y_respeta_la_marca_de_inventario():
    viejo = {"type": "inventory_item_collected", "created_at": "2020-01-01T00:00:00Z",
             "payload": {"inventory_item_id": "a", "inventory_quantity": 1}}
    doble = {"type": "inventory_item_collected", "payload": {"inventory_item_id": "a", "grant_id": "g1"}}
    assert mochila.contar_objeto([doble, doble], {}, "u", "a") == 1
    marca = int(datetime(2021, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    assert mochila.contar_objeto([viejo], {"inventory_reset_at": marca}, "u", "a") == 0
    # Una base vieja sin marcas separadas usa `reset_at`.
    assert mochila.contar_objeto([viejo], {"reset_at": marca}, "u", "a") == 0
    assert mochila.contar_objeto([viejo], {}, "u", "a") == 1


# ---------------------------------------------------------------------------
# P1 · avance por delante en la cola, penalizaciones
# ---------------------------------------------------------------------------


def test_un_avance_de_la_cola_por_delante_no_se_aplica_ni_se_pierde(cliente):
    adelantado = _avance_en_cola(2, 5, cid="adelantado")
    respuesta = _sync(cliente, [adelantado])
    evento = respuesta["events"][0]
    assert evento["status"] == "failed"
    assert evento["error"] == "behind"
    assert main.get_player_progress_level(USUARIO, 0) == 0

    # No quedó guardado: cuando llegan los anteriores, el mismo evento entra.
    _sync(cliente, [_avance_en_cola(0, 30), _recogida_en_cola("gema_prueba", 2, "collect:302", 29), _avance_en_cola(1, 28)])
    segunda = _sync(cliente, [adelantado])
    assert segunda["events"][0]["status"] == "synced"
    assert segunda["events"][0]["duplicate"] is False
    assert main.get_player_progress_level(USUARIO, 0) == 3


def _penalizacion():
    return main.load_player_timers().get(USUARIO, {}).get("penalties_ms", 0)


def test_el_codigo_a_mano_cuesta_dos_minutos_aunque_el_movil_mande_cero(cliente):
    main.set_player_progress_level(USUARIO, 4)
    respuesta = _avanzar(cliente, 4, code="RESCATE-305", manual=True, penalty_ms=0)
    assert respuesta["status"] == "ok"
    assert _penalizacion() >= 120_000


def test_el_codigo_a_mano_por_la_cola_tambien_cuesta_dos_minutos(cliente):
    main.set_player_progress_level(USUARIO, 4)
    respuesta = _sync(cliente, [_avance_en_cola(4, 2, code="RESCATE-305", manual=True)])
    assert respuesta["events"][0]["status"] == "synced"
    assert _penalizacion() >= 120_000


def test_el_movil_puede_pedir_mas_penalizacion_pero_no_menos(cliente):
    main.set_player_progress_level(USUARIO, 4)
    _avanzar(cliente, 4, code="RESCATE-305", manual=True, penalty_ms=300_000)
    assert _penalizacion() == 300_000


def test_el_modo_alternativo_de_un_juego_de_sensores_cuesta_un_minuto(cliente):
    _avanzar(cliente, 0, evidence={"v": 1, "via": "juego", "modo_alternativo": True})
    assert _penalizacion() >= 60_000


def test_el_codigo_de_juego_sin_marca_no_penaliza(cliente):
    _avanzar(cliente, 0)
    assert _penalizacion() == 0


# ---------------------------------------------------------------------------
# P1 · fotos: client_id único
# ---------------------------------------------------------------------------


def test_migracion_del_indice_unico_de_fotos_no_borra_ninguna(tmp_path, monkeypatch):
    from backend.app.routers import field_proofs as fotos

    ruta = tmp_path / "fotos.sqlite3"
    monkeypatch.setenv("SAGA_SQLITE_DB", str(ruta))
    conn = sqlite3.connect(ruta)
    conn.execute(
        "CREATE TABLE field_proofs (id TEXT PRIMARY KEY, user TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',"
        " stage_id TEXT NOT NULL DEFAULT '', stage_title TEXT NOT NULL DEFAULT '', lat REAL NOT NULL,"
        " lon REAL NOT NULL, note TEXT NOT NULL DEFAULT '', image_filename TEXT NOT NULL, media_type TEXT NOT NULL,"
        " created_at INTEGER NOT NULL, visibility TEXT NOT NULL DEFAULT 'team', status TEXT NOT NULL DEFAULT 'active',"
        " content_sha256 TEXT NOT NULL DEFAULT '', client_id TEXT NOT NULL DEFAULT '')"
    )
    for i in range(3):
        conn.execute(
            "INSERT INTO field_proofs (id, user, lat, lon, image_filename, media_type, created_at, client_id)"
            " VALUES (?, 'J', 1, 2, 'f.jpg', 'image/jpeg', ?, 'repetida')",
            (f"p{i}", i),
        )
    conn.commit()
    conn.close()

    fotos.init_field_proof_schema()

    conn = sqlite3.connect(ruta)
    filas = conn.execute("SELECT id, client_id FROM field_proofs ORDER BY id").fetchall()
    indices = {fila[1] for fila in conn.execute("PRAGMA index_list(field_proofs)").fetchall()}
    conn.close()
    assert len(filas) == 3, "no se borra ninguna foto"
    assert [f[1] for f in filas] == ["repetida", "", ""]
    assert "idx_field_proofs_user_client_id" in indices


@pytest.fixture
def cliente_fotos(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _jpeg(color):
    import io

    from PIL import Image

    salida = io.BytesIO()
    Image.new("RGB", (32, 32), color).save(salida, "JPEG")
    import base64

    return "data:image/jpeg;base64," + base64.b64encode(salida.getvalue()).decode("ascii")


def test_la_misma_foto_con_el_mismo_client_id_no_se_duplica_aunque_cambie_el_contenido(cliente_fotos):
    primera = cliente_fotos.post(
        "/api/field-proofs",
        json={"user": USUARIO, "lat": 40.5, "lon": -3.5, "image_data_url": _jpeg((10, 200, 10)), "client_proof_id": "photo_abc"},
    )
    assert primera.status_code == 200, primera.text
    # La cola manda la misma foto (re-comprimida, otro sha) con el mismo id.
    segunda = cliente_fotos.post(
        "/api/field-proofs",
        json={"user": USUARIO, "lat": 40.5, "lon": -3.5, "image_data_url": _jpeg((10, 190, 10)), "client_proof_id": "photo_abc"},
    )
    assert segunda.status_code == 200
    assert segunda.json()["duplicate"] is True
    assert segunda.json()["proof"]["id"] == primera.json()["proof"]["id"]


def test_una_foto_sin_posicion_conocida_se_puede_reintentar(cliente_fotos, monkeypatch):
    monkeypatch.setattr(main, "get_live_position", lambda user: None)
    respuesta = cliente_fotos.post(
        "/api/field-proofs", json={"user": USUARIO, "image_data_url": _jpeg((1, 2, 3)), "client_proof_id": "photo_x"}
    )
    # 409 (reintentable), no 400 (que el móvil daría por perdida).
    assert respuesta.status_code == 409


def test_una_foto_sin_gps_usa_la_ultima_posicion_en_vivo(cliente_fotos, monkeypatch):
    monkeypatch.setattr(main, "get_live_position", lambda user: {"lat": 40.6, "lon": -3.4})
    respuesta = cliente_fotos.post(
        "/api/field-proofs", json={"user": USUARIO, "image_data_url": _jpeg((5, 5, 200)), "client_proof_id": "photo_y"}
    )
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["proof"]["lat"] == 40.6
