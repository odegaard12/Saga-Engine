# -*- coding: utf-8 -*-
"""23/11 (auditoría de seguridad, M1, B1 y B2): las teselas del mapa, detrás de la clave de misión.

Sin la clave, /map-tiles, /dem-tiles y el lote por GET contestaban imagen de verdad dentro de la zona de la misión y un
PNG vacío fuera: pidiendo teselas se sacaba la caja de la ruta. Ahora, con clave puesta, quien no la trae recibe lo
MISMO en todas partes (la tesela vacía en las rutas de imagen, 401 en el lote) y el panel precalienta con su sesión,
con el filtro de zona de un móvil. Además: sin `Access-Control-Allow-Origin: *` y con un tope por IP.
"""
import os
import struct
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-teselas-clave-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import public  # noqa: E402
from backend.app.runtime import teselas  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
CAJA = (39.9, 40.1, -3.1, -2.9)
CLAVE = "clave-de-mision-123"
DENTRO = teselas.tesela_de(40.0, -3.0, 16)
FUERA = teselas.tesela_de(43.0, 0.0, 16)
DENTRO_DEM = teselas.tesela_de(40.0, -3.0, 13)
FUERA_DEM = teselas.tesela_de(43.0, 0.0, 13)
IMAGEN = b"\x89PNG\r\n\x1a\n" + b"contenido-de-prueba"


class _RespuestaFalsa:
    status_code = 200
    content = IMAGEN
    headers = {"Content-Type": "image/png"}


class _ClienteFalso:
    llamadas = []

    def __init__(self, *args, **kwargs):
        pass

    async def get(self, url, *args, **kwargs):
        _ClienteFalso.llamadas.append(url)
        return _RespuestaFalsa()


@pytest.fixture()
def sitio(monkeypatch, tmp_path):
    """Un servidor con clave de misión puesta, la zona en CAJA y un origen de teselas de mentira."""
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_HTTPX_AVAILABLE", True)
    monkeypatch.setattr(main._httpx, "AsyncClient", _ClienteFalso)
    monkeypatch.setattr(public, "_cliente_teselas", {"bucle": None, "cliente": None})
    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: CAJA)
    monkeypatch.setattr(main, "verify_admin_session_token", lambda token: token == "sesion-del-panel")
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    monkeypatch.setattr(public, "_RITMO_TESELAS", {})
    _ClienteFalso.llamadas = []
    main.set_mission_password(CLAVE)
    try:
        yield TestClient(main.app)
    finally:
        main.set_mission_password("")


def _foto(z_x_y, zoom=16):
    return "/map-tiles/%d/%d/%d.png" % (zoom, z_x_y[0], z_x_y[1])


def _relieve(z_x_y, zoom=13):
    return "/dem-tiles/%d/%d/%d.png" % (zoom, z_x_y[0], z_x_y[1])


def _lo_que_se_ve(respuesta):
    cabeceras = {k: v for k, v in respuesta.headers.items() if k.lower() not in ("date",)}
    return respuesta.status_code, respuesta.content, cabeceras


def _con_la_clave(cliente):
    assert cliente.post("/api/mission/unlock", json={"password": CLAVE}).status_code == 200
    return cliente


# ---------------------------------------------------------------------------
# M1: sin la clave, lo mismo dentro que fuera de la zona
# ---------------------------------------------------------------------------

def test_sin_la_clave_la_foto_es_la_misma_tesela_vacia_dentro_y_fuera_de_la_zona(sitio):
    dentro, fuera = sitio.get(_foto(DENTRO)), sitio.get(_foto(FUERA))

    assert dentro.status_code == 200
    assert _lo_que_se_ve(dentro) == _lo_que_se_ve(fuera), "la respuesta no puede decir dónde está la ruta"
    assert dentro.content == public._tesela_en_blanco(relieve=False)
    assert dentro.headers["cache-control"] == "no-store", "si se guardase, seguiría vacía después de teclear la clave"
    assert dentro.headers["x-saga-tesela"] == "fuera-de-zona", "ni el móvil ni el service worker la guardan"
    assert "set-cookie" not in dentro.headers
    assert _ClienteFalso.llamadas == [], "sin la clave no se toca el origen ni la caché de disco"


