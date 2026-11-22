# -*- coding: utf-8 -*-
"""22/11 (cargas y precargas): lo que baja la primera vez, medido con una ruta de prueba (80 MB, 70 de ellos teselas).

* El relieve (~440 teselas Terrarium de ~95 KB, el 60 % del paquete) viaja en WebP SIN pérdida cuando el móvil lo pide
  (`f=webp` en el lote GET): mismos píxeles, un tercio menos. Los lotes en PNG de los móviles de antes siguen igual.
* La pantalla de carga pide los ficheros de la app con `X-Saga-Carga` (el service worker los deja pasar: los guardaba
  dos veces) y, en la primera ronda, acepta la caché HTTP (los paquetes de arranque se bajaban dos veces).
* El almacenamiento persistente se pide también al entrar con descarga, no sólo en «Prepararse».
"""
import io
import json
import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-cargas-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from backend.app.routers import public  # noqa: E402
from backend.app.runtime import teselas  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]


def _terrarium_png() -> bytes:
    """Una tesela terrain-RGB de verdad en forma: una ladera suave (0-300 m) con ruido fino."""
    datos = bytearray()
    for fila in range(256):
        for col in range(256):
            h = 32768 + fila * 1.1 + col * 0.07 + ((fila * 7 + col * 13) % 5) / 8
            datos += bytes((int(h) >> 8, int(h) & 255, int((h % 1) * 256)))
    salida = io.BytesIO()
    Image.frombytes("RGB", (256, 256), bytes(datos)).save(salida, format="PNG")
    return salida.getvalue()


PNG = _terrarium_png()


def _pixeles(contenido: bytes):
    imagen = Image.open(io.BytesIO(contenido)).convert("RGB")
    return imagen.tobytes()


def test_el_relieve_en_webp_es_identico_y_pesa_menos():
    webp = teselas.relieve_a_webp(PNG)
    assert webp is not None and webp[:4] == b"RIFF" and webp[8:12] == b"WEBP"
    assert len(webp) < len(PNG)
    assert _pixeles(webp) == _pixeles(PNG), "sin pérdida: la altura de cada píxel es la misma"
    # Lo que no es un PNG de relieve no se toca.
    assert teselas.relieve_a_webp(b"no es una imagen") is None
    jpeg = io.BytesIO()
    Image.new("RGB", (8, 8), (1, 2, 3)).save(jpeg, format="JPEG")
    assert teselas.relieve_a_webp(jpeg.getvalue()) is None


def _leer_lote(cuerpo: bytes):
    assert cuerpo[:4] == b"SAGT"
    n = struct.unpack_from("<I", cuerpo, 4)[0]
    o, salida = 8, {}
    for _ in range(n):
        lr = struct.unpack_from("<H", cuerpo, o)[0]
        ruta = cuerpo[o + 2:o + 2 + lr].decode()
        o += 2 + lr
        lt = struct.unpack_from("<H", cuerpo, o)[0]
        tipo = cuerpo[o + 2:o + 2 + lt].decode()
        o += 2 + lt
        ld = struct.unpack_from("<I", cuerpo, o)[0]
        salida[ruta] = (tipo, cuerpo[o + 4:o + 4 + ld])
        o += 4 + ld
    return salida


