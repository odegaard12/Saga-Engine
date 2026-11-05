# -*- coding: utf-8 -*-
"""4/11/2026 (tras la 6.2.4): las propuestas de la revisión de transiciones, hechas.

- Herramientas saltaba al abrirse: el bloque del juego offline se carga después y empujaba lo de debajo.
- La tienda decía «Sin cobertura» con red cuando el servidor sólo tardaba.
- Trampa de palabras: la opción fallada no tenía animación de fallo.
- Cada hoja (Mochila, Herramientas, clasificación) movía la franja de abajo 52 px al abrirse y al cerrarse.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


def test_herramientas_reserva_el_hueco_del_juego_offline():
    hud = leer("components/PlayerHud.tsx")
    i = hud.index("<MissionPackPanel")
    assert '<Suspense fallback={<div style={{ minHeight: 139 }} aria-hidden="true" />}>' in hud[i - 300 : i]


def test_sin_cobertura_solo_sin_red_no_con_el_servidor_lento():
    g = leer("avatares/GestorDePersonaje.tsx")
    assert "return enLinea === false || error instanceof TypeError" in g
    assert "if (esFaltaDeRed(error)) setSinCobertura(true)" in g
    # El corte por tiempo de fetchEstadoPersonaje (2,5 s) es un AbortError, no un TypeError: no avisa.
    api = (SRC.parent / "shared" / "api.ts").read_text(encoding="utf-8")
    assert "export async function fetchEstadoPersonaje(user: string, timeoutMs = 2500)" in api
    assert "signal: timeout.signal" in api.split("export async function fetchEstadoPersonaje", 1)[1][:400]


def test_trampa_sacude_la_opcion_fallada_salvo_con_reducir_movimiento():
    w = leer("minigames/families/wordTrap/RuntimeScreen.tsx")
    assert "animation: wtp-sacude .38s" in w and "@keyframes wtp-sacude" in w
    assert ".wtp-option.wtp-option-incorrect { animation: none; }" in w


def test_la_fila_del_mapa_se_atenua_en_vez_de_quitarse():
    app = leer("PlayerApp.tsx")
    assert "const filaRapidaAtenuada = activePanel === 'details' || toolsOpen || rankingOpen" in app
    assert "{!interactionOpen && !overlayState ? (" in app
    assert "...(filaRapidaAtenuada ? { opacity: 0, pointerEvents: 'none' as const } : null)," in app
