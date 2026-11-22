# -*- coding: utf-8 -*-
"""22/11 «pendientes pequeños»: brújula sin GPS fresco, salidas fundidas de los minijuegos, relleno del Relevo, Mosaico
sin saltos, zonas de toque de 44, el pelo no va con la ropa (ver test_avatares_mixamo) y el nombre del nodo fundido.
Leen el código fuente, como el resto de la suite."""
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "frontend" / "src"
JUEGOS = SRC / "player" / "minigames" / "families"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def test_la_brujula_espera_a_un_punto_fresco_de_esta_sesion():
    app = leer(SRC / "player" / "PlayerApp.tsx")
    i = app.index("<BrujulaMini")
    bloque = app[i:app.index("/>", i)]
    assert "posicion={ultimaPosicionViva ? displayPosition : null}" in bloque
    # `ultimaPosicionViva` sólo nace de `playerPosition`, que exige GPS fresco (45 s) o depuración.
    assert "const playerPosition = localDebugPosition || (browserGpsFresh ? browserGpsPosition : null)" in app
    assert "setUltimaPosicionViva({ lat: playerPosition.lat, lon: playerPosition.lon })" in app


def test_las_pantallas_de_los_minijuegos_salen_fundidas_sin_esperar_al_juego():
    mov = leer(SRC / "player" / "ui" / "movimiento.ts")
    cuerpo = mov.split("export function useSalidaDePantalla")[1]
    assert "saga-pantalla-sale" in cuerpo and "cloneElement(viejo" in cuerpo
    assert "reducido ? SALIDA_DE_PANTALLA_REDUCIDA_MS : SALIDA_DE_PANTALLA_MS" in cuerpo
    assert "export const SALIDA_DE_PANTALLA_MS = 180" in mov and "export const SALIDA_DE_PANTALLA_REDUCIDA_MS = 120" in mov
    css = leer(SRC / "mobile-themes.css")
    regla = css.split(".saga-pantalla-sale {")[1].split("}")[0]
    assert "sagaPantallaSale var(--saga-dur-rapida)" in regla and "pointer-events: none" in regla
    # Los mismos tiempos que el CSS: 180 ms, y 120 con «reducir movimiento».
    assert "--saga-dur-rapida: 180ms;" in css and "--saga-dur-rapida: var(--saga-dur-reducida);" in css
    assert "--saga-dur-reducida: 120ms;" in css
    mosaico = leer(JUEGOS / "placeMosaic" / "RuntimeScreen.tsx")
    assert "return useSalidaDePantalla(phase, pantallaDelMosaico())" in mosaico
    # onWin sigue en el botón de continuar, no detrás de la animación.
    assert "const superado = await onWin(penaltyPreguntaRef.current || undefined)" in mosaico
    trampa = leer(JUEGOS / "wordTrap" / "RuntimeScreen.tsx")
    for nombre in ("rondaVista", "explicacionVista", "avisoVisto"):
        assert f"const {nombre} = useSalidaDePantalla(\n    roundIndex," in trampa and "{" + nombre + "}" in trampa
    # Los hooks van antes de la salida temprana de «preparando».
    assert trampa.index("const rondaVista = useSalidaDePantalla") < trampa.index("if (!round) {")


def test_el_relevo_se_llena_mientras_se_mantiene():
    s = leer(JUEGOS / "teamRelay" / "RuntimeScreen.tsx")
    assert "const DURACION_MS = 1500" in s and "}, DURACION_MS)" in s
    assert "transform: `scaleX(${holding ? 1 : 0})`" in s
    assert "transition: holding ? `transform ${DURACION_MS}ms linear` : 'none'" in s  # se vacía de golpe al soltar
    # Reducir movimiento: sin animación, a saltos de un tercio cada medio segundo.
    assert "usePrefiereMenosMovimiento()" in s
    assert "transform: `scaleX(${paso / PASOS})`, transition: 'none'" in s
    assert "if (!holding || !reducido) return undefined" in s and "setPaso(0)" in s
    assert '<span data-relevo-relleno="" aria-hidden="true" style={relleno} />' in s
    assert "overflow: 'hidden'" in s.split("const holdButtonReady")[1][:200]


