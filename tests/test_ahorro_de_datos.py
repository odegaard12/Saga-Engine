# -*- coding: utf-8 -*-
"""Ahorro de datos del 24/10: lo que baja cada móvil, medido y fijado.

Con quince jugadores lo que se satura es el ancho de banda (la Pi está al 0,18 %). Cada prueba fija un recorte:
el latido sin la foto de perfil en base64, las coordenadas a seis decimales, el 304 cuando el móvil ya tiene lo
mismo, la compresión desde 512 bytes y las cabeceras cortas en los JSON. Y que un móvil con la app vieja sigue
recibiendo lo que lee.
"""
import base64
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ahorro-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import etag_de_api  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

#: Una foto de perfil como las del panel: bytes al azar, que es lo que parece un JPEG a gzip.
FOTO = "data:image/jpeg;base64," + base64.b64encode(os.urandom(4500)).decode()


def _cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    perfiles = [
        {"id": "PLAYER 1", "display_name": "PLAYER 1", "avatar_url": FOTO},
        {"id": "PLAYER 2", "display_name": "PLAYER 2", "avatar_url": FOTO},
    ]
    con_rutas = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**con_rutas(), "player_profiles": perfiles})
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "exigir_ser_del_grupo", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    return TestClient(main.app)


# Coordenada inventada (Retiro, Madrid), escrita como suma para no tener forma de coordenada capturada.
LATIDO = {"user": "PLAYER 1", "lat": 40.4152 + 3.4567891e-5, "lon": -3.6842 - 3.4567891e-5, "accuracy": 6, "gps_status": "ok"}


def test_o_latido_non_leva_a_foto_propia(monkeypatch, tmp_path):
    """Eran ~5 KB de base64 en cada latido, cada 30 s: el 85 % de la respuesta."""
    cliente = _cliente(monkeypatch, tmp_path)

    resposta = cliente.post("/api/heartbeat", json=LATIDO)
    corpo = resposta.json()

    assert "data:" not in resposta.text
    assert corpo["live_status"]["avatar_ref"].startswith("/api/player-avatar/")
    assert len(resposta.content) < 1500, len(resposta.content)
    # Lo que lee el móvil (también el viejo) del latido sigue ahí.
    assert corpo["live_status"]["level"] == 0
    assert corpo["live_status"]["finished"] is False
    assert corpo["mission_revision"]
    assert "team" not in corpo


def test_o_latido_con_equipo_sen_fotos_nin_nodos(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)

    resposta = cliente.post("/api/heartbeat", json={**LATIDO, "equipo": True})
    corpo = resposta.json()

    assert "data:" not in resposta.text
    assert "stages" not in corpo and "stages" not in corpo["team"]
    assert corpo["team"]["profiles"]
    assert len(resposta.content) < 4000, len(resposta.content)


def test_as_coordenadas_saen_con_seis_decimais_e_gardanse_enteiras(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)

    corpo = cliente.post("/api/heartbeat", json={**LATIDO, "equipo": True}).json()
    propio = next(p for p in corpo["team"]["profiles"] if p["is_self"])

    assert propio["lat"] == 40.415235
    assert propio["lon"] == -3.684235
    assert corpo["live_status"]["lat"] == 40.415235
    # Lo guardado no cambia de formato: el antitrampas y el registro siguen con el dato entero.
    assert main.get_live_position("PLAYER 1")["lat"] == LATIDO["lat"]


def test_a_resposta_vai_comprimida_desde_512_bytes(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)

    resposta = cliente.post("/api/heartbeat", json=LATIDO, headers={"Accept-Encoding": "gzip"})

    assert 512 <= len(resposta.content) < 1024, "este latido es justo el que antes viajaba en crudo"
    assert resposta.headers.get("content-encoding") == "gzip"


def test_mesmo_contido_da_304_sen_corpo(monkeypatch, tmp_path):
    """La lista de fotos se pide cada minuto con el `fetch` por defecto: el navegador manda If-None-Match solo."""
    cliente = _cliente(monkeypatch, tmp_path)

    primeira = cliente.get("/api/field-proofs?user=PLAYER%201")
    etag = primeira.headers["etag"]
    assert primeira.status_code == 200
    assert "no-cache" in primeira.headers["cache-control"]

    segunda = cliente.get("/api/field-proofs?user=PLAYER%201", headers={"If-None-Match": etag})
    assert segunda.status_code == 304
    assert segunda.content == b""
    assert segunda.headers["etag"] == etag

    # Cloudflare la pasa a débil si recomprime: también vale.
    debil = cliente.get("/api/field-proofs?user=PLAYER%201", headers={"If-None-Match": "W/" + etag})
    assert debil.status_code == 304


def test_o_cliente_vello_sen_if_none_match_recibe_todo(monkeypatch, tmp_path):
    """La app vieja pide la partida con `no-store`: nunca manda If-None-Match y tiene que seguir igual."""
    cliente = _cliente(monkeypatch, tmp_path)

    resposta = cliente.get("/api/game/PLAYER%201?_=1")

    assert resposta.status_code == 200
    assert resposta.json()["stages"]
    assert resposta.headers["etag"]
    # Con una huella vieja tampoco hay 304: sólo si el cuerpo es exactamente el mismo.
    otra = cliente.get("/api/game/PLAYER%201?_=2", headers={"If-None-Match": '"vieja"'})
    assert otra.status_code == 200 and otra.json()["stages"]


def test_o_etag_non_toca_o_que_non_e_json_200():
    assert etag_de_api.coincide('"a", W/"b"', '"b"')
    assert not etag_de_api.coincide("", '"b"')
    assert etag_de_api.huella(b"{}") == etag_de_api.huella(b"{}")
    assert etag_de_api.huella(b"{}") != etag_de_api.huella(b"[]")


def test_os_json_levan_cabeceiras_curtas_e_os_documentos_as_completas(monkeypatch, tmp_path):
    """La CSP de la app eran ~1 KB en cada respuesta de la API; en un JSON no sirve de nada."""
    cliente = _cliente(monkeypatch, tmp_path)

    api = cliente.post("/api/heartbeat", json=LATIDO).headers
    assert api["x-content-type-options"] == "nosniff"
    assert api["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert "permissions-policy" not in api
    assert sum(len(k) + len(v) for k, v in api.items()) < 400

    documento = cliente.get("/robots.txt").headers
    assert "script-src" in documento["content-security-policy"]
    assert "microphone=(self)" in documento["permissions-policy"]
    assert documento["x-frame-options"] == "DENY"
