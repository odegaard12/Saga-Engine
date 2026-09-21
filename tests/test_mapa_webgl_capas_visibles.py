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


def test_as_capas_de_datos_nacen_co_estilo(fonte: str) -> None:
    """
    El radio y el trazado se declaran EN el estilo, no se añaden después.

    Añadirlos al vuelo obliga a esperar a que el estilo esté montado, y
    ninguna de las dos señales de MapLibre sirve a ciegas: `style.load` ya
    ha ocurrido cuando enganchas el escuchador -porque el estilo va en
    línea y se monta dentro del constructor- e `isStyleLoaded()` es más
    estricto que el evento y exige además que carguen todas las fuentes.
    Entre las dos, el código se quedaba en tierra de nadie.

    Costó tres versiones porque el síntoma no daba ni un error: los nodos y
    las fotos se veían -son marcadores del DOM, no esperan a nada- y
    faltaban justo las capas de datos.
    """
    assert "[FUENTE_RADIO]: { type: 'geojson'" in fonte
    assert "[FUENTE_RUTA]: { type: 'geojson'" in fonte
    assert "addSource(FUENTE_RADIO" not in fonte, "volvió a añadirse al vuelo"
    assert "addSource(FUENTE_RUTA" not in fonte, "volvió a añadirse al vuelo"
    assert "mapa.addLayer(" not in fonte, "las capas también van en el estilo"
    assert "mapa.on('load'" not in fonte
    assert "mapa.on('style.load'" not in fonte


def test_os_datos_das_fontes_non_se_perden(fonte: str) -> None:
    """
    Si el estilo aún no montó, los datos se guardan y se vuelcan después.

    Aquí estuvo el fallo que se llevó media docena de versiones: la línea
    era `fuente?.setData(datos)`, y si el estilo no había terminado de
    montarse `getSource` devolvía nada, la interrogación se tragaba la
    llamada y NO se reintentaba jamás. Los nodos llegan de la API en menos
    de lo que tarda el estilo, así que el trazado, el radio y los volúmenes
    se perdían casi siempre.

    El síntoma engañaba: se veían las teselas y el relieve -van declarados
    en el estilo y no hay que rellenarlos- y los nodos y las fotos -son
    marcadores del DOM-. Faltaba justo lo que hay que rellenar después.
    """
    assert "ultimoDatoRef.current.set(id" in fonte, (
        "sin guardar el último dato, una fuente que aún no existe lo pierde"
    )
    assert "mapa.on('styledata', volcarPendientes)" in fonte, (
        "hace falta volcar lo pendiente cuando las fuentes ya existen"
    )


def test_hai_vixiante_por_se_o_estilo_non_monta(fonte: str) -> None:
    """
    Un mapa que nace con la pantalla bloqueada se queda EN BLANCO.

    MapLibre v6 monta el estilo dentro de un `requestAnimationFrame`, y un
    navegador no ejecuta fotogramas en una pestaña que no se pinta. Si el
    mapa se crea con la app en segundo plano -normalísimo durante los
    segundos que tarda la descarga offline- ese fotograma no llega y el
    estilo no monta. No da error y no siempre se recupera solo; encima los
    nodos sí se ven, porque son marcadores del DOM, así que parece que el
    mapa "casi" funciona.
    """
    assert "visibilitychange" in fonte
    assert "isStyleLoaded()" in fonte
    assert "setStyle(estiloDelMapa())" in fonte
    assert "rescates >= 5" in fonte, "sin tope, reintentaría en bucle"


def test_o_3d_dos_nodos_e_xeometria_non_debuxo(fonte: str) -> None:
    """
    Los nodos tienen volumen DENTRO del mapa, no sombras en CSS.

    Un marcador del DOM es una calcomanía pegada a la pantalla: no se
    inclina con la cámara, no lo tapa una loma y al girar el mapa sigue
    mirando de frente. Por mucha sombra que se le pinte nunca parece parte
    del terreno. Lo mismo valía para el `rotateX` de las fotos, que además
    se veía torcido al desplazar porque un giro de CSS no sigue al mapa.
    """
    assert "'fill-extrusion'" in fonte, "el volumen de los nodos es geometría"
    assert "'fill-extrusion-height'" in fonte
    assert "transform: 'rotateX(" not in fonte, "volvió el volcado falso de CSS"


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
