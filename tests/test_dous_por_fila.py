# -*- coding: utf-8 -*-
"""La lista de jugadores: dos por fila, en cualquier móvil.

Aquí había `repeat(auto-fill, minmax(148px, 1fr))`, que no es «dos»: es «las
que quepan». En un móvil estrecho la tarjeta no llega a los 148px y `auto-fill`
se queda en UNA columna, o sea la lista vertical de siempre.

Y lo peor es cómo lo medí: en el banco salían dos por fila y lo di por bueno.
La ventana del banco era más ancha que un móvil, así que la medida contestaba
a otra pregunta. `repeat(2, ...)` no depende del ancho y no hay nada que medir.

El `minmax(0, 1fr)` en vez de `1fr` a secas es para que un nombre largo no
ensanche su columna y descuadre la pareja.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "frontend" / "src" / "login" / "LoginApp.tsx"


def bloque_da_lista() -> str:
    codigo = ENTRADA.read_text(encoding="utf-8")
    inicio = codigo.index("const listBlock")
    return codigo[inicio : codigo.index("}", inicio)]


def test_son_dous_sempre():
    lista = bloque_da_lista()
    columnas = re.search(r"gridTemplateColumns:\s*'([^']+)'", lista)

    assert columnas, "la lista no declara columnas"
    valor = columnas.group(1)

    assert "auto-fill" not in valor and "auto-fit" not in valor, (
        "«las que quepan» no es «dos por fila»: en un móvil estrecho se queda "
        "en una sola columna, que es la lista vertical de antes (%s)" % valor
    )
    assert valor.startswith("repeat(2,"), "se esperaban dos columnas fijas: %s" % valor


def test_a_columna_non_se_ensancha_cun_nome_longo():
    lista = bloque_da_lista()

    assert "minmax(0" in lista, (
        "sin minmax(0, ...) un nombre largo ensancha su columna y descuadra la "
        "pareja"
    )
