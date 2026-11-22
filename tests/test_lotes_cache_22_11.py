# -*- coding: utf-8 -*-
"""22/11: los lotes de mapa, listos para la caché de Cloudflare (auditoría de GET /api/teselas/lote/{version}).

Sin Set-Cookie (con ella Cloudflare no guarda), cabeceras para guardar 30 días en el CDN y nada en el navegador, nunca
inmutable un lote con huecos (página de error con 200, sin zona), una versión de los datos de las teselas, la IP de
verdad tras cloudflared y el relieve de Terrarium sin `?v=` que cambie al rehacer los edificios.
"""
import asyncio
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-lotes-2211-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import public  # noqa: E402
from backend.app.security import client_ip  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
CAJA = (42.0, 43.0, -9.0, -8.0)
RUTAS = "/map-tiles/15/100/200.png,/dem-tiles/12/50/60.png"
CLAVE = "KX3TQ7DM"


@pytest.fixture()
def lote(monkeypatch):
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(public._teselas, "caja_de_la_mision", lambda: CAJA)
    monkeypatch.setattr(public._teselas, "tesela_permitida", lambda z, x, y, caja: True)
    respuestas = {}

    async def falsa(cliente, tipo, z, x, y):
        return respuestas.get(tipo, (b"\x89PNG-bytes", "image/png"))

    monkeypatch.setattr(public, "_tesela_para_lote", falsa)
    return TestClient(main.app), respuestas, monkeypatch


def test_un_lote_completo_lo_guarda_cloudflare_30_dias_y_el_navegador_no(lote):
    c, _, _ = lote
    r = c.get("/api/teselas/lote/p1abc", params={"t": RUTAS})
    assert r.status_code == 200
    assert r.headers["cloudflare-cdn-cache-control"] == "public, max-age=2592000"
    assert r.headers["cdn-cache-control"] == "public, max-age=2592000"
    assert r.headers["cache-control"] == "no-store"
    assert "set-cookie" not in r.headers


def test_una_pagina_de_error_con_200_deja_el_lote_incompleto(lote):
    c, respuestas, _ = lote
    respuestas["map-tiles"] = (b"<html>error</html>", "text/html")
    r = c.get("/api/teselas/lote/p1abc", params={"t": RUTAS})
    assert r.status_code == 200
    for cabecera in ("cloudflare-cdn-cache-control", "cdn-cache-control", "cache-control"):
        assert r.headers[cabecera] == "no-store", cabecera
    assert b"<html>" not in r.content, "la página de error no sale como tesela"


def test_sin_zona_conocida_el_lote_no_se_guarda(lote):
    c, _, monkeypatch = lote
    monkeypatch.setattr(public._teselas, "caja_de_la_mision", lambda: None)
    r = c.get("/api/teselas/lote/p1abc", params={"t": RUTAS})
    assert r.headers["cloudflare-cdn-cache-control"] == "no-store" and r.headers["cache-control"] == "no-store"


def test_el_relieve_de_terrarium_que_no_es_imagen_es_un_hueco(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))

    class Cliente:
        async def get(self, url, **_):
            return SimpleNamespace(status_code=200, headers={"Content-Type": "text/html"}, content=b"<html>")

    assert asyncio.run(public._tesela_para_lote(Cliente(), "dem-tiles", 12, 50, 60)) is None
    assert not (tmp_path / "dem_cache" / "12" / "50" / "60.bin").exists()


def test_con_clave_de_mision_el_lote_por_get_no_lleva_set_cookie(lote, tmp_path):
    c, _, monkeypatch = lote
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    main.set_mission_password(CLAVE)
    c.post("/api/mission/unlock", json={"password": CLAVE})
    r = c.get("/api/teselas/lote/p1abc", params={"t": RUTAS})
    assert r.status_code == 200 and "set-cookie" not in r.headers
    assert "set-cookie" in c.get("/api/config").headers, "el resto de /api sigue renovando la cookie"
    c.cookies.clear()
    # 22/11 (auditoría): sin cookie también sale (lo pide así «Precalentar mapa»), completo y sin Set-Cookie; el POST
    # y el resto de /api siguen pidiendo la clave.
    r = c.get("/api/teselas/lote/p1abc", params={"t": RUTAS})
    assert r.status_code == 200 and "set-cookie" not in r.headers and r.headers["x-saga-lote"] == "completo"
    assert c.post("/api/teselas/lote", json={"teselas": RUTAS.split(",")}).status_code == 401
    assert c.get("/api/config").status_code == 401


