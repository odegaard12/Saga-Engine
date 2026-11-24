# -*- coding: utf-8 -*-
"""Pruebas de ataque del 23-24/11 (auditoría de seguridad): lo que se confirmó contra una copia local.

Iban como `xfail(strict=True)` mientras el fallo existía; arreglados el 24/11, ahora guardan cada arreglo. Sólo datos
inventados y ficheros temporales.
"""
import io
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ataque-"))

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main  # noqa: E402
from backend.app.routers import admin as admin_router
from backend.app.routers import field_proofs
from backend.app.security import admin_auth
from tests.ruta_de_proba import preparar_mision


@pytest.mark.parametrize("clave", ["password123", "1234567890", "aaaaaaaaaa", "qwertyuiop", "adminadmin"])
def test_una_clave_de_panel_de_diccionario_se_rechaza(clave):
    assert admin_auth.is_weak_admin_password(clave)


def test_quitar_metadatos_quita_tambien_el_comentario_del_jpeg():
    origen = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(origen, "JPEG", comment=b"MARCA lat=41.5 lon=-7.5")
    limpia = field_proofs.quitar_metadatos(origen.getvalue(), "image/jpeg")
    assert b"MARCA" not in limpia


@pytest.mark.parametrize("consulta", ["t=", "t=basura", "t=/map-tiles/15/16593/11271.png"])
def test_un_lote_sin_teselas_servidas_no_se_marca_completo(monkeypatch, tmp_path, consulta):
    preparar_mision(monkeypatch, tmp_path)
    respuesta = TestClient(main.app).get("/api/teselas/lote/version-cualquiera?" + consulta)
    assert respuesta.status_code == 200
    assert respuesta.headers.get("x-saga-lote") != "completo"
    assert "max-age" not in (respuesta.headers.get("cdn-cache-control") or "")


@pytest.mark.parametrize(
    "foto",
    ["javascript:alert(1)", "https://externo.example/rastreo.png", "data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4="],
)
def test_la_foto_de_un_jugador_solo_puede_ser_una_imagen_incrustada(foto):
    perfiles = admin_router._normalize_incoming_profiles([{"id": "Lobo Gris", "avatar_url": foto}])
    assert perfiles[0]["avatar_url"] == ""


def test_el_tope_de_pixeles_de_una_foto_de_campo_es_el_de_un_movil():
    # Una foto de móvil normal son 12 Mpx; la ligera que sube la app, 1280 px de lado.
    assert field_proofs.MAX_PIXELES_DE_FOTO <= 16_000_000


# ---------------------------------------------------------------------------
# 24/11: lo que se arregló junto a lo de arriba
# ---------------------------------------------------------------------------

def test_la_clave_no_puede_ser_el_nombre_de_la_mision():
    assert admin_auth.is_weak_admin_password("Faro de Catoira", ("admin", "Faro de Catoira"))
    assert not admin_auth.is_weak_admin_password("lobo-gris-faro-42", ("admin", "Faro de Catoira"))


def test_lleva_metadatos_ve_el_comentario_y_un_segmento_app_raro():
    from backend.app.security import imagenes

    limpia = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(limpia, "JPEG")
    assert not imagenes.lleva_metadatos(limpia.getvalue()), "el JPEG pelado (como el del canvas) no se recodifica"
    con_comentario = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(con_comentario, "JPEG", comment=b"MARCA")
    assert imagenes.lleva_metadatos(con_comentario.getvalue())
    datos = limpia.getvalue()
    app15 = b"\xff\xef" + (2 + 9).to_bytes(2, "big") + b"MARCA lat"
    assert imagenes.lleva_metadatos(datos[:2] + app15 + datos[2:])


def test_quitar_metadatos_corta_por_pixeles_antes_de_decodificar():
    salida = io.BytesIO()
    Image.new("1", (5000, 4000)).save(salida, "PNG")  # 20 Mpx en pocos KB
    with pytest.raises(field_proofs.HTTPException) as error:
        field_proofs.quitar_metadatos(salida.getvalue(), "image/png")
    assert error.value.status_code == 400


