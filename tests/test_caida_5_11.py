# -*- coding: utf-8 -*-
"""5/11/2026: «si se va la luz en casa (las dos Pis caen), ¿la app abre igual?».

Probado en local con un proxy delante del servidor: caído, colgado, 530 con la página de Cloudflare y muy lento.
Lo que estaba bien se fija aquí para que no se rompa; lo que fallaba (abrir con el servidor colgado o lento tardaba
~34 s) se arregla con un límite de espera cuando la ruta ya está guardada.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"


def test_con_la_ruta_guardada_no_se_esperan_los_15_s_del_servidor_colgado():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "limite_al_abrir_5_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    d = json.loads(p.stdout)
    assert "__error" not in d, d
    # Colgada: falla a tiempo y como fallo de red (TypeError), que es lo que lleva al camino de «sin cobertura».
    assert d["error"]["nombre"] == "TypeError" and d["error"]["ms"] < 1000
    assert d["rapida"] == "ok" and d["rechazo"] == "HTTP 530"
    assert d["espera"] == 6000
    carga = (FRONT / "src" / "player" / "offline" / "cargaCompleta.ts").read_text(encoding="utf-8")
    assert "guardado?.payload && guardado.config && !enPreparacion" in carga
    assert "await conLimiteDeTiempo(pedirPartidaLigera(user, guardado), ESPERA_CON_RUTA_GUARDADA_MS)" in carga


def test_la_navegacion_no_acepta_un_5xx_de_cloudflare_como_buena():
    # Con la Pi caída Cloudflare contesta 530/502 con su HTML: la navegación debe caer a la copia guardada.
    sw = (FRONT / "public" / "sw.js").read_text(encoding="utf-8")
    nav = sw[sw.index("async function navigationNetworkFirst("):]
    nav = nav[: nav.index("\n}\n")]
    assert "if (esCaidaDelServidor(response))" in nav
    assert "caches.match(DEFAULT_SHELL_URL, MATCH_OPTIONS)" in nav
    assert "return response.status >= 500 && response.status <= 599" in sw.replace("Boolean(response) && ", "")


def test_la_puerta_de_la_mision_no_deja_la_pantalla_vacia_con_el_servidor_colgado():
    puerta = (FRONT / "src" / "shared" / "PuertaDeMision.tsx").read_text(encoding="utf-8")
    assert "export const ESPERA_DE_LA_PUERTA_CON_MISION_MS = 3000" in puerta
    assert "const conMisionGuardada = getCachedPublicConfig() !== null" in puerta
    # Sólo abre si sigue mirando (si el servidor ya dijo «cerrada», manda eso) y el temporizador se limpia.
    assert "setEstado((previo) => (previo === 'mirando' ? 'abierta' : previo))" in puerta
    assert "window.clearTimeout(abrirSiTarda)" in puerta


def test_sin_servidor_la_lista_de_paquetes_sale_de_la_copia():
    carga = (FRONT / "src" / "player" / "offline" / "cargaCompleta.ts").read_text(encoding="utf-8")
    sin = carga.split("/* -------------------------- SIN COBERTURA -------------------------- */", 1)[1][:2500]
    assert "verificarPaquetesDelJugador(opciones.playerUrl, { soloCopia: true })" in sin


def test_un_530_de_cloudflare_es_sin_cobertura():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "red_pasarela_5_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    assert json.loads(p.stdout) == {"200": False, "404": False, "500": False, "502": True, "530": True}
    api = (FRONT / "src" / "shared" / "api.ts").read_text(encoding="utf-8")
    assert api.count("notarRespuesta(res.status)") == 2 and "notarRedOk()" not in api
