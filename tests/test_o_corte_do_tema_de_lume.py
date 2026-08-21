# -*- coding: utf-8 -*-
"""La esquina cortada del tema de fuego tiene que valer algo.

«El rojo no me convence, no veo cambio de diseño» — y no era gusto. El tema de
fuego define una `clip-path` que corta las esquinas de los paneles:

    body.theme-flame-red .saga-glass-panel {
      clip-path: polygon(var(--theme-panel-cut) 0, ...);
    }

...y ponía a **0** la variable que la controla. Con 0 ese polígono es un
rectángulo exacto: el corte no aparece nunca y el CSS no da ningún error.

El changelog de 4.9.4 dice que la esquina cortada es una de las TRES ideas que
definen el diseño de fuego, junto con la brasa en diagonal y el filo encendido.
Las otras dos estaban puestas. Ésta llevaba apagada desde entonces, y por eso el
tema se leía como el mismo diseño con otro color.

Es el fallo de siempre del proyecto, pero al revés: aquí la regla del tema está
viva y es el VALOR el que la deja muerta.

Cristal sí tiene que valer 0: es el tema redondo, y ahí el corte sería otro
diseño, no el suyo.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"


def _corte_de(bloque: str) -> str:
    texto = TEMAS.read_text(encoding="utf-8")
    inicio = texto.index(bloque)
    cuerpo = texto[inicio : texto.index("}", inicio)]
    hallado = re.search(r"--theme-panel-cut:\s*([^;]+);", cuerpo)
    return hallado.group(1).strip() if hallado else ""


def test_o_lume_corta_as_esquinas():
    valor = _corte_de("body.theme-flame-red {")
    assert valor, "el tema de fuego no declara --theme-panel-cut"
    numero = float(re.sub(r"[^0-9.]", "", valor) or 0)
    assert numero > 0, (
        f"--theme-panel-cut vale {valor} en el tema de fuego: la clip-path se "
        "queda en un rectángulo y la esquina cortada no aparece nunca"
    )


def test_o_cristal_segue_redondo():
    """Cristal es el tema redondo: ahí el corte sería otro diseño."""
    valor = _corte_de("body.theme-glass {")
    numero = float(re.sub(r"[^0-9.]", "", valor) or 0)
    assert numero == 0, "se le ha puesto corte a cristal, que no lo lleva"


def test_a_clip_path_segue_enganchada_a_variable():
    """Si alguien clava el número en la regla, el tema deja de mandar."""
    texto = TEMAS.read_text(encoding="utf-8")
    inicio = texto.index("body.theme-flame-red .saga-glass-panel {")
    cuerpo = texto[inicio : texto.index("}", inicio)]
    assert "var(--theme-panel-cut)" in cuerpo, (
        "la clip-path ya no sale del tema: un número escrito en la regla gana "
        "y la variable se queda muerta"
    )
