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

Ahora el radio sale de `--theme-radius-shell` con el 22/28 de respaldo, así que
cristal se ve igual y fuego manda.
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


def test_a_barra_de_arriba_non_leva_o_radio_cravado():
    """Un número en línea gana a la regla del tema."""
    codigo = (FRONT / "player" / "components" / "PlayerShell.tsx").read_text(
        encoding="utf-8"
    )
    codigo = re.sub(r"/\*.*?\*/", "", codigo, flags=re.DOTALL)

    assert "borderRadius: compact ? 22 : 28" not in codigo, (
        "vuelve a estar el radio clavado: la barra se queda redonda dijera lo "
        "que dijera el tema"
    )
    assert "--theme-radius-shell" in codigo, (
        "el radio de la barra tiene que salir del tema, con el de siempre de "
        "respaldo para que cristal no cambie"
    )


def test_o_respaldo_conserva_o_de_cristal():
    """Cristal sigue con SUS 28 px, los declare o los herede.

    Esta prueba pedía antes que cristal NO declarase `--theme-radius-shell`,
    para que se quedara con el respaldo del componente. Chocaba de frente con
    `test_variables_sen_repetir`, que exige que los dos temas declaren el mismo
    juego: en cuanto fuego declaró la suya (2026-08-21), las dos no podían
    cumplirse a la vez.

    Se resolvió por el lado que protege lo mismo con menos trampa: cristal la
    declara con los 28 px que ya usaba. No cambia ni un píxel —es el mismo
    número que el respaldo— y deja de heredar en silencio un valor que nadie
    eligió para él, que es justo el fallo que se estaba arreglando.

    Lo que esta prueba protege sigue siendo lo de siempre: que cristal no
    cambie de forma.
    """
    codigo = (FRONT / "player" / "components" / "PlayerShell.tsx").read_text(
        encoding="utf-8"
    )

    assert "22 : 28" in codigo, (
        "el respaldo tiene que seguir siendo el 22/28 exacto de cristal"
    )

    css = CSS.read_text(encoding="utf-8")
    inicio = css.index("body.theme-glass {")
    cuerpo = css[inicio : css.index("}", inicio)]

    hallado = re.search(r"--theme-radius-shell:\s*([^;]+);", cuerpo)
    assert hallado, "cristal hereda un valor que nadie eligió para él"
    assert "28" in hallado.group(1), (
        "cristal ha cambiado de forma: tiene que seguir en sus 28 px"
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
