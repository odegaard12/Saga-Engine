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


def test_o_estilo_comprobase_antes_de_escoitalo(fonte: str) -> None:
    """
    Preguntar por el estilo ANTES de esperar su evento.

    Dos intentos fallaron aquí, los dos en silencio. `load` esperaba también
    al terreno y no disparaba si la elevación tardaba. `style.load` parecía
    la respuesta, pero el estilo se declara EN LÍNEA y MapLibre lo monta de
    forma síncrona dentro del constructor: el evento ya había pasado cuando
    se enganchaba el escuchador, y no vuelve a ocurrir.

    El síntoma fue idéntico las dos veces -nodos y fotos sí, capas de datos
    no- porque los marcadores del DOM no esperan a nada.
    """
    assert "mapa.isStyleLoaded()" in fonte, (
        "sin comprobar el estilo antes, el evento puede haber pasado ya"
    )
    assert "mapa.on('style.load'" in fonte, "hace falta el camino asíncrono"
    assert "mapa.on('load'" not in fonte, "`load` espera también al terreno"


def test_engadir_a_fonte_dúas_veces_non_revienta_o_mapa(fonte: str) -> None:
    """
    El montaje puede llegar por el atajo síncrono Y por el evento.

    Añadir dos veces la misma fuente tira el mapa entero, así que el camino
    tiene que ser idempotente.
    """
    assert "if (mapa.getSource(FUENTE_RADIO))" in fonte


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
