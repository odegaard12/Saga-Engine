# -*- coding: utf-8 -*-
"""Desampliar el mapa parpadeaba porque CADA tesela era un viaje Esri en vivo,
para cada jugador, cada vez -no era CSS ni la animación, era la red Pi→Esri-.

Con la caché en disco, la primera petición de una tesela paga ese viaje; las
siguientes se sirven del disco de la Pi, sin tocar la red.
"""
from pathlib import Path

from fastapi.testclient import TestClient

import main
from backend.app.routers import public


class _RespuestaFalsa:
    status_code = 200
    headers = {"Content-Type": "image/jpeg"}
    content = b"contenido-de-prueba"


class _ClienteFalso:
    llamadas = 0

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        _ClienteFalso.llamadas += 1
        return _RespuestaFalsa()


def _client(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main._httpx, "AsyncClient", _ClienteFalso)
    _ClienteFalso.llamadas = 0
    return TestClient(main.app)


def test_la_primera_vez_pide_a_esri_y_guarda_en_disco(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    resp = client.get("/map-tiles/16/1000/2000.png")

    assert resp.status_code == 200
    assert resp.content == b"contenido-de-prueba"
    assert _ClienteFalso.llamadas == 1

    ruta_binario, ruta_tipo = public._tile_cache_paths(16, 1000, 2000)
    assert ruta_binario.exists()
    assert ruta_tipo.read_text(encoding="utf-8").strip() == "image/jpeg"


def test_la_segunda_vez_no_toca_la_red(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    client.get("/map-tiles/16/1000/2000.png")
    assert _ClienteFalso.llamadas == 1

    resp = client.get("/map-tiles/16/1000/2000.png")

    assert resp.status_code == 200
    assert resp.content == b"contenido-de-prueba"
    # La clave del arreglo: la segunda vez no vuelve a llamar a Esri.
    assert _ClienteFalso.llamadas == 1


def test_otro_jugador_tambien_aprovecha_la_cache(monkeypatch, tmp_path):
    """La caché es del servidor, no del navegador: sirve a cualquiera."""
    client = _client(monkeypatch, tmp_path)

    ruta_binario, ruta_tipo = public._tile_cache_paths(16, 1000, 2000)
    ruta_binario.parent.mkdir(parents=True, exist_ok=True)
    ruta_binario.write_bytes(b"ya-la-pidio-otro")
    ruta_tipo.write_text("image/png", encoding="utf-8")

    resp = client.get("/map-tiles/16/1000/2000.png")

    assert resp.status_code == 200
    assert resp.content == b"ya-la-pidio-otro"
    assert resp.headers["content-type"] == "image/png"
    assert _ClienteFalso.llamadas == 0