def test_el_lote_dice_si_esta_completo(lote):
    c, respuestas, _ = lote
    assert c.get("/api/teselas/lote/p1abc", params={"t": RUTAS}).headers["x-saga-lote"] == "completo"
    respuestas["map-tiles"] = (b"<html>error</html>", "text/html")
    assert c.get("/api/teselas/lote/p1abc", params={"t": RUTAS}).headers["x-saga-lote"] == "incompleto"
    panel = (RAIZ / "frontend/src/admin/components/PrecalentarMapa.tsx").read_text(encoding="utf-8")
    assert "res.headers.get('x-saga-lote') === 'completo'" in panel and "immutable" not in panel
    assert "credentials: 'omit'" in panel, "sin la cookie del panel: filtro de zona de un móvil"


def test_si_falla_el_webp_el_lote_lleva_el_png(lote):
    c, _, monkeypatch = lote

    async def revienta(z, x, y, png):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr(public, "_convertir_relieve_a_webp", revienta)
    r = c.get("/api/teselas/lote/p1abc", params={"t": RUTAS, "f": "webp"})
    assert r.headers["x-saga-lote"] == "completo"
    assert b"image/png" in r.content and b"\x89PNG-bytes" in r.content and b"image/webp" not in r.content
    assert public._WEBP_EN_CURSO == {}


def test_la_version_de_las_teselas_cambia_con_los_datos(monkeypatch):
    v = public.version_de_teselas()
    assert v and len(v) == 10
    assert TestClient(main.app).get("/api/config").json()["teselas_version"] == v
    for cambio in (
        ("VERSION_DATOS_TESELAS", "2", public),
        ("PNOA_EN_EL_MAPA", not public._teselas.PNOA_EN_EL_MAPA, public._teselas),
        ("RELIEVE_IGN_EN_EL_MAPA", not public._teselas.RELIEVE_IGN_EN_EL_MAPA, public._teselas),
        ("URL_ESRI", "https://otro/{z}/{y}/{x}", public._teselas),
        ("_BASE_RELIEVE", "https://otro/terrarium", public),
        ("PARAMETROS_WEBP_RELIEVE", {**public._teselas.PARAMETROS_WEBP_RELIEVE, "method": 4}, public._teselas),
    ):
        with monkeypatch.context() as m:
            m.setattr(cambio[2], cambio[0], cambio[1])
            assert public.version_de_teselas() != v, cambio[0]


def test_el_relieve_de_terrarium_no_sigue_la_version_del_mapa_3d(monkeypatch):
    monkeypatch.setattr(public._mapa3d, "version", lambda data_dir: "abc123")
    monkeypatch.setattr(public._teselas, "RELIEVE_IGN_EN_EL_MAPA", False)
    cfg = TestClient(main.app).get("/api/config").json()
    assert cfg["mapa3d_version"] == "abc123" and cfg["relieve_version"] == ""
    monkeypatch.setattr(public._teselas, "RELIEVE_IGN_EN_EL_MAPA", True)
    assert TestClient(main.app).get("/api/config").json()["relieve_version"] == "abc123"


def _peticion(host, cabeceras):
    return SimpleNamespace(client=SimpleNamespace(host=host), headers={k.lower(): v for k, v in cabeceras.items()})


