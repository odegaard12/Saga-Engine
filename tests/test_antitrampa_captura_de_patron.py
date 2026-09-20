# -*- coding: utf-8 -*-
"""Captura el patrón, sal de la app, resuélvelo con calma: el hueco real.

Los minijuegos de patrón -circuitMatrix, sequenceCode, tiltMaze,
placeMosaic- enseñan algo que hay que memorizar. Sin nada que detecte
salir de la app a media partida, la trampa es trivial: una captura de
pantalla y resolverlo sin presión, fuera del juego.

`useRegenerarAoOcultar` (frontend/src/player/minigames/core/) es el
mecanismo compartido: escucha `visibilitychange` y, si la fase activa es
una en la que hay algo que memorizar, dispara un callback que cada juego
decide -reshuffle si el patrón es aleatorio por partida, o "cuenta como
fallo" si el patrón es fijo a propósito (sequenceCode)-.

Esta prueba no abre un navegador: comprueba que las cuatro pantallas
importan y LLAMAN al hook con la fase correcta, y que el hook en sí no
dispara con la pestaña visible -solo con `document.hidden`-.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CORE = RAIZ / "frontend" / "src" / "player" / "minigames" / "core" / "useRegenerarAoOcultar.ts"
FAMILIAS = RAIZ / "frontend" / "src" / "player" / "minigames" / "families"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def test_o_hook_so_dispara_con_a_pestana_oculta():
    codigo = leer(CORE)
    assert "visibilitychange" in codigo, "el hook no escucha visibilitychange"
    assert "document.visibilityState === 'hidden'" in codigo, (
        "el hook tiene que comprobar 'hidden' explícitamente -sin esto dispararía "
        "también al VOLVER visible, que es la fase que hay que dejar en paz-"
    )


def test_o_hook_desactiva_o_listener_se_non_esta_activo():
    codigo = leer(CORE)
    # `activo` tiene que decidir si el efecto engancha el listener siquiera:
    # sin esto, salir en la pantalla de reglas (antes de Comenzar) también
    # penalizaría, y no hay nada que memorizar ahí todavía.
    assert "if (!activo) return undefined" in codigo, (
        "el hook no respeta la bandera 'activo': penalizaría salir en cualquier "
        "pantalla, no solo mientras hay un patrón visible"
    )


CASOS = {
    "circuitMatrix/RuntimeScreen.tsx": {
        "fases": ["'preview'", "'playing'"],
        "razon": "reset",  # llama a reset(), que SÍ puede regenerar el patrón
    },
    "sequenceCode/SimonRuntimeScreen.tsx": {
        "fases": ["'showing'", "'input'"],
        "razon": "setPhase('failed')",  # cuenta como fallo, NO regenera -patrón fijo a propósito
    },
    "tiltMaze/RuntimeScreen.tsx": {
        "fases": ["'playing'"],
        "razon": "setPhase('failed')",
    },
    "placeMosaic/RuntimeScreen.tsx": {
        "fases": ["'preview'", "'playing'"],
        "razon": "reset(true)",
    },
}


def test_as_catro_pantallas_de_patron_usan_o_hook():
    for ruta_relativa, esperado in CASOS.items():
        ruta = FAMILIAS / ruta_relativa
        codigo = leer(ruta)

        assert "useRegenerarAoOcultar" in codigo, (
            f"{ruta_relativa} no importa/usa el antitrampas de captura"
        )
        assert "import { useRegenerarAoOcultar } from '../../core/useRegenerarAoOcultar'" in codigo, (
            f"{ruta_relativa}: el import no viene del sitio compartido -¿se copió el hook "
            "a mano en vez de importarlo?"
        )

        llamada_idx = codigo.index("useRegenerarAoOcultar(")
        # La llamada entera puede partirse en varias lineas; miramos hasta el
        # cierre del useCallback/parentesis mas cercano con margen suficiente.
        fragmento = codigo[llamada_idx : llamada_idx + 400]

        for fase in esperado["fases"]:
            assert fase in fragmento, (
                f"{ruta_relativa}: la llamada no comprueba la fase {fase} "
                "-¿cambió el nombre de la fase y esto quedó desactualizado?"
            )

        assert esperado["razon"] in fragmento, (
            f"{ruta_relativa}: se esperaba que el callback llame a "
            f"{esperado['razon']!r} -revisar si el mecanismo de esta pantalla cambió"
        )


def test_sequence_code_non_rexenera_o_patron_a_proposito():
    """El único de los cuatro que NO debe regenerar: su patrón es fijo por
    diseño ("se puede aprender por ensayo y error", ver buildPattern en el
    propio fichero). Regenerarlo rompería esa mecánica."""
    codigo = leer(FAMILIAS / "sequenceCode" / "SimonRuntimeScreen.tsx")
    llamada_idx = codigo.index("useRegenerarAoOcultar(")
    fragmento = codigo[llamada_idx : llamada_idx + 400]

    assert "buildPattern" not in fragmento, (
        "sequenceCode está regenerando el patrón al ocultar la pestaña: eso "
        "contradice su propio diseño de secuencia fija (ver buildPattern)"
    )
