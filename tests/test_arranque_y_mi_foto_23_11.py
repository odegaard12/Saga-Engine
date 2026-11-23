# -*- coding: utf-8 -*-
"""23/11: dos fallos vistos en el iPhone de Óscar con la app instalada.

A) «Al abrir SAGA aparece 5 segundos en pantalla blanco»: la navegación esperaba a la red hasta 5 s (tope del service
   worker) ANTES de enseñar nada, y con la conexión recién despertada se quedaba colgada. Igual en 6.12.14 (no es una
   regresión del 22/11). Medido en Chromium con CPU x4 y 4G lento, servidor atascado: primera imagen 5,1 s -> 0,57 s;
   bienvenida 6,7 s -> 1,9 s. Además: fondo ya en la cabecera de index.html, imagen de arranque del iPhone, la puerta de la
   misión abre ya con la misión guardada y la comprobación de sesión sale desde index.html.
B) «Ahí pone foto avatar pero no la mía»: la bienvenida sólo leía la foto de la copia guardada de la configuración o de la
   partida (que llega tarde); sin ninguna pintaba la inicial sobre el color de acento (parece un avatar de relleno) aunque
   el servidor SÍ tenía la foto (las 14 fichas de producción llevan JPEG incrustado). Ahora cada móvil guarda su copia
   (shared/miFoto.ts) y, si no hay foto en ningún sitio, la bienvenida ofrece «Poner mi foto».
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src"


def leer(relativo: str) -> str:
    return (FRONT / relativo).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def foto():
    node = shutil.which("node")
    if not node or not (FRONT / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "mi_foto_23_11.cjs")], capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


# ------------------------------------------------------------------ B: su foto
def test_solo_cuenta_como_foto_una_imagen_raster_nuestra(foto):
    v = foto["valida"]
    assert v["servidor"] and v["jpeg"]
    assert not (v["svg"] or v["cara"] or v["externa"] or v["dobleBarra"] or v["vacia"]), "ni SVG, ni la cara del personaje, ni ajenas"


def test_la_copia_del_movil_manda_y_el_servidor_la_refresca(foto):
    assert foto["sinCopia"].startswith("/api/player-avatar/") and foto["nada"] is None
    assert foto["copiaDelServidor"].startswith("data:image/jpeg")
    assert foto["copiaVieja"].startswith("data:image/jpeg"), "cambió en el servidor: se ve la copia al instante y se refresca después"
    assert foto["copiaPropiaSinServidor"].startswith("data:image/jpeg")
    assert foto["copiaPropiaYServidorConFoto"].startswith("/api/player-avatar/"), "la que puso él sólo vale mientras el servidor no tenga"


def test_recordar_la_foto_comprueba_tipo_tamano_y_no_repite(foto):
    assert foto["guardaServidor"] is True and foto["copia"]["u"].startswith("/api/player-avatar/")
    assert foto["fetchRepetido"] is True, "con la copia de esa URL no se vuelve a pedir"
    assert foto["rechazaGrande"] is foto["rechazaSvg"] is foto["rechazaNoOk"] is foto["sinRed"] is False
    assert foto["copiaLuis"] is None, "lo rechazado no deja copia"
    assert foto["incrustada"] is True and foto["copiaRosa"]["u"] == "incrustada", "no se duplica una foto incrustada"
    assert foto["basura"] is None, "una copia manipulada (no raster) no se lee"


def test_la_bienvenida_elige_su_foto_aunque_la_configuracion_no_la_traiga(foto):
    assert foto["bienvenidaConCopia"].startswith("data:image/jpeg")
    assert foto["bienvenidaSinNada"] is None, "sin foto en ningún sitio: la inicial y «Poner mi foto», nunca otra imagen"
    assert foto["bienvenidaConPartida"].endswith("v=otra999")
    assert foto["bienvenidaPropia"].startswith("data:image/jpeg")


def test_la_bienvenida_ofrece_poner_mi_foto_si_no_hay():
    b = leer("src/player/components/Bienvenida.tsx")
    assert "ponerFoto: 'Poner mi foto'" in b and "ponerFoto: 'Poñer a miña foto'" in b
    assert 'capture="user"' in b and "fotoDeArchivo(archivo)" in b
    # Pregunta al servidor si no hay foto (config guardada vieja) y sólo ofrece con la ficha encontrada y sin foto.
    assert "fetchPublicConfig()" in b and "if (!vivo || !perfil) return" in b
    assert "foto={fotoActual}" in b and "fotoDelJugador(d.cara)" in b
    assert "recordarMiFoto(getPlayerNameFromLocation() || '', foto)" in b
    assert "void recordarMiFoto(usuario, d.cara).then((hecho) => hecho && setVersion((v) => v + 1))" in b, "foto cambiada en el panel: se refresca"
    assert "fotoDelJugador(datosDeBienvenida().cara)" in leer("src/player/components/PantallaDeCarga.tsx")


def test_el_login_guarda_la_foto_que_se_ve_ahi():
    login = leer("src/login/LoginApp.tsx")
    assert "void recordarMiFoto(id, getPlayerAvatarUrl(profiles.find((p) => p.id === id)))" in login
    assert "if (mio) void recordarMiFoto(mio," in login


# ------------------------------------------------------------------ A: el arranque
def test_la_puerta_abre_ya_con_la_mision_guardada_y_sin_clave(foto):
    assert foto["puerta"] == {"sinCopia": "mirando", "sinClave": "abierta", "claveYaPuesta": "abierta", "claveSinPoner": "mirando"}
    puerta = leer("src/shared/PuertaDeMision.tsx")
    assert "useState<Estado>(() => estadoInicialDeLaPuerta(getCachedPublicConfig()))" in puerta
    # La comprobación sigue por detrás: si el servidor dice que ahora falta la clave, se cierra.
    assert "setEstado(claveHaceFalta(config) ? 'cerrada' : 'abierta')" in puerta


def test_la_sesion_sale_desde_index_html_y_se_gasta_una_vez(foto):
    assert foto["sesionDeOtro"] is True and foto["sesionAdelantada"] == "valida" and foto["sesionGastada"] is True
    assert foto["sesionColgada"] == "sin-red"
    html = leer("index.html")
    assert "window.__sagaSesion=fetch('/api/jugador/sesion?user='" in html
    assert "esperaMs = 1500" in leer("src/shared/jugadorRecordado.ts")


def test_index_html_pinta_el_fondo_antes_de_que_baje_la_hoja_de_estilos():
    html = leer("index.html")
    cabecera = html[: html.index("</head>")]
    assert "<style>html,body{margin:0;background:#020617}</style>" in cabecera
    assert 'name="color-scheme" content="dark"' in cabecera
    # La portada de index.html, la de React y el manifiesto usan el mismo fondo.
    assert "var(--theme-bg,#020617)" in html and "#020617" in leer("src/shared/PuertaDeMision.tsx")
    assert json.loads(leer("public/manifest.webmanifest"))["background_color"] == "#020617"


def test_cada_imagen_de_arranque_del_iphone_existe_y_tiene_el_tamano_que_dice():
    html = leer("index.html")
    enlaces = re.findall(r'rel="apple-touch-startup-image" href="/ios/(splash-(\d+)x(\d+)\.png)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)', html)
    assert len(enlaces) >= 10
    for nombre, w, h, dw, dh, ratio in enlaces:
        assert (int(dw) * int(ratio), int(dh) * int(ratio)) == (int(w), int(h)), nombre
        fichero = FRONT / "public" / "ios" / nombre
        assert fichero.exists() and fichero.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n", nombre
        assert fichero.stat().st_size < 40_000, "ligeras: iOS las baja al instalar"


def test_la_portada_nunca_se_deja_en_blanco_mientras_llega_el_login():
    app = leer("src/App.tsx")
    assert "<Suspense fallback={<PortadaDeArranque />}>\r\n            <LoginApp />" in app or "<Suspense fallback={<PortadaDeArranque />}>\n            <LoginApp />" in app


def test_el_sw_ensena_la_copia_si_la_red_tarda():
    sw = leer("public/sw.js")
    assert "const ESPERA_DE_LA_PAGINA_MS = 800" in sw
    assert "event.respondWith(navegarConCopiaALaVista(request, event))" in sw
    assert "event.waitUntil(porLaRed.catch(() => undefined))" in sw