def test_sin_la_clave_el_relieve_y_la_ruta_esri_tampoco_distinguen_la_zona(sitio):
    assert _lo_que_se_ve(sitio.get(_relieve(DENTRO_DEM))) == _lo_que_se_ve(sitio.get(_relieve(FUERA_DEM)))
    assert sitio.get(_relieve(DENTRO_DEM)).content == public._tesela_en_blanco(relieve=True)
    assert sitio.get(_relieve(DENTRO_DEM) + "?f=webp").content == public._tesela_en_blanco(relieve=True)
    dentro = sitio.get("/map-tiles/esri/16/%d/%d.png" % DENTRO)
    fuera = sitio.get("/map-tiles/esri/16/%d/%d.png" % FUERA)
    assert _lo_que_se_ve(dentro) == _lo_que_se_ve(fuera)
    # Tampoco por el zoom: un zoom que con clave sería un 400/404 sale igual que cualquier otra.
    assert sitio.get("/map-tiles/25/1/1.png").content == public._tesela_en_blanco(relieve=False)
    assert sitio.get("/dem-tiles/17/1/1.png").status_code == 200
    assert _ClienteFalso.llamadas == []


def test_sin_la_clave_el_lote_es_un_401_pida_lo_que_pida(sitio):
    for rutas in (_foto(DENTRO), _foto(FUERA), _foto(DENTRO) + "," + _relieve(FUERA_DEM)):
        r = sitio.get("/api/teselas/lote/p1abc", params={"t": rutas})
        assert r.status_code == 401 and "set-cookie" not in r.headers
        assert sitio.post("/api/teselas/lote", json={"teselas": rutas.split(",")}).status_code == 401
    assert _ClienteFalso.llamadas == []


def test_una_cookie_de_mision_inventada_no_abre_las_teselas(sitio):
    sitio.cookies.set(main.MISSION_COOKIE, "1700000000.deadbeef")
    assert sitio.get(_foto(DENTRO)).content == public._tesela_en_blanco(relieve=False)
    assert sitio.get("/api/teselas/lote/p1abc", params={"t": _foto(DENTRO)}).status_code == 401


# ---------------------------------------------------------------------------
# Con la clave todo sigue como antes
# ---------------------------------------------------------------------------

def test_con_la_clave_dentro_sale_la_tesela_de_verdad_y_fuera_la_vacia(sitio):
    cliente = _con_la_clave(sitio)

    dentro = cliente.get(_foto(DENTRO))
    assert dentro.status_code == 200 and dentro.content == IMAGEN
    assert dentro.headers["cache-control"] == "public, max-age=86400"
    assert "set-cookie" not in dentro.headers, "una tesela no reparte ni renueva cookies"
    fuera = cliente.get(_foto(FUERA))
    assert fuera.content == public._tesela_en_blanco(relieve=False)
    assert fuera.headers["cache-control"] == "public, max-age=3600"
    assert cliente.get(_relieve(DENTRO_DEM)).content == IMAGEN
    assert cliente.get(_relieve(FUERA_DEM)).content == public._tesela_en_blanco(relieve=True)


def test_con_la_clave_el_lote_trae_las_de_dentro_y_no_lleva_set_cookie(sitio):
    cliente = _con_la_clave(sitio)
    r = cliente.get("/api/teselas/lote/p1abc", params={"t": _foto(DENTRO) + "," + _foto(FUERA)})

    assert r.status_code == 200 and r.headers["x-saga-lote"] == "completo" and "set-cookie" not in r.headers
    assert r.headers["cdn-cache-control"] == "public, max-age=2592000" and r.headers["cache-control"] == "no-store"
    assert r.content.count(IMAGEN) == 1, "la de dentro con sus bytes; la de fuera, vacía"


def test_sin_clave_de_mision_puesta_las_teselas_siguen_abiertas(sitio):
    main.set_mission_password("")

    assert sitio.get(_foto(DENTRO)).content == IMAGEN
    assert sitio.get(_foto(FUERA)).content == public._tesela_en_blanco(relieve=False)
    assert sitio.get("/api/teselas/lote/p1abc", params={"t": _foto(DENTRO)}).status_code == 200


# ---------------------------------------------------------------------------
# «Precalentar mapa»: el panel pasa con su sesión, con el filtro de zona de un móvil
# ---------------------------------------------------------------------------

def _teselas_del_lote(cuerpo):
    """{ruta: bytes} de un lote (ver `teselas_en_lote` en routers/public.py)."""
    assert cuerpo[:4] == b"SAGT"
    (cuantas,) = struct.unpack_from("<I", cuerpo, 4)
    pos, salida = 8, {}
    for _ in range(cuantas):
        (n,) = struct.unpack_from("<H", cuerpo, pos)
        ruta = cuerpo[pos + 2:pos + 2 + n].decode("utf-8")
        pos += 2 + n
        (n,) = struct.unpack_from("<H", cuerpo, pos)
        pos += 2 + n
        (n,) = struct.unpack_from("<I", cuerpo, pos)
        salida[ruta] = cuerpo[pos + 4:pos + 4 + n]
        pos += 4 + n
    return salida


