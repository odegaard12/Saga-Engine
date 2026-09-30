# -*- coding: utf-8 -*-
"""Lo que salió al probar la v5.43.1 en un móvil de verdad (30/09/2026, tarde).

1. Al enfocar «introduce código» de Herramientas la página se AMPLIABA (iOS Safari
   amplía los campos de menos de 16 px) y no debía poder ampliarse nunca.
2. Los compañeros, como marcadores del DOM con un desplazamiento en píxeles que se
   recalculaba al mover, «se iban a otras zonas de Galicia» al hacer zoom. Ahora son
   símbolos de una capa del mapa, como los nodos: siempre en su posición real.
3. La calidad de las fotos de campo: 1080p reducido a 1600 px y una miniatura de 360 px.

Lo ejecutable se ejecuta (tests/js/logica_jugador.cjs); lo que sólo existe dentro de
React/MapLibre se comprueba por el código, como el resto de pruebas del repo.
"""
import base64
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-zoomcam-"))

import pytest  # noqa: E402

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


# ---------------------------------------------------------------- 1. sin zoom de página

def test_el_viewport_del_jugador_no_permite_ampliar():
    html = leer(RAIZ / "frontend" / "index.html")
    assert "maximum-scale=1" in html and "user-scalable=no" in html


def test_el_viewport_es_sin_zoom_en_el_juego_y_normal_en_el_panel(js):
    sin, con = js["calidadDeFoto"]["viewport"]
    assert "maximum-scale=1" in sin and "user-scalable=no" in sin
    assert "user-scalable" not in con and "maximum-scale" not in con
    app = leer(FRONT / "App.tsx")
    assert "fijarViewport(!isAdmin)" in app and "bloquearGestosDeZoom()" in app
    util = leer(FRONT / "player" / "utils" / "sinZoomDePagina.ts")
    for gesto in ("gesturestart", "gesturechange", "gestureend"):
        assert gesto in util
    assert "preventDefault" in util and "passive: false" in util


def test_todo_campo_de_texto_del_jugador_va_a_16_px_o_mas():
    css = leer(FRONT / "styles" / "mobile-shell.css")
    bloque = css[css.index("html.saga-sin-zoom input"):]
    bloque = bloque[: bloque.index("}")]
    assert "textarea" in bloque and "select" in bloque and "font-size: 16px !important" in bloque
    # Y los campos con estilo propio, ya a 16 en origen.
    for fichero, nombre in (
        ("FieldCameraCapture.tsx", "noteInput"),
        ("PlayerHud.tsx", "fallbackToolInput"),
        ("QuickProofPanel.tsx", "manualInput"),
    ):
        src = leer(COMP / fichero)
        objeto = src[src.index(f"const {nombre}: CSSProperties"):]
        objeto = objeto[: objeto.index("\n}")]
        tam = int(re.search(r"fontSize:\s*(\d+)", objeto).group(1))
        assert tam >= 16, f"{nombre} a {tam}px: iOS amplía la página al enfocarlo"
    hoja = leer(COMP / "InteractionSheet.tsx")
    codigo = hoja[hoja.index("value={fallbackInputCode}"):]
    codigo = codigo[: codigo.index("/>")]
    assert int(re.search(r"fontSize:\s*(\d+)", codigo).group(1)) >= 16


def test_el_pellizco_de_pagina_esta_apagado_y_el_del_mapa_no():
    css = leer(FRONT / "styles" / "mobile-shell.css")
    assert re.search(r"html\.saga-sin-zoom,\s*html\.saga-sin-zoom body\s*\{[^}]*touch-action:\s*pan-x pan-y", css)
    gl = leer(COMP / "MapSurfaceGL.tsx")
    assert "maxZoom: 19.5" in gl  # el mapa conserva su zoom propio (MapLibre, eventos táctiles)


# ---------------------------------------------------------------- 2. compañeros en el mapa

def test_los_companeros_van_en_su_posicion_real_y_los_solapados_con_hueco_en_pantalla(js):
    m = js["mapaSolape"]
    assert m["n19"] == 4 and m["sinPropio"] is True
    # Encima de ti (y encima entre sí): un hueco distinto cada uno.
    assert m["huecoEncima"] >= 1 and m["huecoOtroEncima"] >= 1
    assert m["huecoEncima"] != m["huecoOtroEncima"]
    assert m["huecoCasi"] >= 1
    # Lejos: sin tocar. Y NUNCA se cambian las coordenadas (era el «se va a otra zona»).
    assert m["huecoLejos"] == 0
    assert m["coordenadasIntactas"] is True


def test_el_grupo_solo_a_zoom_bajo_y_con_las_coordenadas_del_centro(js):
    m = js["mapaSolape"]
    assert m["grupoZoom14"] == [["grupo", 2]]
    assert m["grupoCentroZoom14"][0] == pytest.approx(42.44335)
    # A zoom 18 dos en el mismo punto son dos símbolos en el mismo sitio real, con hueco el segundo.
    assert [x[0] for x in m["porSeparadoZoom18"]] == ["jugador", "jugador"]
    assert [x[1] for x in m["porSeparadoZoom18"]] == [0, 1]
    assert all((x[2], x[3]) == (42.5, -8.6) for x in m["porSeparadoZoom18"])


