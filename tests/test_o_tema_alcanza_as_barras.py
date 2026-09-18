# -*- coding: utf-8 -*-
"""Para que el tema pueda rediseñar algo, primero tiene que poder agarrarlo.

Medido en el banco: la barra de arriba, la fila de iconos del mapa y la de
Mochila/Herramientas no tenían NINGUNA clase. Iban con estilos en línea, así
que ninguna regla del tema podía alcanzarlas por mucho que se escribiera. Se
podían cambiar los colores (por variables) pero no las formas.

Y la barra de arriba llevaba además `borderRadius: compact ? 22 : 28` clavado
en el componente. Un número en línea gana a la regla del tema: seguía redonda
en un tema de esquinas duras. Es el mismo empate que dejó muerta la regla del
alfiler del mapa —dos verdades, y la del CSS sin pintar—.

Aquello se arregló con `--theme-radius-shell`, y DESPUÉS la barra se
rediseñó entera a «diseño B» -tarjeta sólida con radio fijo de 13px, igual
que las hojas y el prólogo-: `--theme-radius-shell` dejó de usarse, y lo que
importa ahora es que el COLOR (`--theme-card`/`--theme-card-shadow`) siga
saliendo del tema, no la forma.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
CSS = FRONT / "mobile-themes.css"

GANCHOS = {
    "saga-hud-quick": FRONT / "player" / "PlayerApp.tsx",
    "saga-hud-dock": FRONT / "player" / "components" / "PlayerHud.tsx",
}


def test_as_barras_teñen_a_que_agarrarse():
    for clase, fichero in GANCHOS.items():
        codigo = fichero.read_text(encoding="utf-8")
        assert 'className="%s"' % clase in codigo, (
            "%s perdió la clase %s: sin ella el tema no puede tocar esa barra"
            % (fichero.name, clase)
        )


def test_o_tema_usa_eses_ganchos():
    css = CSS.read_text(encoding="utf-8")

    for clase in GANCHOS:
        assert ".%s" % clase in css, (
            "la clase %s no la usa ningún tema: es un gancho muerto" % clase
        )


def test_a_barra_de_arriba_usa_a_tarxeta_do_deseno_b():
    """Superseded: el radio ya no sale de --theme-radius-shell.

    La barra de arriba se rediseñó a «diseño B» -tarjeta flotante sólida,
    igual que las hojas y el prólogo-, con radio fijo de 13px que forma
    parte de esa identidad, no del tema. Lo que SÍ tiene que seguir saliendo
    del tema es el color y la sombra: por ahí es por donde fuego/cristal
    siguen cambiando la barra sin que el color quede clavado en línea.

    `--theme-radius-shell` quedó sin usar en ningún componente -ver grep-,
    dead CSS pendiente de limpiar (anotado en TODO.md), pero no es lo que
    esta prueba protege.
    """
    codigo = (FRONT / "player" / "components" / "PlayerShell.tsx").read_text(
        encoding="utf-8"
    )
    codigo = re.sub(r"/\*.*?\*/", "", codigo, flags=re.DOTALL)

    assert "background: 'var(--theme-card)'" in codigo, (
        "la barra de arriba dejó de leer el color de tarjeta del tema"
    )
    assert "boxShadow: 'var(--theme-card-shadow)'" in codigo, (
        "la barra de arriba dejó de leer la sombra de tarjeta del tema"
    )


def test_a_brasa_chega_aos_paneis_e_non_so_as_barras():
    """El degradado en diagonal es una de las tres ideas del diseño.

    Estaba en DOS sitios de todo el CSS: su declaración y la regla de las tres
    barras. Los paneles de dentro —la mesa, los minijuegos, la guía— eran
    planos, así que la idea sólo la veía el 20 % de la pantalla y el tema se
    leía como un color de fondo en vez de como un diseño.
    """
    css = CSS.read_text(encoding="utf-8")
    usos = css.count("var(--theme-brasa)")
    assert usos >= 2, (
        "la brasa vuelve a estar sólo en las barras: los paneles se quedan "
        "planos y el tema se lee como un repintado"
    )

    inicio = css.index("body.theme-flame-red .saga-glass-panel")
    bloque = css[inicio : css.index("}", inicio)]
    assert "var(--theme-brasa)" in bloque, "los paneles siguen sin la diagonal"
