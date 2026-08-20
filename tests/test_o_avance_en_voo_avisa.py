# -*- coding: utf-8 -*-
"""Mientras el avance está en vuelo, la pantalla tiene que decir algo.

Medido contra producción el 2026-08-17 con retardo de 3-10 s:

       0 ms  el jugador pulsa REXISTRAR O PASO
      11 ms  se cierra la historia y vuelve al mapa
      11 ms -> 11 830 ms   NADA. Ni un cambio en pantalla
   11 830 ms  por fin avanza

Doce segundos mirando una pantalla quieta es tiempo de sobra para pensar que no
ha funcionado y volver a pulsar. El indicador de `submitting` existía, pero vive
DENTRO del panel de interacción, que para entonces ya se ha cerrado: en el mapa
no quedaba ninguna señal.

Y el contraste es lo que lo hacía raro: sin cobertura el fallo es inmediato y el
jugador avanza en 60 ms; con cobertura mala espera 12 s. La red a medias se
vivía peor que no tener red, que es justo el caso del monte.

Se resuelve en el sitio que ya existe desde 4.9.7: la línea callada de abajo.
Sin hook nuevo — en `PlayerApp.tsx` un hook detrás de un `return` temprano tira
la aplicación entera con el error 310, y ya llegó a producción una vez.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
APP = RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx"


def app() -> str:
    return APP.read_text(encoding="utf-8")


def _bloque_do_quiet_notice() -> str:
    """El JSX, no el tipo.

    Buscar `<QuietNotice` a secas casa antes con `useState<QuietNoticeData>`,
    que lleva la misma subcadena, y la prueba acaba mirando los hooks de arriba.
    """
    texto = app()
    inicio = texto.index("<QuietNotice notice=")
    return texto[inicio : inicio + 300]


def test_a_liña_calada_fala_mentres_o_avance_esta_en_voo():
    bloque = _bloque_do_quiet_notice()
    assert "submitting" in bloque, (
        "la línea callada no mira `submitting`: el jugador sigue sin ver nada "
        "durante los segundos que tarda el avance con cobertura mala"
    )


def test_o_aviso_en_voo_ten_texto():
    texto = app()
    assert "Rexistrando" in texto, "falta el texto que se enseña mientras se envía"
