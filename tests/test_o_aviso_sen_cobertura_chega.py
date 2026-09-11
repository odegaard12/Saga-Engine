# -*- coding: utf-8 -*-
"""El aviso de «nodo superado sin conexión» tiene que llegar a la pantalla.

Medido contra producción el 2026-08-17, mismo nodo y mismo botón, cambiando
sólo el tipo de fallo:

    /api/advance da 500      tono warn      se ve a los 101 ms, dura 3,5 s
    red caída                tono success   NO se ve nunca

O sea que el caso raro avisa y el caso normal del monte —quedarse sin
cobertura— es mudo. El jugador avanza, la pantalla pasa al nodo siguiente en
60 ms y nada le dice que eso no ha salido del móvil.

Y no era que faltase el mensaje. Existe en `avance/decisiones.ts`, se calcula,
se pasa a `showNotice`... y ahí moría:

    const normalizedTone = tone === 'success' ? 'info' : tone
    if (normalizedTone === 'info') return

Tragarse los `info` era deliberado —para no llenar la pantalla de carteles—,
así que la salida no es quitar el filtro y que todo grite igual: es darles un
sitio propio y discreto. Un cartel para lo que hay que mirar, una línea callada
para lo que sólo hay que saber.

El mismo filtro dejaba mudos otros dos avisos pensados justo para tranquilizar
sin cobertura: el de la foto que se sube sola y el del borrado aplazado.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player"
APP = JUGADOR / "PlayerApp.tsx"
DECISIONES = JUGADOR / "avance" / "decisiones.ts"


def app() -> str:
    return APP.read_text(encoding="utf-8")


def cuerpo_de_show_notice() -> str:
    texto = app()
    inicio = texto.index("function showNotice")
    resto = texto[inicio:]
    fin = resto.index("\n  function ", 1)
    return resto[:fin]


def test_show_notice_non_tira_os_avisos_info():
    """Ningún aviso puede morir en un `return` mudo."""
    cuerpo = cuerpo_de_show_notice()

    assert "if (normalizedTone === 'info') return" not in cuerpo, (
        "showNotice sigue descartando los avisos info sin pintarlos: el jugador "
        "se queda sin saber que su avance no salió del móvil"
    )


def test_o_aviso_sen_cobertura_ten_onde_pintarse():
    """Los avisos callados tienen que tener destino propio, no el mismo cartel."""
    cuerpo = cuerpo_de_show_notice()

    assert "setUiQuiet" in cuerpo, (
        "showNotice no manda los avisos discretos a ningún sitio; hace falta un "
        "destino aparte del cartel de los avisos que sí interrumpen"
    )
    assert "setUiNotice" in cuerpo, "los avisos que interrumpen siguen necesitando su cartel"


def test_hai_un_compoñente_para_os_avisos_calados():
    """Discreto significa otro componente, no el mismo con otro color."""
    quieto = JUGADOR / "components" / "QuietNotice.tsx"
    assert quieto.exists(), "falta el componente de los avisos callados"

    texto = quieto.read_text(encoding="utf-8")
    assert "QuietNotice" in texto

    # Lo que ha fallado cuatro veces: una forma escrita en linea gana a la regla
    # del tema y la deja muerta sin dar ningun error.
    assert "var(--theme-" in texto, (
        "el aviso callado no usa ninguna variable del tema: volvería a ser una "
        "pantalla al margen del tema, que es el fallo de siempre"
    )


def test_o_texto_sen_cobertura_segue_existindo():
    """El mensaje que se estaba tirando no se pierde por el camino."""
    texto = DECISIONES.read_text(encoding="utf-8")
    assert "Nodo superado sin conexión" in texto


def test_a_pantalla_pinta_o_aviso_calado():
    """De nada sirve el estado si nadie lo pinta."""
    texto = app()
    assert "<QuietNotice" in texto, "QuietNotice no se pinta en ninguna parte"