def test_el_mosaico_reserva_el_hueco_de_soltar_y_no_repite_el_aviso():
    s = leer(JUEGOS / "placeMosaic" / "RuntimeScreen.tsx")
    assert "{girarPiezas && phase === 'playing' ? (" in s
    assert "style={selected === null ? { visibility: 'hidden' } : undefined}" in s
    assert "t.piezaSeleccionada" not in s
    assert "piezaSeleccionada:" not in leer(SRC / "player" / "minigames" / "core" / "textos.ts")
    # La ayuda de debajo del tablero sigue diciéndolo.
    assert "{selected === null ? t.tocaUnaPieza : t.ahoraTocaOtra}" in s


def test_zonas_de_toque_de_44_en_el_jugador():
    hoja = leer(SRC / "player" / "components" / "InteractionSheet.tsx")
    assert 'className="mg-btn mg-btn-ayuda saga-toque"' in hoja
    assert 'className="mg-btn mg-btn-cerrar saga-toque saga-toque-cierre"' in hoja
    assert 'className="mg-respaldo-boton saga-toque"' in hoja
    assert hoja.count('className="saga-toque" style={reintentarEnvioBoton}') == 3
    comp = SRC / "player" / "components"
    assert leer(comp / "AvisosDeDatos.tsx").count('className="saga-toque"') >= 4
    assert 'className="saga-toque" style={deleteButton}' in leer(comp / "FieldPhotoViewer.tsx")
    assert 'className="saga-toque" style={boton} onClick={onOpenDownload}' in leer(comp / "MissionLockScreen.tsx")
    assert 'className="saga-toque"\n        style={botonAviso}' in leer(comp / "TiempoDelJuego.tsx")
    assert 'role="tab"\n                className="saga-toque"' in leer(comp / "CraftingPanel.tsx")
    assert "'saga-popup-cerrar saga-toque saga-toque-cierre'" in leer(comp / "jugadoresEnMapa.ts")
    hud = leer(comp / "PlayerHud.tsx")
    assert hud.count("minHeight: 44, // 22/11:") == 3
    tienda = leer(SRC / "player" / "avatares3d" / "mixamo" / "tienda.css")
    assert ".saga-gestos-x::after {" in tienda and ".saga-tienda-vitrina .saga-tienda-pestana::after {" in tienda
    assert "min-height: 44px; /* 22/11" in tienda
    # La capa invisible común sigue siendo la de 44.
    assert "top: min(0px, calc((100% - 44px) / 2));" in leer(SRC / "mobile-themes.css")


def test_el_nombre_del_nodo_se_funde_al_cambiar_sin_mover_la_fila():
    s = leer(SRC / "player" / "components" / "PlayerShell.tsx")
    assert "if (nombres.actual !== stageName) setNombres({ actual: stageName, saliente: nombres.actual })" in s
    assert "className={nombres.saliente !== null ? 'saga-nodo-entra' : undefined}" in s
    assert 'className="saga-nodo-sale" style={nodoSaliente}' in s
    saliente = s.split("const nodoSaliente: CSSProperties = {")[1].split("}")[0]
    assert "position: 'absolute'" in saliente and "inset: 0" in saliente  # no ocupa sitio: la fila no salta
    assert "position: 'relative'" in s.split("const nodoEnLinea: CSSProperties = {")[1].split("}")[0]
    css = leer(SRC / "player" / "components" / "map-surface.css")
    bloque = css.split("@keyframes saga-nodo-entra")[1][:700]
    assert "opacity: 0" in bloque and "transform" not in bloque and "infinite" not in bloque
    assert "html.saga-ahorro .saga-nodo-entra" in bloque
