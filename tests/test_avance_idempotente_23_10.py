# -*- coding: utf-8 -*-
"""Auditoría 23/10/2026: el almacén ya no se traga los errores, y por eso el
avance tiene que aguantar el reintento.

- Un fichero que existe y no se puede leer ya no se trata como `{}`: antes
  `update_json` escribía encima sólo la entrada del jugador de turno.
- Un error de escritura sube como 503 (antes: «ok» sin haber guardado).
- Si falla la última escritura del avance (el nivel), el móvil reintenta: la
  penalización se cobra UNA vez y el objeto requerido se gasta UNA vez, sin
  `missing_required_item`, en línea y por la cola.
- /api/salud da 503 con un fallo de escritura reciente y dice por qué.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-avance-idempotente-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.storage import json_store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
BASE = {"lat": 40.5, "lon": -3.5, "radius": 25}
PENALIZACION = 30_000


@pytest.fixture(autouse=True)
def salud_limpia(monkeypatch):
    """Los fallos que provocan estas pruebas no pueden poner /api/salud en 503 a otras."""
    monkeypatch.setattr(
        json_store, "_FALLOS", {"total": 0, "lock_timeouts": 0, "ultimo": None, "ultima_escritura_fallida": None}
    )


def _mision():
    return [
        {
            "id": 401,
            "title": "Puerta que gasta la llave",
            **BASE,
            "minigame": {"type": "checkpoint", "config": {}},
            "config": {"required_item_id": "llave_idem", "required_item_consume": True},
        },
        {"id": 402, "title": "Final", **BASE, "minigame": {"type": "checkpoint", "config": {}}, "config": {}},
    ]


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, _mision())
    main.set_player_progress_level(USUARIO, 0)
    main.append_event(
        main.EVENT_LOG_DB,
        {
            "type": "inventory_item_collected",
            "status": "synced",
            "source": "backend_reward",
            "user": USUARIO,
            "team_id": USUARIO,
            "node_id": "0",
            "payload": {"inventory_item_id": "llave_idem", "inventory_action": "collected", "inventory_quantity": 1},
        },
    )
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    assert main.count_player_inventory_item(USUARIO, "llave_idem") == 1
    return cliente


def _falla_el_nivel_una_vez(monkeypatch):
    """La ÚLTIMA escritura del avance falla con disco lleno la primera vez."""
    real = main.set_player_progress_level
    veces = {"n": 0}

    def nivel(user, level, *a, **k):
        veces["n"] += 1
        if veces["n"] == 1:
            raise json_store.ErrorDeAlmacen(28, "No space left on device")
        return real(user, level, *a, **k)

    monkeypatch.setattr(main, "set_player_progress_level", nivel)


def _gastos():
    return [
        e for e in main.list_events(main.EVENT_LOG_DB, user=USUARIO, limit=1000)
        if e.get("type") == "inventory_item_used"
    ]


def _comprobar_una_sola_vez():
    entrada = main.load_player_timers()[USUARIO]
    assert entrada["penalties_ms"] == PENALIZACION, "la penalización se cobró dos veces"
    assert entrada["nodos"]["0"]["penalty_ms"] == PENALIZACION
    assert main.get_player_progress_level(USUARIO, 0) == 1
    assert main.count_player_inventory_item(USUARIO, "llave_idem") == 0
    assert len(_gastos()) == 1, "el objeto se gastó dos veces"
    assert _gastos()[0]["payload"]["grant_id"] == "use:401"


def test_avance_en_linea_reintentado_tras_503_cobra_y_gasta_una_vez(cliente, monkeypatch):
    _falla_el_nivel_una_vez(monkeypatch)
    cuerpo = {"user": USUARIO, "code": "OK", "time_spent_ms": 20_000, "level_before": 0, "penalty_ms": PENALIZACION}

    primera = cliente.post("/api/advance", json=cuerpo)
    assert primera.status_code == 503 and primera.headers["retry-after"]
    assert primera.json()["detail"] == "storage_write_failed"

    segunda = cliente.post("/api/advance", json=cuerpo)
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["status"] == "ok", segunda.json()
    _comprobar_una_sola_vez()


def test_avance_por_la_cola_reintentado_tras_503_cobra_y_gasta_una_vez(cliente, monkeypatch):
    _falla_el_nivel_una_vez(monkeypatch)
    hace = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat().replace("+00:00", "Z")
    tanda = {
        "user": USUARIO,
        "events": [{
            "client_event_id": "avance-idem-0",
            "type": "node_completed",
            "source": "offline_queue",
            "payload": {
                "code": "OK", "level_before": 0, "level_after": 1, "time_spent_ms": 15_000,
                "penalty_ms": PENALIZACION, "local_created_at": hace,
            },
        }],
    }

    assert cliente.post("/api/events/sync", json=tanda).status_code == 503
    segunda = cliente.post("/api/events/sync", json=tanda)
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["events"][0]["status"] == "synced", segunda.json()
    _comprobar_una_sola_vez()


def test_un_fichero_ilegible_no_se_pisa_se_aparta_y_lanza(tmp_path):
    fichero = tmp_path / "game_timers.json"
    roto = '{"A": {"penalties_ms": 1}, "B": '
    fichero.write_text(roto, encoding="utf-8")

    with pytest.raises(json_store.ErrorDeAlmacen):
        json_store.update_json(str(fichero), {}, lambda t: {**t, "C": {"penalties_ms": 5}})

    assert fichero.read_text(encoding="utf-8") == roto, "se escribió encima del fichero ilegible"
    copias = list(tmp_path.glob("game_timers.json.corrupt-*"))
    assert len(copias) == 1 and copias[0].read_text(encoding="utf-8") == roto
    assert json_store.storage_health()["ultima_escritura_fallida"]["tipo"] == "read_error"
    # La lectura pura sigue dando el defecto (no tumba el arranque ni los GET).
    assert json_store.load_json(str(fichero), {"defecto": True}) == {"defecto": True}


def test_un_error_de_escritura_sube_y_se_cuenta(tmp_path, monkeypatch):
    def disco_lleno(fichero, texto):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(json_store, "_write_text_unlocked", disco_lleno)
    with pytest.raises(json_store.ErrorDeAlmacen):
        json_store.save_json(str(tmp_path / "a.json"), {"a": 1})
    with pytest.raises(json_store.ErrorDeAlmacen):
        json_store.update_json(str(tmp_path / "b.json"), {}, lambda t: {"b": 1})
    assert json_store.storage_health()["total"] == 2


def test_salud_da_503_con_una_escritura_fallida_reciente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    assert TestClient(main.app).get("/api/salud").status_code == 200

    json_store._registrar_fallo("write_error", str(tmp_path / "game_timers.json"), "EIO")
    respuesta = TestClient(main.app).get("/api/salud")
    assert respuesta.status_code == 503
    datos = respuesta.json()
    assert datos["estado"] == "mal"
    assert datos["almacen"]["motivo"] == "escritura_fallida" and datos["almacen"]["fichero"] == "game_timers.json"

    # Pasada la ventana, vuelve a 200.
    json_store._FALLOS["ultima_escritura_fallida"]["cuando"] -= 11 * 60
    assert TestClient(main.app).get("/api/salud").status_code == 200
