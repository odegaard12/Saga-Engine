# -*- coding: utf-8 -*-
"""La lista de jugadores: una fila por jugador, no una tarjeta en una rejilla.

Aquí había `repeat(auto-fill, minmax(148px, 1fr))`, que no es «dos»: es «las
que quepan». En un móvil estrecho la tarjeta no llega a los 148px y `auto-fill`
se queda en UNA columna, o sea la lista vertical de siempre.

Se arregló primero forzando `repeat(2, ...)` -dos columnas fijas-, y después
se rediseñó a propósito a «fila, no tarjeta»: una foto ya es un rectángulo con
su forma, meterla en una tarjeta dentro de una rejilla de dos era el recuadro
dentro del recuadro. `minmax(0, 1fr)` es UNA columna ancha de verdad, no el
`auto-fill` viejo que se quedaba en una por accidente en móvil estrecho.

El `minmax(0, ...)` en vez de `1fr` a secas es para que un nombre largo no
ensanche la fila.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "frontend" / "src" / "login" / "LoginApp.tsx"


def bloque_da_lista() -> str:
    codigo = ENTRADA.read_text(encoding="utf-8")
    inicio = codigo.index("const listBlock")
    return codigo[inicio : codigo.index("}", inicio)]


def test_e_unha_soa_fila_de_verdade():
    lista = bloque_da_lista()
    columnas = re.search(r"gridTemplateColumns:\s*'([^']+)'", lista)

    assert columnas, "la lista no declara columnas"
    valor = columnas.group(1)

    assert "auto-fill" not in valor and "auto-fit" not in valor, (
        "«las que quepan» no es una fila fija: en un móvil estrecho «auto-fill» "
        "se queda en una columna por accidente, no por diseño (%s)" % valor
    )
    assert valor.startswith("minmax("), (
        "se esperaba una sola columna ancha (diseño «fila, no tarjeta»): %s" % valor
    )


def test_a_columna_non_se_ensancha_cun_nome_longo():
    lista = bloque_da_lista()

    assert "minmax(0" in lista, (
        "sin minmax(0, ...) un nombre largo ensancha su columna y descuadra la "
        "pareja"
    )
