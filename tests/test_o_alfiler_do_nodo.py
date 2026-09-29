# -*- coding: utf-8 -*-
"""Los alfileres del mapa: dos verdades sobre el mismo color, y una muerta.

Medido en el banco. Cambié la regla de CSS del nodo actual para que siguiese al
tema, construí, desplegué… y el alfiler seguía azul. El elemento decía:

    <div class="saga-mission-node-pin saga-mission-node-pin--current"
         style="background:#3b82f6;border-color:#ffffff;">

La clase estaba puesta y la regla de CSS existía, pero el estilo en línea gana
siempre. Así que la regla llevaba tiempo sin pintar nada y nadie se enteró.

Y no decían lo mismo. Para el nodo aún por hacer:

    en línea   #ef4444   rojo
    en el CSS  gris (linear-gradient(#374151, #111827))

Lo que se veía en el monte era el rojo. El gris era una idea que alguien
escribió y que jamás llegó a la pantalla.

Ahora el color está en un solo sitio -el CSS, con variables del tema- y en
cristal son exactamente los tres colores que se veían: verde #22c55e, azul
#3b82f6 y rojo #ef4444.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"

ESTADOS = ("completed", "current", "locked")








def test_os_tres_estados_distinguense():
    """Si dos estados salen del mismo color, el mapa deja de decir nada."""
    css = TEMAS.read_text(encoding="utf-8")

    for bloque in ("theme-glass", "theme-flame-red"):
        inicio = css.index("body.%s {" % bloque)
        cuerpo = css[inicio : css.index("}", inicio)]
        valores = {
            v: re.search(r"%s:\s*([^;]+);" % v, cuerpo).group(1).strip()
            for v in ("--theme-pin-done", "--theme-pin", "--theme-pin-todo")
        }
        assert len(set(valores.values())) == 3, (
            "en %s dos estados del alfiler comparten color: %s" % (bloque, valores)
        )


def test_cristal_conserva_os_colores_que_se_vian():
    """Lo que se veía en el monte tiene que seguir viéndose igual."""
    css = TEMAS.read_text(encoding="utf-8")
    inicio = css.index("body.theme-glass {")
    cuerpo = css[inicio : css.index("}", inicio)]

    for variable, valor in (
        ("--theme-pin-done", "34, 197, 94"),  # #22c55e
        ("--theme-pin", "59, 130, 246"),  # #3b82f6
        ("--theme-pin-todo", "239, 68, 68"),  # #ef4444
    ):
        assert "%s: %s;" % (variable, valor) in cuerpo, (
            "cristal cambió el alfiler %s: se esperaba %s" % (variable, valor)
        )
