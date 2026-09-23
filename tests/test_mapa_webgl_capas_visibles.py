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
    # Teselas de 256 px: el mapa pide un nivel MÁS que el zoom que enseña.
    assert "'mission-z15'" in fonte and "'mission-z16'" in fonte and "'node-z19'" in fonte
    assert "plan: 4," in fonte


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
    # Memoria de SESIÓN: permanente dejó de pedirlos nunca, y si el sistema
    # retiró la cámara no se sabía hasta estar en el monte.
    assert "sessionStorage.getItem(clave)" in hook and "localStorage" not in hook
    assert "olvidar(CLAVE_CAMARA)" in hook


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
    # La ruta se pide al worker (no bloquea el hilo principal) y se pondera
    # por clase de vía según la lejanía: en casa, por carretera.
    assert "red.ruta(peticion.desde, objetivo, mejorMetros)" in fonte
    assert "if (mejorMetros > 120) {" in fonte
    ruta = (COMPONENTE.parents[1] / "routing" / "roadGraph.ts").read_text(encoding="utf-8")
    assert "export function rutaPorCaminos(" in ruta and "class Monticulo" in ruta
    assert "export function factorPorLejania(" in ruta and "v.peso * factor(v.clase)" in ruta
    worker = (COMPONENTE.parents[1] / "routing" / "roadGraph.worker.ts").read_text(encoding="utf-8")
    assert "indexarGrafo(" in worker and "factorPorLejania(m.lejaniaM)" in worker
    red = (COMPONENTE.parents[1] / "routing" / "redDeCaminos.ts").read_text(encoding="utf-8")
    assert "new Worker(new URL('./roadGraph.worker.ts', import.meta.url)" in red
    sw = (COMPONENTE.parents[3] / "public" / "sw.js").read_text(encoding="utf-8")
    assert "url.pathname === '/api/road-graph'" in sw and "ROAD_GRAPH_CACHE" in sw
    # 21 MB en un fichero: fase propia del paquete, no una tesela más.
    pack = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "urls.set('/api/road-graph'" not in pack
    assert "async function descargarRedDeCaminos(" in pack and "await descargarRedDeCaminos(onProgress)" in pack
    # La clase de vía la pone el servidor en cada tramo.
    grafo = (COMPONENTE.parents[4] / "backend" / "app" / "runtime" / "road_graph.py").read_text(encoding="utf-8")
    assert "CLASES_DE_VIA" in grafo and "tramos.append([a, b, round(longitud, 1), intermedios, clase])" in grafo


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
    assert "p.grupo.visible = zoomDeMas && (!conTerreno || Number.isFinite(p.elevacion))" in capa
    # Altura ABSOLUTA en unidades Mercator: medido proyectando con la matriz
    # de MapLibre. "Relativa al objetivo de la cámara" se iba fuera de plano.
    assert "const elevacionObjetivo = 0" in capa and "getCameraTargetElevation()" not in capa
    # Viewport entero y sin recorte; la profundidad se limpia SOLO para la
    # segunda pasada: el cuerpo lo tapa el monte, el cartel no.
    assert "renderer.setScissorTest(false)" in capa
    assert "camara.layers.set(1)" in capa and "numero.layers.set(1)" in capa
    # El icono del tipo va dentro del cartel: suelto era de 1,2 m y no se leía.
    assert "g.drawImage(lienzoIcono(tipo)" in capa
    # Tamaño de pantalla constante, medido con la matriz: con el mapa
    # inclinado, los píxeles por metro del suelo mienten y un nodo cercano
    # llegaba a tapar la pantalla.
    # Tamaño que depende SÓLO del zoom: medir cada nodo con la perspectiva
    # hacía que cada uno cambiara de tamaño a su aire al girar (parpadeo).
    assert "escalaPorZoom(p, zoomActual)" in capa and "makeScale(s * k, -s * k, s * k)" in capa
    assert "Math.pow(2, (17 - zoom) * 0.85) * menguaPorZoom(zoom)" in capa and "medirPx" not in capa
    # Bolas: una esfera no se deforma al girar ni al acercarse. Flota con
    # fase propia y la peana lleva la forma del tipo.
    assert "new THREE.SphereGeometry(R, 64, 44)" in capa and "fase: Math.random()" in capa
    assert "const flota = p.altura + 0.22 * Math.sin(t * 1.1 * v + p.fase)" in capa
    # El aro del suelo es un degradado, no geometría de dos píxeles; y la
    # cota se toma con el mapa quieto, que en movimiento daba saltos.
    assert "function texturaBrillo(" in capa and "RingGeometry" not in capa
    assert "(sinCota || (!enMovimiento && ahora - p.elevacionEn > 500))" in capa
    # Sonda de un metro como punto de partida: del factor anterior, al
    # acercarse la punta quedaba detrás de la cámara y el factor se clavaba
    # (618 m medidos a zoom 19,4).
    # En 3D, modelos a cualquier zoom: Óscar no quiere chinchetas planas
    # "en 2D dentro del 3D". Y el cuerpo se pinta entero, sin que la malla
    # basta del terreno se coma trozos al mover la cámara.
    assert "const tope = ALTURA_MAX_MUNDO / alturaTotal(p)" in capa
    assert "export const ZOOM_MINIMO_3D = 0" in capa
    assert "renderer.clear(true, true, false)" in capa and "renderer.clearDepth()" in capa
    # Cota al instante: el arrastre hacía subir y bajar el modelo al hacer zoom.
    assert "p.elevacion + (e - p.elevacion)" not in capa
    assert "setLayoutProperty(CAPA_NODOS_ICONOS, 'icon-offset', [0, enTresD ? DESPLAZAMIENTO_ANCLA_PX : 0])" in fonte
    # Cuatro formas, una por clase de nodo: sin el coleccionable los diez
    # nodos de la ruta real salían iguales.
    assert "'coleccionable'" in capa and "alto, 6)" in capa
    # El cielo de Mercator está en +z: la hemisférica apuntando a +y dejaba el cuerpo gris.
    assert "cielo.position.set(0, 0, 1)" in capa
    # Determinante negativo en Mercator: sin invertir las caras, WebGL
    # descartaba las delanteras (número, icono y anillos invisibles).
    assert "invertirCaras(malla.geometry)" in capa and "malla.frustumCulled = false" in capa
    assert "p.grupo.matrixWorldNeedsUpdate = true" in capa, (
        "con matrixAutoUpdate apagado, sin esto los modelos se quedan en el origen"
    )
    assert "function formaDelTipo(" in capa and "c.rotation.set(-(Math.PI / 2 - inclinacion), -rumbo, 0, 'YXZ')" in capa
    # La capa three.js en vivo NO va al mapa (serrada y parpadeando en el
    # móvil). En 3D, objetos 3D renderizados una vez como símbolos.
    assert "vivo.addLayer(capaNodosRef.current.capa)" not in fonte
    assert "renderizarBola(Number(bola3d[1]), estado3d, tipo3d, 'base')" in fonte
    assert "['get', enTresD ? 'icono3d' : 'icono']" in fonte
    bola = (COMPONENTE.parent / "bolaRenderizada.ts").read_text(encoding="utf-8")
    assert "antialias: true" in bola and "new THREE.OrthographicCamera(" in bola
    # Un objeto por tipo: bandera, panel QR, gema con destello, dado. "Todos
    # iguales" ya no: la silueta distingue, no una chapa pequeña.
    # Poképarada (boceto A elegido): color = tipo, cubo con el icono,
    # moneda con el número en su propia capa, que flota.
    assert "COLOR_TIPO" in bola and "new RoundedBoxGeometry(" in bola and "new RoomEnvironment()" in bola
    assert "id: CAPA_NODOS_MONEDA" in fonte and "setPaintProperty(CAPA_NODOS_MONEDA, 'icon-translate'" in fonte
    assert "'moneda')" in fonte and "'base') ?? dibujarBola(" in fonte
    # La red de caminos NO se baja en la pasada de fondo (la pide el worker),
    # y sólo se baja si no está ya guardada.
    pack = (COMPONENTE.parents[1] / "offline" / "mapTileCache.ts").read_text(encoding="utf-8")
    assert "if (opciones.redDeCaminos !== false) await descargarRedDeCaminos(onProgress)" in pack
    assert "caches.open(ROAD_GRAPH_CACHE)" in pack
    app = (COMPONENTE.parents[1] / "PlayerApp.tsx").read_text(encoding="utf-8")
    assert "void guardarMapa(false)" in app and "await guardarMapa(true)" in app
    # Sin círculo del radio de entrada ("cutre"): la capa de relleno no existe.
    assert "id: CAPA_RADIO_RELLENO" not in fonte
    # Los símbolos van tres metros sobre el suelo: con relieve, el anclaje
    # bajo la malla basta del terreno los escondía "a veces".
    assert fonte.count("'symbol-height-offset': ALTURA_SIMBOLOS_M") == 5
    assert "samples: muestrasMaximas()" in capa and "renderer.render(escenaVolcado, camaraVolcado)" in capa
    # Sin peana (en cuesta se enterraba) y mástil grueso (fino se veía translúcido).
    assert "const peana" not in capa and "CylinderGeometry(0.2, 0.26, H - 0.2, 16)" in capa
    assert "blendSrc: THREE.OneFactor" in capa and "blendDst: THREE.OneMinusSrcAlphaFactor" in capa
    assert "function dibujarBola(" in fonte and "function dibujarHalo(" in fonte
    assert "mapa.addImage(evento.id, imagen, { pixelRatio: 3 })" in fonte
    assert "id: CAPA_NODOS_HALO" in fonte and "setPaintProperty(CAPA_NODOS_HALO, 'icon-opacity'" in fonte
    assert "antialias: true" not in fonte and "maxZoom: 19.5," in fonte
    # Repintado a treinta por segundo: ni a tirones ni sin parar.
    assert "}, 33)" in capa and "}, 50)" not in capa
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