@pytest.fixture()
def cliente(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(public._teselas, "caja_de_la_mision", lambda: (42.0, 43.0, -9.0, -8.0))
    monkeypatch.setattr(public._teselas, "tesela_permitida", lambda z, x, y, caja: True)
    pedidas = []

    async def falsa(cliente, tipo, z, x, y):
        pedidas.append((tipo, z, x, y))
        return (PNG, "image/png") if tipo == "dem-tiles" else (b"\xff\xd8JPEG", "image/jpeg")

    monkeypatch.setattr(public, "_tesela_para_lote", falsa)
    return TestClient(main.app), tmp_path


RUTAS = "/map-tiles/15/100/200.png,/dem-tiles/12/50/60.png"


def test_el_lote_con_f_webp_trae_el_relieve_en_webp_y_el_satelite_igual(cliente):
    c, datos = cliente
    r = c.get("/api/teselas/lote/p1abc", params={"t": RUTAS, "f": "webp"})
    assert r.status_code == 200 and r.headers["cloudflare-cdn-cache-control"] == "public, max-age=2592000"
    lote = _leer_lote(r.content)
    assert lote["/map-tiles/15/100/200.png"] == ("image/jpeg", b"\xff\xd8JPEG")
    tipo, cuerpo = lote["/dem-tiles/12/50/60.png"]
    assert tipo == "image/webp" and _pixeles(cuerpo) == _pixeles(PNG)
    # Se guarda la primera vez: la siguiente no se recodifica.
    assert (datos / "dem_webp" / "12" / "50" / "60.bin").read_bytes() == cuerpo


def test_sin_f_webp_el_lote_sigue_en_png(cliente):
    c, _ = cliente
    lote = _leer_lote(c.get("/api/teselas/lote/p1abc", params={"t": RUTAS}).content)
    assert lote["/dem-tiles/12/50/60.png"] == ("image/png", PNG)
    lote = _leer_lote(c.post("/api/teselas/lote", json={"teselas": RUTAS.split(",")}).content)
    assert lote["/dem-tiles/12/50/60.png"] == ("image/png", PNG)


def test_el_movil_pide_el_relieve_en_webp_por_el_lote_get():
    fuente = (RAIZ / "frontend/src/player/offline/mapTileCache.ts").read_text(encoding="utf-8")
    assert "?t=${encodeURIComponent(lista.join(','))}&f=webp`" in fuente
    # Se guarda con el tipo que trae el lote (image/webp), no con uno fijo.
    assert "'Content-Type': tipo || 'image/png'" in fuente


def test_la_pantalla_de_carga_pide_la_app_sin_pasar_por_el_service_worker():
    node = shutil.which("node")
    if not node:
        pytest.skip("node no está disponible")
    p = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "cargas_22_11.cjs")],
        cwd=str(RAIZ), capture_output=True, text=True, encoding="utf-8", timeout=120,
    )
    assert p.returncode == 0, p.stderr[-2000:]
    r = json.loads(p.stdout.strip().splitlines()[-1])
    assert r["modos"] == {"asset0": "default", "asset1": "reload", "pagina0": "reload", "raiz0": "reload"}
    assert r["completo"]
    assert r["vistos"] and all(v["carga"] == "1" for v in r["vistos"]), r["vistos"]
    assert {v["ruta"]: v["cache"] for v in r["vistos"]}["/assets/index-aaaaaaaa.js"] == "default"
    sw = (RAIZ / "frontend/public/sw.js").read_text(encoding="utf-8")
    assert "request.headers.get('X-Saga-Carga') !== '1'" in sw
    # Con la pantalla apagada o sin red no se gastan los reintentos: se espera a que vuelva.
    assert r["sePuede"] == {
        "visible": False, "oculta": True, "esperaConOculta": True, "sinRed": True,
        "esperaSinRed": True, "terminaAlVolver": True, "cancelada": True,
    }
    mapa = (RAIZ / "frontend/src/player/offline/mapTileCache.ts").read_text(encoding="utf-8")
    assert "const esperarRed = () => esperarAQueSePuedaBajar(cancelado)" in mapa
    assert "if (noSePuedeBajarAhora()) {" in mapa
    app = (RAIZ / "frontend/src/player/offline/pwaShell.ts").read_text(encoding="utf-8")
    assert "if (ronda > 0) await esperarAQueSePuedaBajar(cancelado)" in app


def test_al_entrar_con_descarga_se_pide_el_almacenamiento_persistente():
    fuente = (RAIZ / "frontend/src/player/offline/cargaCompleta.ts").read_text(encoding="utf-8")
    i_pantalla = fuente.index("opciones.alCambiar(estadoInicial, '')")
    i_persistir = fuente.index("void pedirAlmacenamientoPersistente()")
    i_descarga = fuente.index("let final = await descargarPartes(")
    assert i_pantalla < i_persistir < i_descarga