def test_los_ocho_huecos_son_distintos_y_a_la_misma_distancia(js):
    m = js["mapaSolape"]
    assert m["huecosDistintos"] == 8
    assert m["radioDeHuecos"] == pytest.approx(50, abs=1.5)
    assert m["huecoCero"] == [0, 0]
    assert m["ordenPresencia"] == [0, 1, 2]
    assert m["metrosPorPixelZ19"] == pytest.approx(0.1493, abs=0.001)


def test_la_distancia_se_lee_en_palabras_cortas(js):
    assert js["mapaSolape"]["metros"] == ["3 m", "50 m", "1,2 km"]


def test_los_companeros_son_una_capa_del_mapa_y_no_marcadores_del_dom():
    gl = leer(COMP / "MapSurfaceGL.tsx")
    capa = gl[gl.index("id: CAPA_OTROS,"):]
    capa = capa[: capa.index("paint: {")]
    # Igual que los nodos y tú: altura sobre el suelo, billboard, mismo tamaño compuesto.
    assert "'symbol-height-offset': ALTURA_SIMBOLOS_M" in capa
    assert "'symbol-height-anchor': 'ground'" in capa
    assert "'icon-image': ['get', 'icono']" in capa
    assert "'icon-size': TAMANO_JUGADOR" in capa
    assert "'icon-pitch-alignment': 'viewport'" in capa
    assert "'icon-offset': OFFSET_DE_HUECO" in capa
    assert "'symbol-sort-key': ['get', 'orden']" in capa
    # Se pinta ANTES que tu capa: tú quedas encima.
    assert gl.index("id: CAPA_OTROS,") < gl.index("id: CAPA_JUGADOR,")
    # Sin el camino de marcadores del DOM.
    for muerto in ("marcadoresJugadoresRef", "apartarDeMi", "crearElementoJugador", "crearElementoGrupo",
                   "repartirEnCorro", "new maplibregl.Marker({ element: elemento"):
        assert muerto not in gl, muerto
    src = leer(COMP / "jugadoresEnMapa.ts")
    for muerto in ("apartarDeMi", "setOffset", "crearElementoJugador"):
        assert muerto not in src, muerto


def test_los_datos_de_los_companeros_van_por_pintar_fuente_sin_bucles():
    gl = leer(COMP / "MapSurfaceGL.tsx")
    efecto = gl[gl.index("símbolos de una capa del mapa (ver CAPA_OTROS)"):]
    efecto = efecto[: efecto.index("// 2D / 3D: modelos en 3D")]
    assert "pintarFuente(FUENTE_OTROS" in efecto
    assert "setData(" not in efecto and "setPaintProperty" not in efecto and "queryRenderedFeatures" not in efecto
    # La opacidad por presencia es un dato del punto, no un setPaintProperty.
    assert "opacidad" in efecto
    assert "[FUENTE_OTROS]: { type: 'geojson', data: COLECCION_VACIA }" in gl


def test_tocar_un_companero_abre_la_tarjeta_oscura_en_su_posicion_real():
    gl = leer(COMP / "MapSurfaceGL.tsx")
    click = gl[gl.index("mapa.on('click', CAPA_OTROS"):]
    click = click[: click.index("mapa.on('mouseenter', CAPA_OTROS")]
    assert "ventana.on('open'" in click and "closeButton: false" in click
    assert "ventana.setLngLat([el.lon, el.lat])" in click
    assert "contenidoPopupJugador(" in click and "contenidoPopupGrupo(" in click
    # El toque no se cuela al mapa (modo prueba / nodo).
    assert "fotoTocadaRef.current = true" in click


def test_las_imagenes_de_companeros_se_dibujan_al_pedirlas_y_el_grupo_lleva_numero():
    gl = leer(COMP / "MapSurfaceGL.tsx")
    assert "evento.id.startsWith('otro-')" in gl and "otros-grupo-" in gl
    assert "function dibujarGrupo(" in gl and "fillText(String(Math.min(cuantos, 99))" in gl


# ---------------------------------------------------------------- 3. cámara

def test_la_foto_se_guarda_a_2048_px_y_calidad_085(js):
    f = js["calidadDeFoto"]
    assert f["lado"] == 2048 and f["calidad"] == 0.85
    assert f["dim4032"] == {"ancho": 2048, "alto": 1536}
    assert f["dimVertical"] == {"ancho": 1536, "alto": 2048}
    # Nunca se amplía una foto pequeña.
    assert f["dimPequena"] == {"ancho": 800, "alto": 600}
    assert f["normal"] == {"ancho": 2048, "alto": 1536, "calidad": 0.85}
    assert f["bytes"] == 3


