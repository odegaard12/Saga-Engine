# -*- coding: utf-8 -*-
"""14/11 (auditoría de juegos, partidas, entrada y antifallos): el reloj del nodo con el almacenamiento lleno, las fronteras
de error con salida, las piezas diferidas que no bajan, Trampa (pausa y partida terminada), el mosaico, Faros, el permiso
de movimiento, el 403 con motivo, el perfil que ya no existe y la forma mínima de los datos del servidor.
Pruebas de las piezas puras y de api.ts con un `fetch` falso (JS) y de texto sobre lo que necesita un navegador."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"
NODE = shutil.which("node")


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    if not NODE:
        pytest.skip("sin node")
    p = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "partidas_14_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


# --- 14: reloj del nodo ---------------------------------------------------------------------------------------------

def test_el_reloj_del_nodo_sigue_con_el_almacenamiento_lleno(datos):
    r = datos["reloj"]["lleno"]
    # Antes: `leer` devolvía 0, el nodo contaba 00:00 y `arrancarReloj` volvía a encolar `node_opened` cada vez.
    assert r["antes"] is False and r["abierto"] is True and r["tiempo"] == 5000
    assert r["otroNodo"] is False and r["cerrado"] is False and r["trasLimpiar"] is False
    assert datos["reloj"]["normal"] == {**r}


# --- 2: salida de las fronteras ---------------------------------------------------------------------------------------

def test_borrar_partidas_guardadas_solo_toca_las_de_minijuego(datos):
    b = datos["borrar"]
    assert b["borradas"] == 2 and b["sinAlmacen"] == 0
    # El reloj del nodo (y cualquier otra cosa) se queda: no se regala tiempo ni se pierde progreso.
    assert b["quedan"] == ["otra", "saga:nodo-abierto:ana:n1"]


def test_fallos_seguidos_y_confirmacion_nominal(datos):
    s = datos["seguidos"]
    assert (s["primero"], s["segundo"], s["tercero"], s["pasadaLaVentana"]) == (1, 2, 3, 1)
    assert s["palabra"] == [True, True, True, False, False, False]


def test_las_fronteras_ofrecen_cerrar_y_borrar_tras_el_segundo_fallo():
    f = leer("shared", "FronteraLocal.tsx")
    assert "fallosSeguidos(previo.seguidos, anterior, ahora)" in f and "const anterior = this.ultimoFalloEn" in f
    assert "this.props.respaldo(this.reiniciar, this.state.seguidos)" in f
    # El minijuego: reintentar, cerrar y volver al mapa, y a partir del segundo fallo seguido, borrar.
    i = leer("player", "components", "InteractionSheet.tsx")
    assert "respaldo={(reiniciar, seguidos) =>" in i and "onClick={onClose}" in i
    assert "{seguidos >= 2 ? <BorrarPartidasLocales /> : null}" in i
    d = leer("player", "components", "panelesDiferidos.tsx")
    assert "respaldo={(reiniciar, seguidos) => {" in d and "{seguidos >= 2 ? <BorrarPartidasLocales /> : null}" in d
    assert "Esta pantalla no se pudo mostrar." not in d  # ya sale de los textos (es y gl)
    b = leer("shared", "BorrarPartidasLocales.tsx")
    assert "palabraConfirmada(escrito, t.palabra)" in b and "borrarPartidasGuardadas()" in b
    # El boundary global se queda en main.tsx.
    assert "ErrorBoundary" in leer("main.tsx")


def test_textos_de_las_fronteras_en_castellano_y_gallego():
    t = leer("player", "components", "textosDePantallas.ts")
    for clave in ("borrarAviso:", "cerrarYMapa:", "piezaPerdidaTitulo:", "perfilNoExisteTitulo:", "perfilNoExisteCuerpo:"):
        assert t.count(clave) == 2, clave  # es y gl, nunca inglés
    assert t.count("palabra: 'BORRAR'") == 2


# --- 5: piezas diferidas ----------------------------------------------------------------------------------------------

def test_la_pieza_que_no_baja_deja_de_insistir_y_ofrece_recargar():
    z = leer("shared", "lazySeguro.tsx")
    assert "export const MAX_FALLOS = 2" in z
    assert "fallos < MAX_FALLOS ? window.setInterval(intentar, 30_000) : undefined" in z
    assert "fallos >= MAX_FALLOS ? <AvisoDePiezaPerdida /> : null" in z
    assert "onClick={() => window.location.reload()}" in z and "t.piezaPerdidaTitulo" in z and "t.recargar" in z
    assert "window.addEventListener('online', intentar)" in z  # al volver la red, un intento más


# --- 9, 11, 12, 13: juegos ------------------------------------------------------------------------------------------------

def test_mosaico_rearma_la_vista_previa_con_cada_intento():
    m = leer("player", "minigames", "families", "placeMosaic", "RuntimeScreen.tsx")
    assert "const [intento, setIntento] = useState(0)" in m
    assert "setIntento((n) => n + 1)" in m
    assert "}, [phase, previewKind, previewMs, intento])" in m


def test_faros_borra_las_marcas_al_ocultarse():
    f = leer("player", "minigames", "families", "bearingHunt", "FarosRuntimeScreen.tsx")
    assert re.search(
        r"alOcultarse = \(\) => \{\s*if \(document\.visibilityState !== 'hidden'\) return\s*sujetoDesdeRef\.current = null\s*"
        r"barcoDesdeRef\.current = barcos\.map\(\(\) => 0\)",
        f,
    )
    assert "document.addEventListener('visibilitychange', alOcultarse)" in f


def test_trampa_se_pausa_con_la_pagina_oculta_y_declara_sin_reto(datos):
    assert datos["ronda"] == {"fuera5s": 6000, "sinSalto": 1000}
    w = leer("player", "minigames", "families", "wordTrap", "RuntimeScreen.tsx")
    assert "inicioRef.current = descontarTiempoOculto(inicioRef.current, ocultoDesde, Date.now())" in w
    assert "const elapsed = Date.now() - inicioRef.current" in w and "const startedAt = inicioRef.current" not in w
    assert "useSinRetoEnPantalla(revealed || !round)" in w
    # La pausa se guarda: recargar tras volver no devuelve el tiempo que ya se pausó.
    assert "guardarInicioDeRonda" in w and "inicio: inicioRondaRef.current" in w


def test_trampa_reabierta_con_la_ultima_ronda_contestada_no_la_repite():
    w = leer("player", "minigames", "families", "wordTrap", "RuntimeScreen.tsx")
    assert "terminado?: boolean" in w
    assert "terminado: roundIndex + 1 >= baseRounds.length + extrasRef.current," in w
    assert "useRef(guardada?.terminado ? rondaInicial : -1)" in w
    assert re.search(r"if \(!guardada\?\.terminado \|\| finishingRef\.current\) return\s*finishingRef\.current = true\s*"
                     r"partidas\.delete\(claveNodo\)", w)
    assert "void onWin(guardada.penalty)" in w and "if (guardada?.terminado) return" in w


# --- 15: permiso de movimiento ------------------------------------------------------------------------------------------------

def test_el_permiso_de_movimiento_se_pide_en_click_o_touchend():
    p = leer("player", "hooks", "usePermisos.ts")
    assert "window.addEventListener('click', alPrimerToque)" in p and "window.addEventListener('touchend', alPrimerToque)" in p
    assert "'pointerdown'" not in re.sub(r"//.*", "", p).replace("`pointerdown`", "")


# --- 17 y 3: 403 con motivo ------------------------------------------------------------------------------------------------------

def test_403_player_session_required_pide_el_pin_sin_depender_de_la_cache(datos):
    a = datos["api"]
    assert a["sesionSinCache"]["reemplazos"] == ["/?pin=ana"]
    assert a["sesionConCache"]["reemplazos"] == ["/?pin=ana"]
    # Quien renueva el pase en mitad de un avance no navega.
    assert a["sesionSinRedirigir"]["reemplazos"] == []
    # Sin motivo, como antes: solo si la configuración en caché dice que hay PIN.
    assert a["sinMotivoConCache"]["reemplazos"] == ["/?pin=ana"] and a["sinMotivoSinCache"]["reemplazos"] == []


def test_unknown_player_no_manda_al_pin_y_marca_el_perfil_inexistente(datos):
    d = datos["api"]["desconocido"]
    assert d["reemplazos"] == [] and d["perfilNoExiste"] is True
    assert d["error"]["status"] == 403 and d["error"]["detail"] == "unknown player"
    c = datos["chip"]
    assert c["perfil"] == {"tipo": "perfil_inexistente", "n": 2}
    assert c["perfilYAcceso"]["tipo"] == "perfil_inexistente" and c["acceso"]["tipo"] == "acceso_caducado"
    assert c["perfilSinRed"]["tipo"] == "esperando"  # sin red manda «sin cobertura»
    assert c["estados"] == [[False, False], [True, False], [False, False]]
    assert "perfil ya no existe" in c["textos"][0] and "perfil xa non existe" in c["textos"][1]
    sync = leer("player", "offline", "missionPack.ts")
    assert "if (detalle === 'unknown player') notarPerfilNoExiste()" in sync and "else notarAccesoCaducado()" in sync
    # La pantalla de carga lo dice en vez de «no hay cobertura».
    assert "perfilNoExiste: true" in leer("player", "hooks", "useCargaDeMision.ts")
    assert "state.perfilNoExiste ? TU.carga.perfilNoExisteTitulo" in leer("player", "PlayerApp.tsx")


# --- 23: forma de los datos -------------------------------------------------------------------------------------------------------------

def test_la_forma_minima_de_la_partida_y_de_la_configuracion(datos):
    f = datos["forma"]
    assert f["partida"] == [True, True] + [False] * 9
    assert f["config"] == [True, True, False, False, False, False]


def test_un_200_con_otra_forma_es_un_error_de_red_y_no_se_guarda(datos):
    a = datos["api"]
    for caso in ("cuerpoVacio", "cuerpoLista"):
        e = a[caso]["error"]
        # Sin `status` = error de red: no cuenta como «el servidor contestó».
        assert e["sinStatus"] is True and e["redDeFallo"] is True and a[caso]["ok"] is None
    assert a["cuerpoBueno"]["ok"] == "ana"
    assert a["configVacia"]["ok"] is False and a["configLista"]["ok"] is False and a["configBuena"]["ok"] is True
    p = leer("player", "offline", "missionPack.ts")
    # Ni se sobrescribe el paquete bueno con una forma rara, ni se pinta uno guardado así.
    assert re.search(r"if \(!esPartidaValida\(args\.payload\)\) throw new Error\('Mission pack not saved", p)
    assert "if (pack && !esPartidaValida(pack.payload))" in p
