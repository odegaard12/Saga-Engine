# -*- coding: utf-8 -*-
"""La franja de arriba del móvil, la que ningún CSS puede tocar.

En Android, la barra del navegador se pinta con `<meta name="theme-color">`. En
el `index.html` estaba escrita a mano:

    <meta name="theme-color" content="#1f302b" />

Un verde. Así que una misión con el tema de fuego se abría con una banda verde
encima de todo, fuera de la página, donde no llega ninguna regla de CSS. Es de
las cosas que sólo se ven en un móvil de verdad, nunca en el escritorio.

Ahora el servidor la reescribe con el `--theme-bg` del tema de la misión.

Son dos sitios a la fuerza -uno es CSS, el otro una etiqueta que se manda antes
de que exista ningún CSS-, así que esta prueba compara los dos valores. Dos
verdades sobre el mismo color es justo el patrón que ya costó caro aquí.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CSS = RAIZ / "frontend" / "src" / "mobile-themes.css"
CONSTRUCCION = RAIZ / "backend" / "app" / "build_frontend.py"
INDICE = RAIZ / "frontend" / "index.html"


def fondo_do_tema(clase: str) -> str:
    """El `--theme-bg` declarado en el bloque de ese tema."""
    css = CSS.read_text(encoding="utf-8")
    inicio = css.index("body.%s {" % clase)
    cuerpo = css[inicio : css.index("}", inicio)]
    return re.search(r"--theme-bg:\s*([^;]+);", cuerpo).group(1).strip()


def tabla_do_servidor() -> dict:
    codigo = CONSTRUCCION.read_text(encoding="utf-8")
    inicio = codigo.index("COLOR_DE_BARRA = {")
    cuerpo = codigo[inicio : codigo.index("}", inicio)]
    return dict(re.findall(r'"(theme-[a-z-]+)":\s*"(#[0-9a-fA-F]+)"', cuerpo))


def test_o_servidor_reescribe_a_barra():
    codigo = CONSTRUCCION.read_text(encoding="utf-8")

    assert "theme-color" in codigo, (
        "el servidor no toca la barra del navegador: en el móvil sigue con el "
        "color escrito a mano en el index.html"
    )


def test_a_barra_e_o_fondo_din_o_mesmo():
    tabla = tabla_do_servidor()

    assert tabla, "no se pudo leer COLOR_DE_BARRA"

    for clase, color in tabla.items():
        fondo = fondo_do_tema(clase)
        assert color.lower() == fondo.lower(), (
            "la barra de %s dice %s y el fondo dice %s: dos verdades sobre el "
            "mismo color" % (clase, color, fondo)
        )


def test_todos_os_temas_teñen_barra():
    """Un tema sin entrada se abre con el color escrito a mano en el index."""
    css = CSS.read_text(encoding="utf-8")
    temas = set(re.findall(r"body\.(theme-[a-z-]+)\s*\{", css))
    tabla = tabla_do_servidor()

    faltan = temas - set(tabla)
    assert not faltan, "temas sin color de barra: %s" % sorted(faltan)


def test_o_indice_segue_tendo_a_etiqueta():
    """Si desaparece del index, el servidor no tiene nada que reescribir."""
    html = INDICE.read_text(encoding="utf-8")

    assert 'name="theme-color"' in html, (
        "sin la etiqueta en el index no hay nada que reescribir y el móvil "
        "vuelve al color por defecto del navegador"
    )
