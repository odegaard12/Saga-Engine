"""
Guardas del motor de mapa WebGL (`MapSurfaceGL.tsx`).

Dos bugs de este fichero costaron caro porque NINGUNO daba error: el mapa se
veía perfecto y simplemente faltaban cosas encima. Estas comprobaciones son
sobre el texto del componente a propósito -son fallos de contrato con
MapLibre, no de lógica-, así que se cazan leyendo cómo se le habla.
"""

from pathlib import Path

import pytest

COMPONENTE = (
    Path(__file__).resolve().parents[1]
    / "frontend"
    / "src"
    / "player"
    / "components"
    / "MapSurfaceGL.tsx"
)


@pytest.fixture(scope="module")
def fonte() -> str:
    return COMPONENTE.read_text(encoding="utf-8")


def test_as_capas_esperan_a_style_load_e_non_a_load(fonte: str) -> None:
    """
    El radio y el trazado se pintan cuando el ESTILO está montado.

    Con `load` esperaban además al terreno, y si la elevación tardaba o
    fallaba no se pintaban nunca. El síntoma era desconcertante: se veían los
    nodos y las fotos (marcadores del DOM, que no esperan a nada) y faltaban
    justo las dos capas de datos.
    """
    assert "mapa.on('style.load'" in fonte
    assert "mapa.on('load'" not in fonte


def test_o_xiro_da_chincheta_non_vai_no_elemento_do_marcador(fonte: str) -> None:
    """
    MapLibre REESCRIBE el `transform` del elemento que le entregas.

    La forma de gota se conseguía girando el elemento 45 grados; al estar en
    el elemento del marcador, MapLibre lo machacaba en cada fotograma para
    colocarlo en pantalla y lo que se veían eran bolas. El giro tiene que
    vivir en un hijo.
    """
    marcadores = fonte.count("new maplibregl.Marker({ element:")
    assert marcadores >= 2, "cambiaron los marcadores; revisar esta guarda"
    assert "rotate(-45deg)" in fonte, "se perdió la forma de chincheta"
    # El giro y la creación del elemento del marcador no pueden ser la misma
    # asignación de estilo.
    bloque_marcador = fonte.split("const elemento = document.createElement('div')")[1]
    cabecera = bloque_marcador.split("} as Partial<CSSStyleDeclaration>)")[0]
    assert "rotate(" not in cabecera, (
        "el giro volvió al elemento del marcador: MapLibre lo va a machacar"
    )
