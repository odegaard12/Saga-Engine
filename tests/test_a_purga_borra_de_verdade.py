# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S3/A9: la purga «BORRAR» dejaba cosas.

Quedaban las miniaturas de `proofs/thumbs/`, los originales en subcarpetas
(`proofs/AAAA/MM/`), los eventos con muestras de GPS y evidencia, las coordenadas
de `anti_cheat.json` y los retratos de las fichas, y los bytes borrados seguían
dentro del fichero SQLite. El informe decía `ficheros_de_imagen: 0` con las fotos
delante y el panel ponía «Borrado». Aquí se comprueba, contra el disco y las
tablas, que se va todo y que el informe cuenta lo que se fue de verdad.
"""
import os
import tempfile
import time
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-purga-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import field_proofs as fotos  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
MARCA = "marca-de-prueba-que-debe-desaparecer-del-fichero"


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    return TestClient(main.app)


def _insertar_foto(proof_id, nombre_fichero, con_miniatura=True, contenido=b"\xff\xd8\xff\xdb no es una foto"):
    fotos.init_field_proof_schema()
    conn = fotos.connect_runtime_sqlite()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO field_proofs
            (id, user, display_name, stage_id, stage_title, lat, lon, note,
             image_filename, media_type, created_at, visibility, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (proof_id, USUARIO, USUARIO, "6", "el monte", 42.35, -8.66, "", nombre_fichero,
             "image/jpeg", 1770000000, "team", "active"),
        )
        conn.commit()
    finally:
        conn.close()

    base = fotos.resolve_field_proofs_dir()
    destino = base / nombre_fichero
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(contenido)
    if con_miniatura:
        miniatura = fotos.miniatura_de(base, nombre_fichero)
        miniatura.parent.mkdir(parents=True, exist_ok=True)
        miniatura.write_bytes(b"\xff\xd8 miniatura")


def _todo_lo_personal():
    """Deja en el servidor de pruebas TODO lo que la purga tiene que llevarse."""
    # Fotos: una en subcarpeta con miniatura, otra suelta en la raíz, y un
    # original huérfano (sin fila que lo nombre) también en subcarpeta.
    _insertar_foto("proof_a", "2026/09/proof_a.jpg")
    _insertar_foto("proof_b", "proof_b.jpg", con_miniatura=False)
    huerfano = fotos.resolve_field_proofs_dir() / "2026" / "08" / "huerfana.jpg"
    huerfano.parent.mkdir(parents=True, exist_ok=True)
    huerfano.write_bytes(b"\xff\xd8 huerfana")

    # Eventos: un rastro de posiciones y un avance con evidencia y coordenadas.
    main.append_event(
        main.EVENT_LOG_DB,
        {"type": "position_track", "user": USUARIO, "status": "synced", "source": "offline_queue",
         "payload": {"client_event_id": "rastro-1", "samples": [{"t": 1, "lat": 40.5, "lon": -3.5, "nota": MARCA}]}},
    )
    main.append_event(
        main.EVENT_LOG_DB,
        {"type": "node_completed", "user": USUARIO, "status": "synced", "source": "offline_queue",
         "payload": {"client_event_id": "avance-1", "code": "OK", "time_spent_ms": 9000,
                     "evidence": {"v": 1, "samples": [{"lat": 40.5, "lon": -3.5}]}, "lat": 40.5, "lon": -3.5}},
    )

    # Sospechas con el sitio de dónde a dónde iba alguien.
    main._anti_cheat.record_suspicion(
        main.ANTI_CHEAT_DB, USUARIO, "impossible_travel_speed",
        {"speed_kmh": 90.0, "distance_m": 800.0, "from": {"lat": 40.5, "lon": -3.5}, "to": {"lat": 40.6, "lon": -3.6}},
    )

    # Un retrato incrustado en la ficha del jugador.
    main.save_config({
        "site_name": "Prueba",
        "player_profiles": [
            {"id": USUARIO, "display_name": USUARIO, "mode": "solo", "avatar_url": "data:image/png;base64,AAAA"},
            {"id": "PLAYER 2", "display_name": "PLAYER 2", "mode": "solo", "avatar_url": "https://ejemplo.invalid/a.png"},
        ],
    })

    # Posición en vivo y Registro de partida.
    main.upsert_live_position_for_user(USUARIO, {"lat": 40.5, "lon": -3.5, "last_seen": int(time.time())})
    main.match_log_record("session_open", USUARIO, active=True)


def _filas_de_eventos(tipo):
    from backend.app.storage.event_store import list_events

    return list_events(main.EVENT_LOG_DB, event_type=tipo)


def _ficheros_bajo(carpeta: Path):
    return [p for p in carpeta.rglob("*") if p.is_file()]


def test_contar_ve_las_miniaturas_y_los_ficheros_en_subcarpetas(cliente):
    _todo_lo_personal()

    datos = cliente.post("/api/admin/datos-personales", json={}).json()["datos"]

    assert datos["fotos"] == 2
    # 2 originales + 1 huérfano + 1 miniatura: todos los niveles, no sólo el primero.
    assert datos["ficheros_de_imagen"] == 4
    assert datos["miniaturas"] == 1
    assert datos["avatares"] == 1
    assert datos["eventos_con_posiciones"] == 1
    assert datos["eventos_con_coordenadas"] == 1
    assert datos["sospechas_con_coordenadas"] == 1
    assert datos["posiciones_gps"] >= 1 and datos["registro_de_partida"] >= 1


def test_borrar_se_lleva_todo_y_cuenta_lo_que_de_verdad_se_borro(cliente):
    _todo_lo_personal()
    base = fotos.resolve_field_proofs_dir()
    assert _ficheros_bajo(base)

    respuesta = cliente.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"}).json()

    assert respuesta["status"] == "ok" and respuesta["accion"] == "borrar"
    borrado = respuesta["borrado"]
    assert borrado["fotos"] == 2
    assert borrado["imagenes"] == 3, "2 originales y el huérfano de la subcarpeta"
    assert borrado["miniaturas"] == 1
    assert borrado["avatares"] == 1
    assert borrado["eventos_borrados"] == 1
    assert borrado["eventos_limpiados"] == 1
    assert borrado["sospechas_limpiadas"] == 1
    assert borrado["posiciones_gps"] >= 1 and borrado["registro_de_partida"] >= 1
    assert borrado["sqlite_compactado"] is True

    # Y el disco lo confirma, no sólo el informe.
    assert _ficheros_bajo(base) == []
    assert respuesta["queda"]["fotos"] == 0
    assert respuesta["queda"]["ficheros_de_imagen"] == 0
    assert respuesta["queda"]["miniaturas"] == 0
    assert respuesta["queda"]["avatares"] == 0
    assert respuesta["queda"]["eventos_con_posiciones"] == 0
    assert respuesta["queda"]["eventos_con_coordenadas"] == 0
    assert respuesta["queda"]["sospechas_con_coordenadas"] == 0


def test_los_eventos_conservan_el_historial_pero_sin_coordenadas(cliente):
    _todo_lo_personal()

    cliente.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"})

    assert _filas_de_eventos("position_track") == []
    avances = _filas_de_eventos("node_completed")
    assert len(avances) == 1
    payload = avances[0]["payload"]
    for clave in ("samples", "evidence", "lat", "lon", "accuracy"):
        assert clave not in payload
    # La idempotencia y el resultado del juego siguen ahí.
    assert payload["client_event_id"] == "avance-1"
    assert payload["time_spent_ms"] == 9000


def test_las_sospechas_pierden_las_coordenadas_pero_no_el_motivo(cliente):
    _todo_lo_personal()

    cliente.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"})

    sospechas = main.list_anti_cheat_suspicions()[USUARIO]
    assert len(sospechas) == 1
    evidencia = sospechas[0]["evidence"]
    assert "from" not in evidencia and "to" not in evidencia
    assert sospechas[0]["reason"] == "impossible_travel_speed"
    assert evidencia["speed_kmh"] == 90.0


def test_el_retrato_de_la_ficha_se_va_pero_la_ficha_se_queda(cliente):
    _todo_lo_personal()

    cliente.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"})

    perfiles = {p["id"]: p for p in main.load_config()["player_profiles"]}
    assert perfiles[USUARIO]["avatar_url"] == ""
    assert perfiles[USUARIO]["display_name"] == USUARIO
    # Una URL externa no es una foto guardada aquí: no se toca.
    assert perfiles["PLAYER 2"]["avatar_url"] == "https://ejemplo.invalid/a.png"


def test_los_bytes_borrados_no_se_quedan_dentro_del_fichero_sqlite(cliente, tmp_path):
    _todo_lo_personal()
    ficheros = [tmp_path / "saga.sqlite3", tmp_path / "saga.sqlite3-wal"]
    antes = b"".join(f.read_bytes() for f in ficheros if f.exists())
    assert MARCA.encode() in antes, "la prueba no está probando nada si la marca no llegó a escribirse"

    cliente.post("/api/admin/datos-personales", json={"confirmacion": "BORRAR"})

    despues = b"".join(f.read_bytes() for f in ficheros if f.exists())
    assert MARCA.encode() not in despues


def test_borrar_solo_las_fotos_no_toca_las_posiciones(cliente):
    _todo_lo_personal()

    respuesta = cliente.post(
        "/api/admin/datos-personales",
        json={"confirmacion": "BORRAR", "fotos": True, "posiciones": False},
    ).json()

    assert respuesta["borrado"]["fotos"] == 2
    assert respuesta["borrado"]["posiciones_gps"] == 0
    assert respuesta["borrado"]["eventos_borrados"] == 0
    assert len(_filas_de_eventos("position_track")) == 1
    assert main.load_live_positions()


def test_borrar_una_foto_borra_tambien_su_miniatura(cliente):
    _insertar_foto("proof_c", "2026/09/proof_c.jpg")
    base = fotos.resolve_field_proofs_dir()
    miniatura = fotos.miniatura_de(base, "2026/09/proof_c.jpg")
    assert miniatura.exists()

    assert cliente.get("/api/game/PLAYER%201").status_code == 200  # el pase de jugador
    resposta = cliente.delete("/api/field-proofs/proof_c", params={"user": USUARIO})

    assert resposta.status_code == 200
    assert not (base / "2026" / "09" / "proof_c.jpg").exists()
    assert not miniatura.exists(), "la miniatura de la foto borrada seguía en proofs/thumbs/"
