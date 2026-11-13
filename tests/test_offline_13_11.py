# -*- coding: utf-8 -*-
"""13/11 (auditoría de offline y de rendimiento): acceso caducado en el chip, marca «bajar al servidor» tras un rechazo
por no abrir el nodo, topes y cuota llena en el service worker, y los ahorros de CPU/datos/batería de la revisión.
Pruebas de las piezas puras (JS) y de texto sobre el código que no se puede ejecutar sin navegador."""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-offline-1311-"))

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"
NODE = shutil.which("node")


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    if not NODE:
        pytest.skip("sin node")
    p = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "offline_13_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_chip_dice_acceso_caducado_con_red_y_no_sincronizando(datos):
    c = datos["chip"]
    assert c["caducadoConRed"] == {"tipo": "acceso_caducado", "n": 3}
    assert c["caducadoSinPendientes"] == {"tipo": "acceso_caducado", "n": 0}
    assert c["caducadoSinRed"] == {"tipo": "esperando", "n": 2}
    assert c["normal"] == {"tipo": "sincronizando", "n": 3}
    assert "caducado" in c["textos"][0] and "caducou" in c["textos"][1]


def test_un_401_apunta_acceso_caducado_y_un_exito_lo_borra(datos):
    assert datos["acceso"] == [False, True, True, False, False, True, False]


def test_datos_moviles_solo_si_el_navegador_lo_dice(datos):
    assert datos["conexion"] == {"celular": True, "ahorro": True, "wifi": False, "sinApi": False}


def test_marca_de_bajar_al_servidor_por_jugador_y_sin_almacen(datos):
    assert datos["marca"] == [False, True, False, False]
    assert datos["motivos"] == {"noAbrio": True, "otro": False, "vacio": False, "sinAlmacenSinMarca": False}


def test_la_cola_corta_las_tandas_con_error_de_envio_y_marca_el_descenso():
    pack = leer("player", "offline", "missionPack.ts")
    assert "if (resultado.sinRed || resultado.errorDeEnvio) break" in pack
    assert "errorDeEnvio: true" in pack
    assert "notarRespuesta(response.status)" in pack
    assert "notarAccesoCaducado()" in pack and "marcarBajarAlServidor(user)" in pack
    # Sólo un rechazo DEFINITIVO de un node_completed por no abrir marca el descenso.
    assert re.search(r"definitivo && event\.type === 'node_completed' && esRechazoPorNoAbrir\(motivo\)", pack)


def test_el_refresco_baja_al_nivel_del_servidor_con_la_cola_vacia_y_sube_la_cola_aparte():
    h = leer("player", "hooks", "useLatidoYCola.ts")
    assert "hayQueBajarAlServidor(user) && (await contarPendientes(user).catch(() => 1)) === 0" in h
    assert "const permitirBajar = huboReset || bajarAlServidor" in h
    assert "olvidarBajarAlServidor(user)" in h
    # La cola tiene su candado y la hoja abierta no impide subirla.
    assert "let subiendoCola = false" in h
    assert "if (oculto || interactionOpen) return" in h
    assert "if (interactionOpen || submitting) return" not in h


def test_las_fotos_del_paquete_tienen_limite_de_tiempo_y_el_paquete_crece_en_cada_reintento():
    s = leer("player", "offline", "missionSync.ts")
    assert "new AbortController()" in s and "20_000" in s and "signal: control.signal" in s
    a = leer("shared", "api.ts")
    assert "15_000 * (1 + Math.min(intentosCortadosSeguidos, 3))" in a
    assert "intentosCortadosSeguidos = 0" in a
    # Renovar el pase en mitad de un avance NO navega a la portada del PIN.
    assert "{ fotosPorUrl: true, sinRedirigir: true }" in a
    assert re.search(r"!options\.sinRedirigir &&\s*res\.status === 403", a)


