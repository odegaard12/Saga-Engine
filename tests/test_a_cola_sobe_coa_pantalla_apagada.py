# -*- coding: utf-8 -*-
"""Un móvil en el bolsillo tiene que subir lo que lleva pendiente.

Medido contra producción el 2026-08-17, con la pestaña oculta, red perfecta y
servidor sano: ocho segundos y el servidor seguía en 0 mientras el móvil marcaba
1. En cuanto la pestaña pasaba a visible, la cola subía sola.

El ciclo de refresco bailaba entero si `visibilityState !== 'visible'`, y ahí
dentro van dos cosas de precio muy distinto:

    syncPendingOfflineEvents + flushOfflineEvents   un POST diminuto
    pedirPartida                                    214 KB

Saltarse el refresco pesado con la pantalla apagada está bien. Saltarse el
vaciado de la cola no: quien acaba la ruta y guarda el móvil podía dejar su
tiempo sin registrar todo el día, con cobertura de sobra.

⚠️ Lo que esto NO arregla: si el navegador CONGELA la página —la aplicación en
segundo plano un rato largo en Android— aquí no corre nada. Para eso hace falta
Background Sync con service worker. Esto cubre la pantalla apagada con la página
viva, que es el caso corriente.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
APP = RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx"


def ciclo_de_refresco() -> str:
    """El cuerpo de `refreshMissionFromServer`."""
    texto = APP.read_text(encoding="utf-8")
    inicio = texto.index("async function refreshMissionFromServer()")
    resto = texto[inicio:]
    fin = resto.index("\n    }\n", 1)
    return resto[:fin]


def test_a_cola_vaciase_antes_de_mirar_se_hai_alguen_diante():
    """El orden ES el arreglo: primero subir, después decidir si se sigue."""
    cuerpo = ciclo_de_refresco()

    pos_cola = cuerpo.index("await syncPendingOfflineEvents(user)")
    pos_corte = cuerpo.index("if (oculto) return")

    assert pos_cola < pos_corte, (
        "el ciclo se corta por visibilidad ANTES de vaciar la cola: un móvil en "
        "el bolsillo vuelve a no subir nada"
    )


def test_o_refresco_pesado_si_se_salta_coa_pantalla_apagada():
    """Lo caro sigue sin hacerse: son 214 KB y no hay nadie mirando."""
    cuerpo = ciclo_de_refresco()

    pos_corte = cuerpo.index("if (oculto) return")
    # La LLAMADA, no la mencion: el comentario de arriba tambien la nombra.
    pos_partida = cuerpo.index("await pedirPartida(user)")

    assert pos_corte < pos_partida, (
        "con la pantalla apagada se está pidiendo la partida entera (214 KB) "
        "sin que nadie la mire"
    )


def test_non_queda_o_corte_vello_que_paraba_todo():
    cuerpo = ciclo_de_refresco()
    assert "document.visibilityState !== 'visible') {\n        return" not in cuerpo, (
        "sigue el corte viejo, que paraba el ciclo entero antes de la cola"
    )