def test_un_coleccionable_non_e_un_minixogo_calquera() -> None:
    """
    La forma del nodo en el mapa sale de `kind`, y un coleccionable tiene la
    suya. Los diez nodos de la ruta real son minijuegos por interacción;
    cinco de ellos llevan algo que recoger, y sin esto salían idénticos.
    """
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from backend.app.runtime.mision import kind_del_nodo

    assert kind_del_nodo({"interaction": {"type": "checkpoint"}}) == "checkpoint"
    assert kind_del_nodo({"interaction": {"type": "qr_code"}}) == "qr"
    assert kind_del_nodo({"interaction": {"type": "signal_hunt"}}) == "minijuego"
    assert (
        kind_del_nodo({"interaction": {"type": "signal_hunt"}, "physical_node_kind": "collectible"})
        == "coleccionable"
    )
    assert kind_del_nodo({"interaction": {"type": "signal_hunt"}, "is_map_collectible": True}) == "coleccionable"
    # Lo que hay de verdad en la ruta: el motor normaliza "checkpoint" a
    # signal_hunt + simple_checkpoint y "qr_collectible" a circuit_matrix +
    # qr_collectible. Un QR con objeto EN EL MAPA es coleccionable; sin él, QR.
    assert kind_del_nodo({"interaction": {"type": "signal_hunt", "config": {"game_id": "simple_checkpoint"}}}) == "checkpoint"
    assert (
        kind_del_nodo(
            {"interaction": {"type": "circuit_matrix", "config": {"game_id": "qr_collectible"}}, "physical_node_kind": "collectible"}
        )
        == "qr"
    )
    assert (
        kind_del_nodo(
            {
                "interaction": {"type": "circuit_matrix", "config": {"game_id": "qr_collectible", "is_map_collectible": True}},
                "physical_node_kind": "collectible",
            }
        )
        == "coleccionable"
    )
    assert kind_del_nodo({"interaction": {"type": "circuit_matrix", "config": {"game_id": "tilt_maze"}}}) == "minijuego"


def test_a_barra_de_carga_non_parpadea() -> None:
    """
    Cada fase mandaba su cuenta: la comprobación 0-100, la descarga otra vez
    0-100 y entre medias tramos sin total, que ponían la barra en modo
    indeterminado. Una sola escala, sin retrocesos y sin brincos.
    """
    app = (COMPONENTE.parents[1] / "PlayerApp.tsx").read_text(encoding="utf-8")
    # Número sólo en la descarga real; el resto, barra animada sin cifra.
    assert "const descargando = hayTotal && mapProgress?.label === 'Mapa offline'" in app
    assert "const ratio = descargando ? ultimoRatioRef.current : undefined" in app
    assert "TRAMOS" not in app


def test_a_guia_non_pinta_unha_recta_mentres_carga_a_rede() -> None:
    """
    Fuera del trazado, el tramo de ti al camino se pintaba recto y se
    recolocaba al terminar la descarga de la red de caminos.
    """
    fonte = COMPONENTE.read_text(encoding="utf-8")
    assert "let esperandoCaminos = false" in fonte
    # La red se pide desde el principio, no después de pintar el mapa.
    assert fonte.index("void redRef.current?.cargar()") > fonte.index("}, 250)")
    assert "...(esperandoCaminos ? [] :" in fonte