def test_service_worker_cuota_llena_topes_y_sintaxis():
    sw = (RAIZ / "frontend" / "public" / "sw.js").read_text(encoding="utf-8")
    # putCache y putCustomCache no lanzan con la cuota llena.
    assert re.search(r"async function putCache[\s\S]*?try \{[\s\S]*?cache\.put\(request, response\.clone\(\)\)[\s\S]*?\} catch", sw)
    assert re.search(r"async function putCustomCache[\s\S]*?try \{[\s\S]*?cache\.put\(request, response\.clone\(\)\)[\s\S]*?\} catch", sw)
    # El relieve y los edificios con versión tienen tope de 8 s.
    assert re.search(r"async function versionadoPrimero[\s\S]*?fetchWithTimeout\(request, 8000\)", sw)
    assert "esJsonValido, tope: 30000" in sw and "esFotoValida, tope: 30000" in sw
    if NODE:
        assert subprocess.run([NODE, "--check", str(RAIZ / "frontend" / "public" / "sw.js")]).returncode == 0


def test_tienda_ya_la_tienes_es_exito_y_los_errores_de_ahora_se_reintentan():
    d = leer("player", "avatares3d", "mixamo", "desbloqueosTienda.ts")
    assert "cuerpo?.detail === 'ya_la_tienes'" in d
    assert "detalle: 'transitorio'" in d
    assert "actual?.mios?.includes(clave)" in d
    t = leer("player", "avatares3d", "mixamo", "TiendaDeRopa.tsx")
    assert "r.detalle === 'transitorio'" in t and "t.compraReintentar" in t
    x = leer("player", "avatares3d", "mixamo", "textosTienda.ts")
    assert x.count("compraReintentar:") == 2  # es y gl


def test_fotos_de_campo_un_403_solo_borra_si_es_de_sesion():
    u = leer("player", "hooks", "useFotosDeCampo.ts")
    assert "'player session required'" in u and "'unknown player'" in u
    a = leer("shared", "api.ts")
    assert "detail: typeof cuerpo?.detail === 'string' ? cuerpo.detail : undefined" in a


def test_sin_espacio_avisa_en_mochila_y_en_fotos():
    assert "saga:sin-espacio" in leer("player", "offline", "inventory.ts")
    assert "saga:sin-espacio" in leer("player", "PlayerApp.tsx")
    av = leer("player", "components", "AvisosDeDatos.tsx")
    assert "AvisoDeSinEspacio" in av and "sinEspacioTitulo" in av and av.count("sinEspacioPie:") == 2


def test_la_carga_no_ensena_el_texto_tecnico_de_una_excepcion():
    m = leer("player", "offline", "motorDeCarga.ts")
    assert re.search(r"function mensajeDeError\(error: unknown\): string \{\s*console\.warn\('\[carga\]', error\)\s*return ''", m)


def test_avances_pendientes_se_aplican_al_paquete_al_abrir():
    p = leer("player", "offline", "missionPack.ts")
    assert "export async function conAvancesPendientes" in p and "level_after" in p
    assert "guardado.payload = await conAvancesPendientes(user, guardado.payload)" in leer("player", "offline", "cargaCompleta.ts")


# --- optimización -----------------------------------------------------------------------------------------------

def test_los_nodos_ya_no_viven_en_la_capa_three_y_esta_no_repinta_en_vacio():
    # Hallazgo 1 de la auditoría de optimización NO era cierto en la 6.9.0: `dibujarNodos(false)` deja la capa three.js sin
    # piezas de nodo (sólo complementos: los avatares), y sin avatares que pidan fotograma no se programa ningún repintado.
    m = leer("player", "components", "MapSurfaceGL.tsx")
    assert "capaNodos.dibujarNodos(false)" in m
    n = leer("player", "components", "nodosTresD.ts")
    assert "animar && !pausada && !repintadoProgramado && piezas.length > 0" in n


def test_sin_red_cuenta_solo_la_cola_sin_leer_el_paquete():
    u = leer("player", "guia", "useSinRed.ts")
    assert "contarAvancesPendentes" in u and "await getOfflineMissionSummary(" not in u


