# -*- coding: utf-8 -*-
"""23/11 (auditoría Slow 4G: la primera carga no terminaba y bajaba 109 MB para 50).

* Un lote de teselas sólo se aborta si se PARA (20 s sin un byte), no a los 30 s: a 1,44 Mbit/s un lote de relieve
  tarda 45-80 s y se abortaba siempre, tres veces, y acababa de una en una.
* De una en una, el relieve también viaja en WebP (`/dem-tiles/...?f=webp`), guardado bajo su dirección `.png`.
* El latido no deja intervalos huérfanos; la clave de misión sube la cola al momento; «Recoger» no repite `node_opened`.
* La barra de la pantalla de carga: una sola, sólo avanza, y el 100 sólo con todo bajado y el mapa pintado.
"""
import io
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-sin-paron-"))

import pytest  # noqa: E402
from fastapi import Response  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from backend.app.routers import public  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
FRONT = RAIZ / "frontend" / "src"


def _png() -> bytes:
    salida = io.BytesIO()
    Image.frombytes("RGB", (64, 64), bytes((i * 7) % 256 for i in range(64 * 64 * 3))).save(salida, format="PNG")
    return salida.getvalue()


PNG = _png()


@pytest.fixture(scope="module")
def resultado():
    node = shutil.which("node")
    if not node:
        pytest.skip("node no está disponible")
    p = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "lotes_sin_paron_23_11.cjs")],
        cwd=str(RAIZ), capture_output=True, text=True, encoding="utf-8", timeout=240,
    )
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout.strip().splitlines()[-1])


def test_un_cuerpo_lento_pero_vivo_llega_y_uno_parado_se_aborta(resultado):
    # 60 s de cuerpo sin ningún hueco de 20 s: llega entero (con el límite fijo de 30 s se abortaba).
    assert resultado["lento"]["ok"] is True and resultado["lento"]["bytes"] == 6000
    # 25 s sin nada: se aborta, y no devuelve un cuerpo a medias.
    assert resultado["parado"]["ok"] is False
    # El seguro: un cuerpo que no acaba nunca también se corta.
    assert resultado["tope"] == "abortado"


def test_un_lote_parado_a_medias_guarda_lo_entero_y_pide_solo_el_resto(resultado):
    a = resultado["aMedias"]
    assert a["faltan"] == 0 and a["primero"] == 30
    assert a["ningunaEnteraRepetida"], a


def test_el_lote_usa_el_paron_y_no_el_limite_fijo():
    mapa = (FRONT / "player/offline/mapTileCache.ts").read_text(encoding="utf-8")
    assert "fetchSinParon(" in mapa and "tiempoTopeDelLote(lista.length)" in mapa
    assert "control.abort(), limite)" not in mapa


def test_de_una_en_una_el_relieve_va_en_webp_con_su_direccion_png(resultado):
    r = resultado["unaAUna"]
    assert r["faltan"] == 0 and r["pedidas"] > 0 and r["todasEnWebp"]
    assert r["guardadasRelieve"] == r["pedidas"] and r["ningunaConF"] and r["tipoGuardado"] == "image/webp"
    sw = (RAIZ / "frontend/public/sw.js").read_text(encoding="utf-8")
    assert "url.searchParams.get('f') === 'webp') return" in sw


def test_el_servidor_da_el_relieve_suelto_en_webp_si_se_pide(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))

    async def en_zona(request, z, x, y):
        return True

    async def suelto(z, x, y):
        return Response(content=PNG, media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})

    monkeypatch.setattr(public, "_en_zona", en_zona)
    monkeypatch.setattr(public, "_relieve_suelto", suelto)
    c = TestClient(main.app)
    r = c.get("/dem-tiles/12/50/60.png", params={"v": "abc", "f": "webp"})
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert r.headers["cache-control"] == "no-store"
    pix = lambda b: Image.open(io.BytesIO(b)).convert("RGB").tobytes()  # noqa: E731
    assert pix(r.content) == pix(PNG)
    # Sin `f=webp`, el PNG de siempre (los móviles de antes y MapLibre).
    r = c.get("/dem-tiles/12/50/60.png", params={"v": "abc"})
    assert r.headers["content-type"] == "image/png" and r.content == PNG


def test_el_latido_no_deja_intervalos_huerfanos_al_desmontar():
    s = (FRONT / "player/hooks/useLatidoYCola.ts").read_text(encoding="utf-8")
    i = s.index("const programarLatido = () => {")
    assert "if (cancelado) return" in s[i:i + 120]
    assert "return () => {\n      cancelado = true" in s


def test_la_clave_de_mision_sube_la_cola_al_momento():
    api = (FRONT / "shared/api.ts").read_text(encoding="utf-8")
    i = api.index("export async function unlockMission")
    assert "window.dispatchEvent(new CustomEvent(EVENTO_SUBIR_COLA))" in api[i:i + 400]
    assert "export const EVENTO_SUBIR_COLA = 'saga:subir-cola'" in api
    hook = (FRONT / "player/hooks/useLatidoYCola.ts").read_text(encoding="utf-8")
    assert "export { EVENTO_SUBIR_COLA }" in hook


def test_recoger_no_repite_node_opened():
    app = (FRONT / "player/PlayerApp.tsx").read_text(encoding="utf-8")
    i = app.index("function openInteraction()")
    bloque = app[i:i + 1600]
    assert "if (aperturaAnotadaRef.current !== nodoAbiertoAhora) {" in bloque
    assert bloque.index("aperturaAnotadaRef.current !== nodoAbiertoAhora") < bloque.index("type: 'node_opened'")


def test_la_barra_es_una_sola_solo_avanza_y_el_100_es_al_final(resultado):
    b = resultado["barra"]
    assert b["monotona"] and b["appMonotona"]
    assert b["ultimo"] == 100 and b["cienes"] == 1, "el 100 sólo con todo bajado y el mapa pintado"
    assert b["maximoSinMapaPintado"] == 97
    # Con la app y el mapa bajando a la vez, la línea dice lo que de verdad espera: el mapa.
    assert b["fasesConLosDos"] == ["mapa"]
    assert resultado["pantalla"] == {"descargado": 97, "preparacion": 100}