def test_sin_turno_para_decodificar_la_foto_espera_y_da_503(monkeypatch):
    import threading

    monkeypatch.setattr(field_proofs, "TURNOS_DE_DECODIFICAR", threading.BoundedSemaphore(1))
    monkeypatch.setattr(field_proofs, "ESPERA_DE_TURNO_S", 0.05)
    origen = io.BytesIO()
    Image.new("RGB", (16, 16)).save(origen, "JPEG")
    field_proofs.TURNOS_DE_DECODIFICAR.acquire()
    try:
        with pytest.raises(field_proofs.HTTPException) as error:
            field_proofs.quitar_metadatos(origen.getvalue(), "image/jpeg")
        assert error.value.status_code == 503
    finally:
        field_proofs.TURNOS_DE_DECODIFICAR.release()
    assert field_proofs.quitar_metadatos(origen.getvalue(), "image/jpeg")[:3] == b"\xff\xd8\xff"


def test_una_foto_mala_ya_guardada_no_sale_de_la_ficha():
    from backend.app.runtime import player_profiles

    for foto in ("javascript:alert(1)", "https://externo.example/x.png", "data:image/svg+xml;base64,PHN2Zz4="):
        assert player_profiles.normalize_player_profile({"id": "Lobo Gris", "avatar_url": foto})["avatar_url"] == ""
    buena = "data:image/jpeg;base64,/9j/4AAQ"
    assert player_profiles.normalize_player_profile({"id": "Lobo Gris", "avatar_url": buena})["avatar_url"] == buena


def test_x_forwarded_host_solo_vale_de_un_proxy_de_confianza():
    from types import SimpleNamespace

    from backend.app.security import peticiones

    def peticion(ip):
        cabeceras = {"origin": "https://ajeno.example", "host": "saga.example", "x-forwarded-host": "ajeno.example"}
        return SimpleNamespace(method="POST", headers=cabeceras, client=SimpleNamespace(host=ip))

    assert peticiones.origen_rechazado(peticion("203.0.113.9")) == "cross_origin"
    assert peticiones.origen_rechazado(peticion("127.0.0.1")) is None, "cloudflared en la misma máquina sí la pone"


def test_un_lote_con_una_tesela_que_no_lo_es_no_se_marca_completo(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    respuesta = TestClient(main.app).get("/api/teselas/lote/version-cualquiera?t=basura,../../etc/passwd")
    assert respuesta.headers.get("x-saga-lote") == "incompleto"


def test_h3_con_proximidad_el_ok_pelado_no_vale_y_el_rescate_si_pero_marcado(monkeypatch):
    """H3 revisado el 24/11 tarde (decisión del dueño): con «exigir proximidad», `{code: OK}` sin posición ni marca de
    rescate se rechaza; el rescate de Herramientas (GPS rendido) pasa y queda la sospecha para el organizador."""
    import time

    from fastapi import FastAPI

    from backend.app.routers import game as game_router
    from backend.app.runtime import proximidad
    from backend.app.storage.json_store import save_json
    from backend.app.storage.runtime_store import save_stages

    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    original = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**original(), "require_server_proximity": True})
    save_stages(main.STAGES_DB, [
        {"id": "a0", "title": "N0", "lat": 40.4, "lon": -3.7, "radius": 40, "type": "signal_hunt",
         "config": {"game_id": "spark_radar"}},
        {"id": "a1", "title": "N1", "lat": 40.4, "lon": -3.69, "radius": 40, "type": "signal_hunt",
         "config": {"game_id": "spark_radar"}},
    ])
    save_json(main.ANTI_CHEAT_DB, {})
    app = FastAPI()
    app.include_router(game_router.router)
    cliente = TestClient(app)

    def avanzar(usuario, **marca):
        main.set_player_progress_level(usuario, 0)
        main.clear_live_position(usuario)
        evidencia = {"v": 1, "via": "juego", "abierto_ms": int(time.time() * 1000) - 90_000, **marca}
        cuerpo = {"user": usuario, "code": "OK", "level_before": 0, "time_spent_ms": 60000, "evidence": evidencia}
        return cliente.post("/api/advance", json=cuerpo).json()

    ataque = avanzar("Sofa H3")
    assert ataque["status"] == "fail" and ataque["reason"] == "invalid_completion_code:not_opened"
    rescate = avanzar("Rescate H3", rescate_gps="gps_rendido")
    assert rescate["status"] == "ok" and rescate["level"] == 1
    notas = main.list_anti_cheat_suspicions("Rescate H3").get("Rescate H3") or []
    assert any(n["reason"] == proximidad.RAZON_RESCATE_SIN_GPS for n in notas)
