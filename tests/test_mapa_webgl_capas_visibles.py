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


def test_o_worker_de_maplibre_ten_url_propia(fonte: str) -> None:
    """
    MapLibre v6 carga su worker desde una URL AL LADO de su chunk.

    Vite no copia ese fichero si nadie lo importa: 404 silencioso, worker
    muerto, y con él todo lo GeoJSON (trazado, radio, extrusión, símbolos)
    y la decodificación del relieve. Fue EL fallo de toda la migración:
    pareció bug de datos, de eventos, de posición y del móvil, y no era
    ninguno. Con `?url` Vite emite el fichero y aquí se le da la dirección.
    """
    # `?worker&url`, no `?url`: el worker importa a su vez
    # `./maplibre-gl-shared.mjs`, y con `?url` ese segundo fichero tampoco
    # se copia. Vite tiene que empaquetar el worker CON sus imports.
    assert "from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'" in fonte
    assert "maplibregl.setWorkerUrl(urlDelWorker)" in fonte


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


def test_ningun_marcador_leva_position_en_lina(fonte: str) -> None:
    """
    El elemento que se entrega a MapLibre no lleva `position` propio.

    MapLibre lo coloca con su clase (`position: absolute`) más un
    `transform` que SUMA al sitio donde el elemento esté. Un `position`
    en línea gana a la clase y deja el marcador en flujo de documento:
    los nodos salían apilados en columna desde la esquina del mapa y sólo
    "iban a su sitio" al ampliar. Cinco versiones persiguiendo eso.
    """
    import re

    # Cada bloque de estilo del elemento que acaba en `new maplibregl.Marker({ element: X`
    for nombre in re.findall(r"new maplibregl\.Marker\(\{ element: (\w+)", fonte):
        bloque = re.search(
            r"Object\.assign\(%s\.style, \{(.*?)\} as Partial" % nombre, fonte, re.S
        )
        if not bloque:
            continue
        assert "position:" not in bloque.group(1), (
            "el elemento `%s` lleva `position` en línea: MapLibre lo apilará en flujo" % nombre
        )


def test_os_nodos_son_simbolos_do_mapa_non_marcadores_do_dom(fonte: str) -> None:
    """
    Los nodos los pinta el motor, no el DOM.

    Un marcador del DOM se coloca desde JavaScript un fotograma después de
    que el mapa se haya dibujado: con relieve y zoom va siempre por detrás
    del terreno ("se quedan mal y al soltar se recolocan"). Un símbolo lo
    pinta MapLibre en el mismo fotograma y a la altura correcta del
    terreno. La imagen se dibuja en canvas con el número horneado: sin
    fuentes de letras externas, que fallarían sin cobertura.
    """
    assert "type: 'symbol'" in fonte
    assert "mapa.on('styleimagemissing'" in fonte
    assert "function dibujarChincheta(" in fonte
    assert "marcadoresNodosRef.current.push" not in fonte, (
        "volvieron los nodos como marcadores del DOM"
    )
    # Las fotos, lo mismo: un marcador del DOM "no se queda en su sitio".
    assert "marcadoresFotosRef" not in fonte, "volvieron las fotos como marcadores del DOM"
    # Y el avatar, que era el último marcador del DOM y el único que saltaba.
    assert "marcadorXogadorRef" not in fonte, "volvió el avatar como marcador del DOM"
    assert "id: CAPA_JUGADOR" in fonte and "function dibujarAvatar(" in fonte
    assert "id: CAPA_FOTOS" in fonte and "function dibujarFoto(" in fonte


def test_o_trazado_leva_estado_e_pulso(fonte: str) -> None:
    """
    Verde lo andado, azul el tramo en juego, claro lo pendiente; y un
    pulso sobre el tramo en juego. El color cuenta la partida sin leer.
    """
    assert "properties: { estado: tramo.estado }" in fonte
    assert "id: CAPA_RUTA_PULSO" in fonte
    assert "filter: ['==', ['get', 'estado'], 'actual']" in fonte
    assert "setPaintProperty(CAPA_RUTA_PULSO, 'line-opacity'" in fonte


def test_o_paquete_offline_cobre_o_relevo_ata_z15() -> None:
    """
    El terreno pide elevación a z14-15 al caminar; bajar sólo hasta z13
    dejaba el monte plano sin cobertura. Y el corredor sigue el trazado
    real, no rectas entre nodos.
    """
    fonte = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "const ZOOMS_RELIEVE = [8, 9, 10, 11, 12, 13, 14, 15]" in fonte
    assert "function puntosDelTrack(" in fonte
    assert "const track = puntosDelTrack(stage)" in fonte


def test_o_service_worker_serve_a_elevacion_sen_rede() -> None:
    """
    Sin red, el mapa 3D pedía la elevación y el service worker la dejaba
    pasar a una red que no estaba: el monte salía PLANO aunque las teselas
    de imagen sí llegaran. "Sin cobertura era otro mapa."
    """
    sw = (COMPONENTE.parents[3] / "public" / "sw.js").read_text(encoding="utf-8")
    assert "url.pathname.startsWith('/dem-tiles/')" in sw
    assert "'saga:offline-map-tiles:v3'" in (
        COMPONENTE.parents[1] / "offline" / "mapTileCache.ts"
    ).read_text(encoding="utf-8"), "el resumen viejo daría el paquete por completo sin bajar lo nuevo"


def test_o_vixiante_non_refai_un_estilo_san(fonte: str) -> None:
    """
    El vigilante sólo actúa si el estilo NO tiene capas.

    `isStyleLoaded()` es `false` cada vez que hay una tesela cargando -o
    sea, en cada zoom-. Con esa comprobación rehacía el estilo entero
    hasta cinco veces sobre un mapa sano: vaciaba fuentes, recargaba
    teselas y descolocaba marcadores.
    """
    bloque = fonte[fonte.index("const vigilarEstilo"):fonte.index("document.addEventListener('visibilitychange'")]
    assert "vivo.isStyleLoaded()" not in bloque, "el vigilante volvió a mirar isStyleLoaded()"
    assert "getStyle().layers.length" in bloque
