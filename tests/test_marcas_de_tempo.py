# -*- coding: utf-8 -*-
"""Las marcas de tiempo se leen con el parser que aguanta Safari.

`shared/fechas.ts` existía con `leerMarcaDeTiempo` dentro y **no lo llamaba
nadie**: cinco sitios parseaban con `Date.parse` a pelo. El servidor escribe con
`datetime.isoformat()`, que son SEIS decimales de segundo, y el estándar de
JavaScript sólo obliga a entender tres. Safari ha devuelto NaN con más de una
versión; Chrome se lo traga, así que un fallo así sólo aparece en los iPhone y
en mitad del monte.

Medido hoy contra la misión real, y esto es importante decirlo entero: **por la
API no llega ni una marca de 6 decimales**. `/api/game/<user>?offline_pack=true`
son 205 KB con 7 marcas, todas de 3 decimales o menos. O sea que hoy no hay
ningún fallo vivo por esto.

Pero la base de datos sí las guarda —200 filas en `events`, 16 en `game_state`,
14 en `positions`— así que basta con que un endpoint empiece a devolver un
`created_at` para que aparezca. Y ninguno de los cinco sitios se rompía con
ruido: degradaban en silencio. El peor, `teamPresence`, daba la caché por
infinitamente vieja y la tiraba, que sin cobertura es quedarse con el mapa del
grupo en blanco en vez de con los compañeros donde estaban.

Usar el parser que ya estaba escrito no cuesta nada y quita el riesgo entero.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
FECHAS = FRONT / "shared" / "fechas.ts"

# Los que leen marcas que vienen del servidor o de la caché.
CONSUMIDORES = (
    FRONT / "player" / "components" / "RankingSheet.tsx",
    FRONT / "player" / "components" / "InventoryPanel.tsx",
    FRONT / "player" / "offline" / "teamPresence.ts",
    FRONT / "shared" / "offlineVault.ts",
)


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_o_parser_aguanta_seis_decimais():
    codigo = sin_comentarios(FECHAS)

    assert r"(\.\d{3})\d+" in codigo, "hay que recortar los decimales de mas"
    assert "replace(' ', 'T')" in codigo, "Safari tampoco acepta el espacio en vez de T"


def test_ninguen_parsea_marcas_a_pelo():
    culpables = []

    for fichero in CONSUMIDORES:
        codigo = sin_comentarios(fichero)
        if "Date.parse(" in codigo:
            culpables.append(fichero.relative_to(RAIZ).as_posix())

    assert not culpables, (
        f"parsean con Date.parse en vez de leerMarcaDeTiempo: {culpables}"
    )


def test_todos_usan_o_parser_seguro():
    for fichero in CONSUMIDORES:
        codigo = sin_comentarios(fichero)
        assert "leerMarcaDeTiempo" in codigo, f"{fichero.name} no usa el parser seguro"


def test_o_parser_xa_non_e_un_orfo():
    """Existía sin que lo llamara nadie, que es como no existir."""
    usos = 0

    for p in FRONT.rglob("*"):
        if p.suffix not in (".ts", ".tsx") or not p.is_file() or p == FECHAS:
            continue
        if "leerMarcaDeTiempo" in sin_comentarios(p):
            usos += 1

    assert usos >= 4, f"solo {usos} ficheros lo usan"
