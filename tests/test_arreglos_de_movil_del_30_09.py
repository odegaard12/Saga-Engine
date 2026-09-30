# -*- coding: utf-8 -*-
"""Lo que salió al probar la v5.43.0 en un móvil de verdad (30/09/2026).

- El popup de un compañero salía BLANCO con letra clara: el CSS de maplibre-gl se
  carga con el mapa, después del nuestro, y con la misma especificidad ganaba.
- Su marcador (del DOM) tapaba el tuyo (un símbolo del lienzo) al acercarse.
- Fuera del trazado había un círculo (el aro del GPS) en tu posición además de la línea.
- El mapa se abría en el nodo y se deslizaba hasta ti al terminar de cargar; en modo
  prueba, además, se lanzaban dos animaciones a la vez.
- El micrófono sólo se pide en «Prepararse»; con una ruta sin reto de audio ahora lo dice.

Lo ejecutable se ejecuta (tests/js/logica_jugador.cjs); lo que sólo existe dentro de
React/MapLibre se comprueba por el código, como el resto de pruebas del repo.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
COMP = FRONT / "player" / "components"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    res = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "logica_jugador.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=180, cwd=str(RAIZ),
    )
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout)


def test_los_companeros_cerca_de_ti_se_apartan_en_pantalla(js):
    m = js["mapaSolape"]
    # A cualquier zoom (medido en píxeles), quien cae encima o casi se coloca a 60 px.
    assert m["distEncima"] == pytest.approx(60, abs=0.01)
    assert m["distCasi"] == pytest.approx(60, abs=0.01)
    # Dos compañeros exactamente en tu sitio no se tapan entre sí: se abren en abanico.
    assert m["distOtroEncima"] == pytest.approx(60, abs=0.01)
    assert m["losDosEncimaNoSeTapanEntreSi"] > 40
    # Quien ya estaba lejos no se toca, y sin tu posición nadie se mueve.
    assert m["lejosSinMover"] == [0, 0]
    assert m["sinYo"] == [0, 0]


def test_con_el_mapa_inclinado_se_aparta_del_avatar_elevado_no_del_suelo(js):
    i = js["mapaSolape"]["inclinado"]
    assert i["subida"] > 15  # a zoom 19,5 y 55 grados el avatar sube más de 15 px
    assert i["distAlAvatarElevado"] == pytest.approx(60, abs=0.01)


def test_la_distancia_se_lee_en_palabras_cortas(js):
    assert js["mapaSolape"]["metros"] == ["3 m", "50 m", "1,2 km"]


def test_el_micro_solo_cuenta_si_la_ruta_tiene_un_reto_de_audio(js):
    r = js["microfonoDeLaRuta"]
    assert r["sinAudio"] is False and r["vacia"] is False
    assert r["conAudio"] is True and r["porGameId"] is True
    # Sin datos no se supone que sobre: se pide, como siempre.
    assert r["sinDatos"] is True


def test_el_popup_del_companero_va_con_el_tema_y_gana_a_maplibre():
    css = leer(COMP / "map-surface.css")
    # Más específico que `.maplibregl-popup-content` (que carga DESPUÉS): si no, sale blanco.
    assert re.search(r"\.maplibregl-popup\s+\.maplibregl-popup-content\s*\{[^}]*var\(--theme-card\)", css)
    assert "var(--theme-hairline)" in css and "var(--theme-card-inset)" in css
    # Nada de blanco fijo de fondo en la tarjeta.
    bloque = css[css.index(".maplibregl-popup .maplibregl-popup-content"):]
    bloque = bloque[: bloque.index("}")]
    assert "#fff" not in bloque.replace("var(--theme-text, #fff)", "")
    for clase in ("saga-popup-cabecera", "saga-popup-cara", "saga-popup-nombre", "saga-popup-cerrar", "saga-popup-linea"):
        assert f".{clase}" in css


def test_el_popup_dice_quien_cuanto_y_a_que_distancia():
    src = leer(COMP / "jugadoresEnMapa.ts")
    assert "saga-popup-cara" in src and "getPlayerAvatarUrl" in src
    assert "t.distancia(" in src and "haceCuanto(" in src and "botonCerrar(" in src
    textos = leer(COMP / "textosDePantallas.ts")
    assert "hace ${n} min" in textos and "hai ${n} min" in textos and "${n} min ago" in textos
    # El contenido se rehace al abrir (la distancia y el «hace 2 min» cambian).
    gl = leer(COMP / "MapSurfaceGL.tsx")
    assert "ventana.on('open'" in gl and "closeButton: false" in gl


def test_el_aro_del_gps_se_apaga_fuera_del_trazado():
    gl = leer(COMP / "MapSurfaceGL.tsx")
    assert "setLayoutProperty(CAPA_AURA, 'visibility', fueraDeTrazado !== null ? 'none' : 'visible')" in gl
    assert "[fueraDeTrazado, versionEstilo]" in gl


def test_tu_marcador_no_lo_tapan_los_demas():
    gl = leer(COMP / "MapSurfaceGL.tsx")
    assert gl.count("apartarDeMi(") >= 2 and "mapa.on('move', alMover)" in gl and "mapa.off('move', alMover)" in gl
    # Ya no se apartan por metros (a zoom alto no bastaba).
    assert "cercaDeMi" not in gl


def test_el_mapa_no_salta_al_terminar_de_cargar():
    gl = leer(COMP / "MapSurfaceGL.tsx")
    # El calentamiento no se ve: lienzo transparente hasta que la cámara vuelve a su sitio.
    assert "lienzo.style.opacity = '0'" in gl and gl.count("mostrarLienzo()") >= 2
    # Seguir + «centrar en mí» del modo prueba: una sola animación.
    assert "encuadrePendiente" in gl
    app = leer(FRONT / "player" / "PlayerApp.tsx")
    # Se abre ya donde estás (GPS, modo prueba o última posición).
    assert re.search(r"initialCenter=\{\s*\(posicionEnMapa \?", app)


def test_prepararse_dice_que_el_micro_no_hace_falta():
    panel = leer(COMP / "FieldPrepPanel.tsx")
    assert "No hace falta en esta ruta" in panel and "Non fai falta nesta ruta" in panel
    assert "microfonoNecesario" in panel
    app = leer(FRONT / "player" / "PlayerApp.tsx")
    assert "microfonoNecesario: rutaUsaMicrofono(payload.stages)" in app
    assert "rutaUsaMicrofono(payload.stages) && preparacion.microfono" in app