def test_precalentar_con_la_sesion_del_panel_da_el_mismo_lote_completo_que_a_un_movil(sitio):
    rutas = _foto(DENTRO) + "," + _foto(FUERA) + "," + _relieve(DENTRO_DEM)
    del_movil = _con_la_clave(TestClient(main.app)).get("/api/teselas/lote/p1abc", params={"t": rutas})

    sitio.cookies.set(main.ADMIN_SESSION_COOKIE, "sesion-del-panel")
    del_panel = sitio.get("/api/teselas/lote/p1abc", params={"t": rutas})

    assert del_panel.status_code == 200
    assert del_panel.headers["x-saga-lote"] == "completo", "con huecos o saltándose la zona Cloudflare no lo guarda"
    assert del_panel.headers["cloudflare-cdn-cache-control"] == "public, max-age=2592000"
    assert "set-cookie" not in del_panel.headers
    assert del_panel.content == del_movil.content, "lo que guarda Cloudflare es lo que recibirá el móvil"
    lote = _teselas_del_lote(del_panel.content)
    assert lote[_foto(DENTRO)] == IMAGEN and lote[_foto(FUERA)] == b"", "en esta ruta el panel NO sale de la zona"


def test_el_panel_sigue_viendo_cualquier_sitio_en_las_rutas_de_imagen(sitio):
    """Quien diseña una misión nueva mira el mapa antes de tener nodos: eso va con sesión, no es el oráculo."""
    sitio.cookies.set(main.ADMIN_SESSION_COOKIE, "sesion-del-panel")
    assert sitio.get(_foto(FUERA)).content == IMAGEN


def test_el_panel_pide_los_lotes_con_su_cookie_y_el_movil_al_mismo_origen():
    panel = (RAIZ / "frontend/src/admin/components/PrecalentarMapa.tsx").read_text(encoding="utf-8")
    assert "credentials: 'same-origin'" in panel and "credentials: 'omit'" not in panel
    # El móvil: `fetch` a rutas del mismo origen (credenciales `same-origin` por defecto) y MapLibre con teselas del
    # propio origen y sin `transformRequest` que les quite la cookie.
    descargas = (RAIZ / "frontend/src/player/offline/mapTileCache.ts").read_text(encoding="utf-8")
    assert "credentials: 'omit'" not in descargas
    assert "return `/api/teselas/lote/${version}?t=" in descargas and "return `/map-tiles/${zoom}/" in descargas
    estilo = (RAIZ / "frontend/src/player/components/mapa/estilo.ts").read_text(encoding="utf-8")
    assert "`${window.location.origin}/map-tiles/{z}/{x}/{y}.png`" in estilo
    assert "${window.location.origin}/dem-tiles/{z}/{x}/{y}.png" in estilo
    mapa = (RAIZ / "frontend/src/player/components/MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "transformRequest" not in estilo and "transformRequest" not in mapa
    assert "API_SIN_CLAVE_GET_PREFIJO" not in (RAIZ / "main.py").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# B1: sin CORS abierto.  B2: tope por IP
# ---------------------------------------------------------------------------

def test_las_teselas_ya_no_llevan_cors_abierto(sitio):
    cliente = _con_la_clave(sitio)
    for ruta in (_foto(DENTRO), _foto(FUERA), _relieve(DENTRO_DEM), _relieve(FUERA_DEM), _relieve(DENTRO_DEM) + "?f=webp"):
        assert "access-control-allow-origin" not in cliente.get(ruta).headers, ruta
    cliente.cookies.clear()
    assert "access-control-allow-origin" not in cliente.get(_foto(DENTRO)).headers
    assert "Access-Control-Allow-Origin" not in (RAIZ / "backend/app/routers/public.py").read_text(encoding="utf-8")


def test_el_tope_de_teselas_sueltas_por_ip(sitio, monkeypatch):
    cliente = _con_la_clave(sitio)
    monkeypatch.setattr(main, "TESELAS_SUELTAS_RATE_LIMIT_MAX", 5)

    codigos = [cliente.get(_foto(DENTRO)).status_code for _ in range(3)]
    codigos += [cliente.get(_relieve(DENTRO_DEM)).status_code for _ in range(2)]
    assert codigos == [200] * 5, "foto y relieve comparten el tope"
    pasada = cliente.get(_foto(DENTRO))
    assert pasada.status_code == 429 and 1 <= int(pasada.headers["retry-after"]) <= 60
    assert cliente.get(_relieve(DENTRO_DEM)).status_code == 429

    # Al minuto siguiente vuelve a contar desde cero.
    for cuenta in public._RITMO_TESELAS.values():
        cuenta[0] -= 1
    assert cliente.get(_foto(DENTRO)).status_code == 200


def test_el_tope_por_defecto_deja_bajar_el_mapa_de_una_en_una():
    """Un móvil que baja el paquete tesela a tesela (peor caso medido: ~1.800 seguidas) no puede tocar el tope."""
    assert main.TESELAS_SUELTAS_RATE_LIMIT_MAX >= 3 * 1800