def test_tras_cloudflared_cuenta_la_ip_de_verdad_y_nadie_mas_la_elige(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", False)
    cf = {"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "198.51.100.1"}
    assert main.get_client_ip(_peticion("127.0.0.1", cf)) == "203.0.113.7"
    assert main.get_client_ip(_peticion("::1", cf)) == "203.0.113.7"
    # 22/11 (auditoría): la red de Docker ya no vale por defecto (un móvil de la LAN por el proxy del puerto publicado
    # llega como 172.x y elegiría su IP); con cloudflared en otro contenedor se añade a mano.
    assert main.get_client_ip(_peticion("172.18.0.5", cf)) == "172.18.0.5"
    monkeypatch.setattr(client_ip, "CLOUDFLARED_CIDRS", client_ip.parse_trusted_proxy_cidrs("127.0.0.0/8,::1/128,172.16.0.0/12"))
    assert main.get_client_ip(_peticion("172.18.0.5", cf)) == "203.0.113.7"
    monkeypatch.setattr(client_ip, "CLOUDFLARED_CIDRS", client_ip.parse_trusted_proxy_cidrs("127.0.0.0/8,::1/128"))
    # Sólo CF-Connecting-IP; sin ella, la del túnel.
    assert main.get_client_ip(_peticion("127.0.0.1", {"X-Forwarded-For": "198.51.100.1"})) == "127.0.0.1"
    assert main.get_client_ip(_peticion("127.0.0.1", {"CF-Connecting-IP": "no-es-ip"})) == "127.0.0.1"
    # Desde la LAN o internet la cabecera no vale.
    assert main.get_client_ip(_peticion("10.20.30.50", cf)) == "10.20.30.50"
    assert main.get_client_ip(_peticion("8.8.8.8", cf)) == "8.8.8.8"
    monkeypatch.setattr(client_ip, "CLOUDFLARED_CIDRS", [])
    assert main.get_client_ip(_peticion("127.0.0.1", cf)) == "127.0.0.1"


def test_quince_lotes_a_la_vez_convierten_el_relieve_una_sola_vez(monkeypatch):
    llamadas = []

    async def convertir(z, x, y, png):
        llamadas.append((z, x, y))
        await asyncio.sleep(0.05)
        return b"WEBP", "image/webp"

    monkeypatch.setattr(public, "_convertir_relieve_a_webp", convertir)

    async def quince():
        return await asyncio.gather(*(public._relieve_en_webp(12, 50, 60, b"png") for _ in range(15)))

    assert asyncio.run(quince()) == [(b"WEBP", "image/webp")] * 15
    assert llamadas == [(12, 50, 60)] and public._WEBP_EN_CURSO == {}


def test_el_movil_lee_el_lote_con_cuidado():
    node = shutil.which("node")
    if not node:
        pytest.skip("node no está disponible")
    p = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "lotes_cache_22_11.cjs")],
        cwd=str(RAIZ), capture_output=True, text=True, encoding="utf-8", timeout=180,
    )
    assert p.returncode == 0, p.stderr[-2000:]
    r = json.loads(p.stdout.strip().splitlines()[-1])
    A, B = "/map-tiles/15/1/1.png", "/map-tiles/15/2/1.png"
    assert r["parser"] == {
        "bueno": [[A, 16], [B, 16]],
        "cortado": [[A, 16]],
        "cortadoEnLaRuta": [],
        "otraCuenta": None,
        "rutaDeMas": [[A, 16]],
        "largoMentiroso": [],
        "sinMagia": None,
    }
    assert r["relieveServidorViejo"] == "?v=m3d" and r["relieveTerrarium"] == "" and r["relieveIgn"] == "?v=ign1"
    assert r["edificios"] == "?v=m3d"
    assert r["versiones"] == {"cambiaConTeselas": True, "cambiaConServidorNuevo": True, "formato": True}
    assert r["planIgnConV"] is True and r["planTerrariumSinV"] is True
    carga = r["carga"]
    assert carga["abortados"] == 1, "el cuerpo colgado se aborta por tiempo"
    assert carga["fueraGuardada"] is False and carga["fueraFalta"] is True
    assert carga["lotesPorGet"] > 0 and carga["lotesPorPost"] == 0
    assert carga["sinCapturar"] == []
    fuente = (RAIZ / "frontend/src/player/offline/mapTileCache.ts").read_text(encoding="utf-8")
    assert "`${firmaDelPlan()}|${firmaRuta}|${TILE_CACHE_NAME}|${versionTeselas}`" in fuente
