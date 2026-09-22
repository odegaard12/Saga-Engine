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
    assert "const ZOOMS_RELIEVE = [11, 12, 13, 14]" in fonte
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


def test_o_velo_espera_a_que_o_mapa_pinte(fonte: str) -> None:
    """
    El mapa avisa una vez en `idle` y el velo de carga espera a ese aviso
    (con tope). Así decodificar teselas y levantar el relieve pasa DEBAJO
    del velo, no encima del jugador mientras se mueve.
    """
    # NO idle: el pulso del trazado ensucia el estilo diez veces por segundo
    # y el mapa nunca está ocioso. "Pintado" = capas y teselas cargadas.
    assert "mapa.once('idle'" not in fonte
    assert "vivo.areTilesLoaded()" in fonte and "onListoRef.current?.()" in fonte
    app = (COMPONENTE.parents[1] / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert "onListo={() => setMapaListo(true)}" in app
    assert "&& !mapaListo) {" in app, "el velo tiene que esperar al mapa"
    assert "setTimeout(() => setMapaListo(true), 7000)" in app, "sin tope, la carga podría ser eterna"


def test_as_xemelas_de_relevo_van_despois_do_corredor() -> None:
    """
    El bucle de gemelas de relieve recorre lo que ya está en la lista; antes
    del corredor no veía las teselas de z15 y el terreno se quedaba sin
    elevación fina para el paquete offline.
    """
    fonte = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert fonte.index("'corridor-z17'") < fonte.index("Relieve: las gemelas de lo que ya se va a bajar")


def test_o_paquete_offline_ten_niveis_por_distancia() -> None:
    """
    Continente en calidad general, país mejor, región mejor, comarca mejor,
    y la máxima sólo donde se camina. Al desampliar sin cobertura nunca
    aparece un hueco. El relieve va de región hacia arriba: continente y
    país (z3-z7) no lo tienen, que a ese zoom no se lee.
    """
    fonte = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    for etiqueta in ("nivel-continente-z3", "nivel-pais-z7", "nivel-region-z9", "nivel-comarca-z11"):
        assert etiqueta in fonte, "falta el nivel %s" % etiqueta
    # Relieve de z8 arriba (región, comarca, misión, corredor). Se decidió
    # con el enlace dado días antes para bajar en casa: pesa ~50 MB más.
    assert "if (!/^(mission|corridor|nivel-comarca)/.test(etiqueta)) continue" in fonte
    assert "const MAX_TILE_URLS = 8000" in fonte, (
        "con 1500 el corredor y el detalle de nodos se quedaban fuera por orden de llegada"
    )


def test_a_hora_de_saida_ten_zona() -> None:
    """
    El contenedor corre en UTC y el móvil en hora local: una fecha sin zona
    abría la cortina a la hora y el servidor seguía rechazando avanzar dos
    horas más. Se guarda con zona desde el panel, el servidor asume España
    si aun así llega sin ella, y el contenedor vive en Europe/Madrid.
    """
    raiz = COMPONENTE.parents[4]
    assert "ENV TZ=Europe/Madrid" in (raiz / "Dockerfile").read_text(encoding="utf-8")
    horario = (raiz / "backend" / "app" / "runtime" / "mission_schedule.py").read_text(encoding="utf-8")
    assert 'ZoneInfo("Europe/Madrid")' in horario
    admin = (raiz / "frontend" / "src" / "admin" / "AdminApp.tsx").read_text(encoding="utf-8")
    assert "fechaConZona(missionDraft.mission_launch_at" in admin


def test_un_so_boton_para_encadrar_e_enderezar(fonte: str) -> None:
    """
    No hay botón flotante de norte: el de encuadre de la barra encuadra con
    el norte arriba y su aguja gira con el mapa. Y los tres encuadres y el
    "seguirme" existen en el motor nuevo.
    """
    assert "Volver a poner el norte arriba" not in fonte, "volvió el botón flotante"
    assert "bearing: 0, duration: 800" in fonte and "focusRequest.target === 'route'" in fonte
    assert "followPlayerRef.current && mapa" in fonte
    app = (COMPONENTE.parents[1] / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert "onRumbo={setRumboMapa}" in app and "focusRequest={focusRequest}" in app


def test_a_guia_do_xogador_ao_nodo_vai_polo_camino(fonte: str) -> None:
    """
    La animación entre el jugador y el nodo, por el camino: un tramito hasta
    el punto del trazado más cercano y el trazado que queda hasta el nodo.
    Recta era mentira. Y a más de 500 m del camino, aviso con histéresis.
    """
    assert "id: CAPA_GUIA" in fonte
    assert "setPaintProperty(CAPA_GUIA, 'line-dasharray'" in fonte
    assert "...camino.slice(mejor).map(" in fonte, "la guía volvió a ser una recta"
    assert "const FUERA_DE_TRAZADO_M = 500" in fonte and "const DE_VUELTA_AL_TRAZADO_M = 400" in fonte
    assert "Fuera del trazado" in fonte


def test_seguirme_sen_tirons(fonte: str) -> None:
    """No se sigue con el mapa en la mano ni por menos de tres metros, y la animación enlaza."""
    assert "followPlayerRef.current && mapa && !gestoRef.current" in fonte
    assert "metrosEntre(anterior, playerPosition) >= 3" in fonte


def test_os_permisos_concedidos_lembranse() -> None:
    """
    En iPhone la cámara no se puede consultar sin pedirla y el movimiento
    exige un toque por sesión: la tarjeta salía siempre con todo concedido.
    """
    hook = (COMPONENTE.parents[1] / "hooks" / "usePermisos.ts").read_text(encoding="utf-8")
    assert "recordar(CLAVE_CAMARA)" in hook and "recordar(CLAVE_MOVIMIENTO)" in hook
    assert "recordado(CLAVE_MOVIMIENTO)" in hook and "addEventListener('pointerdown', alPrimerToque" in hook


def test_o_resumo_offline_leva_a_firma_do_plan() -> None:
    """
    Cada cambio de lo que lleva el paquete dejaba un resumen viejo diciendo
    "completo": barra al 100 % de golpe y el mapa cargando de la red al
    moverse. Tres veces. La firma lo invalida sola.
    """
    fonte = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "const FIRMA_DEL_PLAN = JSON.stringify({" in fonte
    assert "if (resumen.firma !== FIRMA_DEL_PLAN) return null" in fonte
    assert "firma: FIRMA_DEL_PLAN," in fonte
    assert "for (const [zoom, radioKm, presupuesto, etiqueta] of NIVELES)" in fonte


def test_centrar_en_min_espera_a_posicion(fonte: str) -> None:
    """
    Pulsar "centrar en mí" antes de tener posición consumía el encuadre y el
    mapa no se centraba nunca al llegar el GPS. El token queda pendiente.
    """
    assert "if (focusRequest.target === 'player' && !playerPosition) return" in fonte
    assert "playerPosition?.lat, playerPosition?.lon])" in fonte


def test_a_comprobacion_do_paquete_ensenase() -> None:
    """Con el paquete completo la barra avanza con la cuenta real de teselas, no salta a 100."""
    fonte = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "label: 'Comprobando el mapa guardado'" in fonte
    assert "teselas en el móvil" in fonte


def test_a_guia_redirixe_por_caminos_fora_do_trazado(fonte: str) -> None:
    """
    Fuera del trazado, la guía va por carreteras y caminos (A* sobre la red
    de OpenStreetMap que prepara el panel) hasta el punto más cercano de la
    ruta. Sin red preparada, recta como antes.
    """
    assert "rutaPorCaminos(grafoRef.current, playerPosition, objetivo, 400)" in fonte
    assert "mejorMetros > 120 && grafoRef.current" in fonte
    ruta = (COMPONENTE.parents[1] / "routing" / "roadGraph.ts").read_text(encoding="utf-8")
    assert "export function rutaPorCaminos(" in ruta and "class Monticulo" in ruta
    sw = (COMPONENTE.parents[3] / "public" / "sw.js").read_text(encoding="utf-8")
    assert "url.pathname === '/api/road-graph'" in sw
    # 21 MB en un fichero: fuera del paquete de teselas, pedido tras pintar.
    pack = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "urls.set('/api/road-graph'" not in pack
    assert "void cargarGrafo().then" in fonte.split("const esperarPintado = window.setInterval(")[1]


def test_os_nodos_son_modelos_3d_dentro_do_mapa(fonte: str) -> None:
    """
    Los nodos son objetos three.js dentro del mapa (capa personalizada con
    la matriz de proyección de MapLibre), en metros sobre el relieve. Base y
    tapa con la forma del tipo; color = estado; número siempre de frente.
    """
    capa = (COMPONENTE.parent / "nodosTresD.ts").read_text(encoding="utf-8")
    assert "renderingMode: '3d'" in capa and "queryTerrainElevation" in capa
    # MapLibre 6: la matriz viene en defaultProjectionData.mainMatrix; y la
    # animación no puede arrancar antes del primer idle (mataba el idle).
    assert "defaultProjectionData?.mainMatrix" in capa
    assert "m.once('idle'" not in capa and "arrancarAnimacion()" in capa
    assert "p.grupo.visible = !conTerreno || Number.isFinite(p.elevacion)" in capa
    # Altura ABSOLUTA en unidades Mercator: medido proyectando con la matriz
    # de MapLibre. "Relativa al objetivo de la cámara" se iba fuera de plano.
    assert "const elevacionObjetivo = 0" in capa and "getCameraTargetElevation()" not in capa
    assert "p.grupo.matrixWorldNeedsUpdate = true" in capa, (
        "con matrixAutoUpdate apagado, sin esto los modelos se quedan en el origen"
    )
    assert "function formaDelTipo(" in capa and "c.rotation.set(-(Math.PI / 2 - inclinacion), -rumbo, 0, 'YXZ')" in capa
    assert "vivo.addLayer(capaNodosRef.current.capa)" in fonte
    assert "capaNodosRef.current?.setNodos(" in fonte
    mision = (COMPONENTE.parents[4] / "backend" / "app" / "runtime" / "mision.py").read_text(encoding="utf-8")
    assert '"kind": kind_del_nodo(node)' in mision


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
