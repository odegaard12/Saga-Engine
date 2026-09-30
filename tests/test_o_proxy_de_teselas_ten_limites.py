# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S4: el proxy de teselas era público y sin tope.

Cualquiera podía pedir teselas de medio planeta (o un POST al lote: 200 viajes a
Esri y 200 escrituras) y llenar el disco de la Raspberry; con el disco lleno el
progreso y las sospechas se perdían sin avisar. Y la escritura no era atómica:
una tesela a medias se servía para siempre.
"""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-teselas-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import public  # noqa: E402
from backend.app.runtime import teselas  # noqa: E402

LAT, LON = 40.0, -3.0
CAJA = (39.9, 40.1, -3.1, -2.9)


class _RespuestaFalsa:
    status_code = 200

    def __init__(self, contenido=b"contenido-de-prueba", tipo="image/jpeg"):
        self.content = contenido
        self.headers = {"Content-Type": tipo}


class _ClienteFalso:
    llamadas = []
    respuesta = _RespuestaFalsa

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, *args, **kwargs):
        _ClienteFalso.llamadas.append(url)
        return _ClienteFalso.respuesta()


def _cliente(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_HTTPX_AVAILABLE", True)
    monkeypatch.setattr(main._httpx, "AsyncClient", _ClienteFalso)
    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: CAJA)
    monkeypatch.setattr(main, "verify_admin_session_token", lambda token: False)
    _ClienteFalso.llamadas = []
    _ClienteFalso.respuesta = _RespuestaFalsa
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# La zona
# ---------------------------------------------------------------------------

def test_solo_se_sirve_la_zona_de_la_mision_y_su_margen():
    x, y = teselas.tesela_de(LAT, LON, 16)

    assert teselas.tesela_permitida(16, x, y, CAJA)
    # A 300 km de la caja, a zoom alto: fuera.
    lejos_x, lejos_y = teselas.tesela_de(43.0, 0.0, 16)
    assert not teselas.tesela_permitida(16, lejos_x, lejos_y, CAJA)
    # A zoom de región (z8, 400 km de margen) esa misma zona sí entra.
    x8, y8 = teselas.tesela_de(43.0, 0.0, 8)
    assert teselas.tesela_permitida(8, x8, y8, CAJA)
    # Y el mundo entero a zoom 0-2 (21 teselas) siempre.
    assert teselas.tesela_permitida(2, 3, 3, CAJA)


def test_una_tesela_que_no_existe_no_se_sirve():
    assert not teselas.tesela_permitida(5, 99, 0, CAJA)  # x fuera de 0..31
    assert not teselas.tesela_permitida(5, 0, -1, CAJA)
    assert not teselas.tesela_permitida(-1, 0, 0, CAJA)


def test_la_caja_sale_de_los_nodos_el_trazado_y_el_centro_del_mapa():
    nodos = [
        {"lat": 42.0, "lon": -8.0, "route_track": [[42.5, -8.5], {"lat": 41.5, "lon": -7.5}]},
        {"location": {"lat": 43.0, "lon": -9.0}},
        {"lat": "basura", "lon": None},
    ]
    caja = teselas.caja_de_los_puntos(nodos, {"map_center": [42.2, -8.2]})

    assert caja == (41.5, 43.0, -9.0, -7.5)
    assert teselas.caja_de_los_puntos([], {}) is None


def test_una_tesela_fuera_de_la_zona_da_404_y_no_llama_a_esri(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    x, y = teselas.tesela_de(43.0, 0.0, 16)

    resposta = cliente.get("/map-tiles/16/%d/%d.png" % (x, y))
    relevo = cliente.get("/dem-tiles/14/%d/%d.png" % teselas.tesela_de(43.0, 0.0, 14))

    assert resposta.status_code == 404 and relevo.status_code == 404
    assert _ClienteFalso.llamadas == []
    assert not (tmp_path / "tile_cache").exists()


def test_el_panel_si_puede_mirar_fuera_de_la_zona(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "verify_admin_session_token", lambda token: True)
    x, y = teselas.tesela_de(43.0, 0.0, 16)

    assert cliente.get("/map-tiles/16/%d/%d.png" % (x, y)).status_code == 200


def test_el_lote_deja_vacias_las_teselas_de_fuera_y_no_las_pide(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    dentro = teselas.tesela_de(LAT, LON, 16)
    fuera = teselas.tesela_de(43.0, 0.0, 16)

    resposta = cliente.post(
        "/api/teselas/lote",
        json={"teselas": ["/map-tiles/16/%d/%d.png" % dentro, "/map-tiles/16/%d/%d.png" % fuera]},
    )

    assert resposta.status_code == 200
    assert len(_ClienteFalso.llamadas) == 1, "sólo la de dentro se pide a Esri"


# ---------------------------------------------------------------------------
# El tope de disco
# ---------------------------------------------------------------------------

def test_la_cache_se_poda_por_uso_cuando_pasa_del_limite(tmp_path):
    raiz = tmp_path / "tile_cache"
    limite = 3 * 1024 * 1024
    contenido = b"x" * (1024 * 1024)

    for indice in range(6):
        binario = raiz / "16" / str(indice) / "1.bin"
        tipo = raiz / "16" / str(indice) / "1.ct"
        assert teselas.guardar_en_cache(binario, tipo, contenido, "image/jpeg", limite)
        os.utime(binario, (1_000_000 + indice, 1_000_000 + indice))  # la 0 es la más vieja

    def _total():
        return sum(p.stat().st_size for p in raiz.rglob("*") if p.is_file())

    # La poda va por lotes (cada ~4 MiB escritos), no en cada tesela: puede haber
    # una holgura pequeña por encima del límite, pero nunca crecer sin techo.
    assert _total() <= limite + 4 * 1024 * 1024
    # Se fueron las más viejas, no las últimas.
    assert not (raiz / "16" / "0" / "1.bin").exists()
    assert (raiz / "16" / "5" / "1.bin").exists()

    teselas.podar_cache(raiz, limite)
    assert _total() <= limite
    assert (raiz / "16" / "5" / "1.bin").exists(), "la más reciente se conserva"


def test_podar_no_toca_una_cache_por_debajo_del_limite(tmp_path):
    raiz = tmp_path / "dem_cache"
    binario = raiz / "12" / "1" / "1.bin"
    assert teselas.guardar_en_cache(binario, raiz / "12" / "1" / "1.ct", b"abc", "image/png", 10_000_000)

    assert teselas.podar_cache(raiz, 10_000_000) == 0
    assert binario.exists()


# ---------------------------------------------------------------------------
# La escritura atómica
# ---------------------------------------------------------------------------

def test_una_escritura_interrumpida_no_deja_una_tesela_a_medias(monkeypatch, tmp_path):
    binario = tmp_path / "tile_cache" / "16" / "1" / "1.bin"
    tipo = tmp_path / "tile_cache" / "16" / "1" / "1.ct"
    real = os.replace

    def falla_con_los_bytes(origen, destino):
        if str(destino).endswith(".bin"):
            raise OSError("disco lleno")
        return real(origen, destino)

    monkeypatch.setattr(os, "replace", falla_con_los_bytes)

    assert teselas.guardar_en_cache(binario, tipo, b"contenido", "image/jpeg", 10_000_000) is False

    monkeypatch.setattr(os, "replace", real)
    assert not binario.exists(), "sin los bytes completos la tesela no existe"
    assert teselas.leer_de_cache(binario, tipo, "image/jpeg") is None
    assert list((tmp_path / "tile_cache").rglob("*.tmp")) == []


def test_una_tesela_vacia_de_una_escritura_vieja_se_vuelve_a_pedir(tmp_path):
    binario = tmp_path / "16" / "1" / "1.bin"
    binario.parent.mkdir(parents=True)
    binario.write_bytes(b"")

    assert teselas.leer_de_cache(binario, binario.with_suffix(".ct"), "image/jpeg") is None


def test_lo_que_no_es_una_imagen_no_se_guarda_en_la_cache(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _ClienteFalso.respuesta = lambda: _RespuestaFalsa(b"<html>error</html>", "text/html")
    x, y = teselas.tesela_de(LAT, LON, 16)

    resposta = cliente.get("/map-tiles/16/%d/%d.png" % (x, y))

    assert resposta.status_code == 200  # se sirve igual, pero...
    ruta_binario, _ = public._tile_cache_paths(16, x, y)
    assert not Path(ruta_binario).exists(), "...no queda en disco para servirse durante un día"