def test_gzip_no_comprime_modelos_ni_lotes_y_va_a_nivel_6():
    main_py = (RAIZ / "main.py").read_text(encoding="utf-8")
    assert "compresslevel=6" in main_py
    assert '"model/*"' in main_py and '"application/octet-stream"' in main_py
    from fastapi import FastAPI, Response
    from fastapi.middleware.gzip import GZipMiddleware
    from fastapi.testclient import TestClient
    from starlette.middleware.gzip import DEFAULT_EXCLUDED_CONTENT_TYPES

    app = FastAPI()
    app.add_middleware(GZipMiddleware, minimum_size=512, compresslevel=6,
                       exclude_content_types=(*DEFAULT_EXCLUDED_CONTENT_TYPES, "model/*", "application/octet-stream"))
    app.get("/glb")(lambda: Response(b"a" * 5000, media_type="model/gltf-binary"))
    app.get("/lote")(lambda: Response(b"a" * 5000, media_type="application/octet-stream"))
    app.get("/js")(lambda: Response("x" * 5000, media_type="text/javascript"))
    c = TestClient(app)
    cab = {"Accept-Encoding": "gzip"}
    assert c.get("/glb", headers=cab).headers.get("content-encoding") is None
    assert c.get("/lote", headers=cab).headers.get("content-encoding") is None
    assert c.get("/js", headers=cab).headers.get("content-encoding") == "gzip"


def test_la_huella_de_api_game_es_la_misma_que_la_cacheada():
    import main

    stages = main.get_runtime_stages()
    assert main.stages_revision(stages) == main._huella_de_nodos_cacheada()
    assert "main._huella_de_nodos_cacheada()" in (RAIZ / "backend" / "app" / "routers" / "game.py").read_text(encoding="utf-8")


def test_animaciones_infinitas_respetan_reducir_movimiento():
    lay = leer("player", "components", "PlayerLayout.tsx")
    assert "[data-saga-status-card], [data-saga-status-ring] { animation: none !important; }" in lay
    assert ".saga-finish-orb, .saga-finish-card { animation: none !important" in lay
    q = leer("player", "components", "QuickProofPanel.tsx")
    assert "@media (prefers-reduced-motion: reduce)" in q and "translateY(97%)" in q and "top: 2%" not in q
    b = leer("player", "minigames", "families", "bearingHunt", "RuntimeScreen.tsx")
    assert re.search(r"prefers-reduced-motion: reduce\)[^}]*\{[^}]*bh-gate::before \{ animation: none", b)


def test_modo_ahorro_apaga_cristal_y_pausa_latidos():
    css = leer("mobile-themes.css")
    assert re.search(r"html\.saga-ahorro,\s*body\.saga-ahorro \{\s*--theme-blur: none;\s*--saga-latido-estado: paused;", css)
    c = leer("player", "components", "conmutadoresMapa.ts")
    assert "export function aplicarClaseDeAhorro" in c and "classList.toggle('saga-ahorro'" in c
    hud = leer("player", "components", "PlayerHud.tsx")
    assert "getBattery" in hud and "Safari no da la batería" in hud and "Safari non dá a batería" in hud


def test_el_almacen_del_jugador_no_reescribe_lo_igual():
    s = leer("player", "store", "usePlayerStore.ts")
    assert "ultimoTextoEscrito.get(nombre) === valor" in s and "createJSONStorage(() => almacenSinRepeticiones)" in s


def test_paneles_no_se_repintan_si_la_mochila_no_cambio():
    for f in ("InventoryPanel.tsx", "CraftingPanel.tsx"):
        assert "JSON.stringify(previo) === JSON.stringify(siguiente) ? previo : siguiente" in leer("player", "components", f)


def test_puente_de_idioma_indexado_y_con_memoria():
    b = leer("i18n", "legacySpanishBridge.ts")
    assert "function buscarSinCaja" in b and "memoriaDeTraduccion" in b and "MEMORIA_DE_TRADUCCION_MAXIMA" in b
    assert "Object.entries(GL).find" not in b and "Object.entries(ES).find" not in b
