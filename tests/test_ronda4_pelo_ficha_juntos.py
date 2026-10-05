# -*- coding: utf-8 -*-
"""Ronda 5.49: pelo sin dientes, ficha del jugador, avatares juntos sincronizados y vestuario desbloqueable en la tienda.

Lo que se ve en un navegador está en scratchpad/vista/r4_* (pelo antes/después, ficha en 390×844 y 375×667 con
muesca, en vivo y sin conexión, r4_ficha.mp4, y r4_juntos_* con 2, 5 y 15 jugadores y uno detrás de ti). Aquí, la
lógica pura (en Node) y las piezas de código de las que depende.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src" / "player"
MIXAMO = SRC / "avatares3d" / "mixamo"
BANCO = RAIZ / "sim" / "playwright-bench" / "harness" / "mixamo4"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (FRONT / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "ronda4.cjs")],
                       capture_output=True, text=True, timeout=120, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


# ---------------------------------------------------------------- 1. pelo

def test_el_pelo_tiene_borde_suave_y_conserva_los_mechones_lejos():
    look = leer(BANCO / "look.js")
    # Alfa de los mips lejanos reescalado (los rizos y la barba ya no desaparecen a puntitos).
    assert "textureSize(map, 0)" in look and "log2(" in look and "* 0.25" in look
    # Con multimuestreo: alfa afilado a un píxel y a la cobertura.
    assert "#ifdef RC_A2C" in look and "fwidth(a)" in look and "m.alphaToCoverage = !!a2c" in look
    # Sin él: corte duro y opaco (nunca translúcido).
    assert "if (a < corte || rcVer < 0.5) discard;" in look and "diffuseColor.a = 1.0;" in look
    # Pasada de transparentes pero escribiendo profundidad, color sustituido y alfa sumado (la cara no transparenta).
    assert "m.transparent = true; m.depthWrite = true" in look
    assert "m.blendSrc = THREE.OneFactor; m.blendDst = THREE.ZeroFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneFactor" in look
    # El recorte bajo el tocado ya no es un corte en escalera: se funde en un píxel.
    assert "rcVer = 1.0 - k1 * k2;" in look and "fwidth(s1)" in look and "fwidth(s2)" in look
    # Pelo, barba, cejas y pestañas.
    av = leer(BANCO / "avatar.js")
    assert "if (p.role === 'hair' || p.role === 'lash') suavizar(p.mat, opts.a2c !== false)" in av


def test_el_motor_de_la_app_esta_regenerado_con_el_pelo_nuevo():
    for nombre, fuente in (("look.ts", "look.js"), ("avatar.ts", "avatar.js")):
        generado = leer(MIXAMO / "motor" / nombre)
        assert "GENERADO por frontend/scripts/portar-motor-mixamo.mjs" in generado
        assert ("export function suavizar" in generado) if nombre == "look.ts" else ("suavizar(p.mat" in generado)


def test_cada_destino_dice_si_tiene_multimuestreo():
    av = leer(MIXAMO / "avatar.ts")
    assert "{ fija, a2c: multimuestreo }" in av
    tienda = leer(MIXAMO / "escenaTienda.ts")
    assert "crearAvatarTienda(a, r.getContextAttributes()?.antialias !== false)" in tienda
    # El mapa pinta en un objetivo con 4-8 muestras: siempre con multimuestreo.
    nodos = leer(SRC / "components" / "nodosTresD.ts")
    assert "Math.max(4, Math.min(8," in nodos


# ---------------------------------------------------------------- 2. ficha

def test_la_ficha_calcula_conexion_nodos_y_tiempo(js):
    f = js["ficha"]
    assert f["vivo"]["conexion"] == {"tipo": "vivo"} and f["vivo"]["hechos"] == 3 and f["vivo"]["total"] == 6
    assert f["reciente"]["conexion"] == {"tipo": "reciente", "minutos": 7}
    assert f["sin"]["conexion"] == {"tipo": "sin", "minutos": 125}
    assert f["sinUltimaVez"]["conexion"] == {"tipo": "sin", "minutos": None}
    assert f["terminado"]["hechos"] == 6 and f["terminado"]["terminado"] is True
    assert f["totalDeMision"]["total"] == 5 and f["totalDeMision"]["hechos"] == 5, "sin total del jugador, el de la misión"
    assert f["tiempos"] == ["0:00", "1:01", "47:12", "1:02:05"]
    es, gl, en = f["textos"]
    assert es[0] == "En vivo" and es[1] == "Hace 7 min" and es[3] == "Sin conexión" and "visto hace 2 h" in es[2]
    assert gl[0] == "En directo" and gl[1] == "Hai 7 min" and en[0] == "Live" and en[1] == "7 min ago"
    assert f["idiomas"] == ["es", "gl", "en", "es", "es"] and f["mismasClaves"] is True
    assert f["saludar"] == "ge__salute"


def test_la_ficha_usa_un_solo_contexto_que_se_suelta_y_la_foto_con_su_puerta():
    ficha = leer(MIXAMO / "FichaDeJugador.tsx")
    assert "crearEscenaDeTienda(escenario," in ficha and "escenaRef.current?.destruir()" in ficha
    assert "permitirRed: false" in ficha, "sin cobertura, el muñeco sale de la caché (nunca de la red)"
    assert "getPlayerAvatarUrl(jugador)" in ficha and "urlDeFotoValida(fotoUrl)" in ficha
    assert "useAreaVisible()" in ficha and "createPortal(" in ficha
    assert "window.setTimeout(despues, DURACION_FICHA_MS)" in ficha, "sale con su animación antes de desmontarse"
    css = leer(MIXAMO / "ficha.css")
    assert "env(safe-area-inset-bottom" in css and "var(--saga-dur-larga" in css and "prefers-reduced-motion" in css
    escena = leer(MIXAMO / "escenaTienda.ts")
    assert "r.forceContextLoss()" in escena


def test_tocar_a_alguien_abre_la_ficha_y_tocarte_sigue_abriendo_tu_menu():
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "if (el.tipo === 'jugador') {" in mapa and "setFichaDe(el.clave)" in mapa
    assert "if (clave === CLAVE_YO) {" in mapa and "new CustomEvent(EVENTO_MENU_DE_GESTOS)" in mapa
    # Saludar = un gesto de TU avatar por el mismo camino que el menú; Ir a él deja de seguirte y centra.
    assert "new CustomEvent(EVENTO_GESTO, { detail: GESTO_SALUDAR })" in mapa
    assert "onUserMapMoveRef.current?.()" in mapa and "mapa.easeTo({ center: [p.lon, p.lat]" in mapa
    # Su código ya en memoria antes de tocar a nadie, y si no llega no rompe el mapa.
    assert "void cargarFicha().catch(() => undefined)" in mapa and "() => ({ default: FichaNoDisponible })" in mapa


def test_la_ficha_no_comparte_hoja_de_estilo_con_la_tienda():
    """Si dos trozos importan la misma hoja, Vite la saca a un trozo propio que la lista de la caché sin
    cobertura pedía y no existía (pantalla de carga atascada en «Faltan 1 archivos»)."""
    ficha = leer(MIXAMO / "FichaDeJugador.tsx")
    assert "import './ficha.css'" in ficha and "tienda.css" not in ficha
    importan = [p.name for p in SRC.rglob("*.tsx") if "ficha.css" in leer(p)]
    assert importan == ["FichaDeJugador.tsx"]


def test_el_progreso_de_cada_companero_llega_al_mapa(js):
    m = js["marcadores"][0]
    assert m["level"] == 4 and m["total_nodes"] == 6 and m["total_time_ms"] == 1234 and m["members"] == ["a", "b"]


# ---------------------------------------------------------------- 3. juntos y sincronizados

def test_el_paso_a_retrato_es_solo_cosa_del_zoom_y_del_tope(js):
    l = js["lod"]
    assert l["alta"][0] == "yo" and len(l["alta"]) == 11  # tú + el tope (tu plaza no cuenta)
    assert l["media"] == 6 and l["baja"] == 3
    assert l["mismoSitio"] == ["yo", "detras"], "el de detrás de ti ya no se queda en retrato tapado"
    assert l["permite"] == [False, True, True, False]
    assert l["tamano"] == [0.8, 1.12, 1.424, 1.9, 1.9], "la curva de TAMANO_JUGADOR del mapa"
    assert l["salida"] == [1, 0.5, 0, 0]
    lod = leer(MIXAMO / "lodAvatares.ts")
    assert "SolapeEnPantalla" not in lod


def test_cuerpo_retrato_aro_y_aura_cambian_en_el_mismo_fotograma():
    capa = leer(MIXAMO / "capaAvatares.ts")
    # El cuerpo sigue lo publicado: entra un fotograma después de pedirlo, sale un fotograma después.
    assert "if (!saliendo && !enTresD.has(e.clave)) {" in capa
    assert "opciones.alCambiar(enTresD)" in capa and "opciones.pedirFotograma()" in capa
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "promoteId: 'fid'" in mapa and "sincronizarTresDRef.current()" in mapa
    movil = mapa[mapa.index("const dibujarMovil = useCallback"):]
    movil = movil[: movil.index("El bucle del deslizamiento")]
    assert "enTresDRef" not in movil, "los datos ya no cambian al pasar a 3D: sólo el estado del punto"


def test_los_que_caen_juntos_se_abren_en_corro_tambien_en_3d():
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "ctx.mapa.unproject([px, py])" in capa and "hueco[0] * tamanoIcono" in capa
    assert "new THREE.Line(" in capa, "línea fina al punto real"
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "hueco: h > 0 ? desplazamientoDeHueco(h) : null" in mapa
    jm = leer(SRC / "components" / "jugadoresEnMapa.ts")
    assert "zoom < ZOOM_MINIMO_AVATARES" in jm, "desde el zoom del 3D nadie se funde en un grupo"


def test_aparecer_crece_irse_encoge_y_pasar_de_retrato_no_salta():
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "ctx.ahora - e.creadaEn < 1500" in capa, "sólo crece quien acaba de llegar"
    assert "factorDeSalida(ctx.ahora - e.saleEn)" in capa and "SALIDA_MS" in capa


# ---------------------------------------------------------------- 4. vestuario desbloqueable

def test_candados_pistas_y_progreso(js):
    d = js["desbloqueos"]
    # casco, ropa 9, pelo 7, aplaudir: bloqueados. gaita: ya es mía. Personajes: nunca. ropa 0: libre.
    assert d["bloqueadas"] == [True, True, True, True, False, False, False]
    assert d["apagado"] is False and d["sinDatos"] is False, "sin desbloqueos activos, ni un candado"
    assert d["aQuitar"] == ["ropa:9", "hair:7", "item:casco"] and d["aQuitarApagado"] == []
    assert d["progresoCasco"] == {"actual": 4, "meta": 5, "fraccion": 0.8}, "la regla con más avance"
    assert d["progresoSinRegla"] is None
    assert d["pista"] == "Se consigue: completa 3 nodos"
    assert d["nombres"][0] == "Casco vikingo" and d["nombres"][3] == "Aplaudir"
    assert d["invalido"] == [None, None, None, None]
    assert js["copia"] == {"leida": 3, "otra": None}


def test_la_tienda_deja_probar_pero_no_guardar_lo_bloqueado():
    tienda = leer(MIXAMO / "TiendaDeRopa.tsx")
    assert "const sinGanar = bloqueadasDeAspecto(aspecto, desbloqueos)" in tienda
    assert "disabled={guardando || tomado || sinGanar.length > 0}" in tienda
    assert "t.quitaParaGuardar(" in tienda
    gestor = leer(SRC / "avatares" / "GestorDePersonaje.tsx")
    assert "leerCopia(usuario)" in gestor and "pedirDesbloqueos(usuario)" in gestor
    assert "t.bloqueadoTrasGuardar : t.ocupadoTrasGuardar" in gestor, "un 409 por candado no se confunde con «ocupado»"
    menu = leer(MIXAMO / "MenuDeGestos.tsx")
    assert "disabled={estaBloqueada(d, claveGesto(g.clip))}" in menu


def test_el_aviso_de_desbloqueado_espera_al_mapa_libre():
    aviso = leer(MIXAMO / "AvisoDeDesbloqueo.tsx")
    assert "export function mapaLibre()" in aviso and "mapaCubierto()" in aviso
    assert ".saga-tienda, .saga-gestos, .saga-ficha" in aviso
    assert "marcarVisto(usuario, { avisos:" in aviso
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "<AvisoDeDesbloqueo" in mapa


def test_el_aspecto_por_defecto_solo_sale_del_kit_libre(js):
    d = js["defecto"]
    assert d["todosLibres"] is True and d["variados"] >= 10
    from backend.app.runtime import desbloqueables_catalogo as cat
    assert list(cat.ROPA_LIBRE) == d["ropaLibre"] and list(cat.PELO_LIBRE) == d["peloLibre"]