def test_si_la_foto_se_pasa_del_tope_baja_calidad_y_luego_tamano(js):
    e = js["calidadDeFoto"]["enorme"]
    assert e["bytes"] <= 900_000
    assert e["calidad"] < 0.85 and e["ancho"] < 2048


def test_se_pide_la_camara_trasera_a_4k(js):
    c = js["calidadDeFoto"]["camara"]["video"]
    assert c["facingMode"] == {"ideal": "environment"}
    assert c["width"]["ideal"] >= 3840 and c["height"]["ideal"] >= 2160


def test_la_captura_usa_image_capture_y_recodifica_sin_exif():
    src = leer(COMP / "FieldCameraCapture.tsx")
    assert "ImageCapture" in src and "takePhoto()" in src
    # Con reserva: si no hay ImageCapture o falla, el fotograma del vídeo.
    assert "tomarFotoCompleta()" in src and "codificarFoto(video, video.videoWidth, video.videoHeight)" in src
    # Reencode en canvas (quita el EXIF): siempre pasa por toDataURL, nunca se sube el blob tal cual.
    assert "toDataURL('image/jpeg', calidad)" in src
    assert "imageSmoothingQuality = 'high'" in src
    assert "maxSide = 1600" not in src


def test_el_tope_del_cliente_cabe_en_el_del_servidor():
    from backend.app.routers import field_proofs as fotos

    texto = leer(FRONT / "player" / "utils" / "calidadDeFoto.ts")
    tope = int(re.search(r"TOPE_FOTO_BYTES = ([\d_]+)", texto).group(1).replace("_", ""))
    assert tope < fotos.FIELD_PROOF_MAX_IMAGE_BYTES == 3_000_000
    assert fotos.MAX_PIXELES_DE_FOTO == 40_000_000
    assert 2048 * 2048 < fotos.MAX_PIXELES_DE_FOTO


def _gradiente(lado_x, lado_y):
    from PIL import Image

    img = Image.linear_gradient("L").resize((lado_x, lado_y)).convert("RGB")
    salida = io.BytesIO()
    img.save(salida, "JPEG", quality=85)
    return salida.getvalue()


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    import main
    from ruta_de_proba import preparar_mision

    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    cli = TestClient(main.app)
    assert cli.get("/api/game/PLAYER%201").status_code == 200
    return cli


def _subir(cliente, datos):
    uri = "data:image/jpeg;base64," + base64.b64encode(datos).decode("ascii")
    r = cliente.post("/api/field-proofs", json={
        "user": "PLAYER 1", "lat": 40.5, "lon": -3.5, "stage_id": "101", "image_data_url": uri})
    assert r.status_code == 200, r.text
    return r.json()["proof"]


def test_una_foto_de_2048_px_se_acepta_y_su_miniatura_es_de_720(cliente, tmp_path):
    from PIL import Image

    from backend.app.routers import field_proofs as fotos

    datos = _gradiente(2048, 1536)
    assert len(datos) < fotos.FIELD_PROOF_MAX_IMAGE_BYTES
    proof = _subir(cliente, datos)
    assert fotos.LADO_MINIATURA_PX == 720
    miniaturas = list((tmp_path / "proofs" / "thumbs").glob("*.jpg"))
    assert len(miniaturas) == 1
    with Image.open(miniaturas[0]) as m:
        assert max(m.size) == 720
    # Y la original se guarda tal cual (2048), no se reduce en el servidor.
    originales = [p for p in (tmp_path / "proofs").rglob("proof_*.jpg") if "thumbs" not in p.parts]
    with Image.open(originales[0]) as o:
        assert o.size == (2048, 1536)
    assert proof["thumbnail_url"].endswith("/thumb")


def test_una_miniatura_antigua_de_360_se_rehace_a_720_al_pedirla(cliente, tmp_path):
    from PIL import Image

    proof = _subir(cliente, _gradiente(2048, 1536))
    miniatura = next((tmp_path / "proofs" / "thumbs").glob("*.jpg"))
    with Image.open(miniatura) as m:
        vieja = m.copy()
    vieja.thumbnail((360, 360))
    vieja.save(miniatura, "JPEG", quality=82)
    with Image.open(miniatura) as m:
        assert max(m.size) == 360

    r = cliente.get(proof["thumbnail_url"])
    assert r.status_code == 200
    with Image.open(io.BytesIO(r.content)) as servida:
        assert max(servida.size) == 720
    # Ya rehecha: la segunda petición no vuelve a tocarla.
    fecha = miniatura.stat().st_mtime_ns
    assert cliente.get(proof["thumbnail_url"]).status_code == 200
    assert miniatura.stat().st_mtime_ns == fecha


def test_la_miniatura_de_una_foto_pequena_no_se_amplia(cliente, tmp_path):
    from PIL import Image

    _subir(cliente, _gradiente(400, 300))
    miniatura = next((tmp_path / "proofs" / "thumbs").glob("*.jpg"))
    with Image.open(miniatura) as m:
        assert m.size == (400, 300)
