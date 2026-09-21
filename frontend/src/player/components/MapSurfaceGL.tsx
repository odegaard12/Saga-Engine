import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import urlDelWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * EL fallo de toda la migración, y el más silencioso.
 *
 * MapLibre v6 hace su trabajo pesado en un web worker que carga como
 * módulo desde una URL calculada AL LADO de su propio chunk:
 * `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Vite no copia
 * ese fichero porque nadie lo importa, así que la petición devolvía 404
 * -los dos 404 sin explicar de cada carga- y el worker moría sin decir
 * una palabra.
 *
 * Todo lo que pasa por el worker estuvo muerto desde 5.10: las fuentes
 * GeoJSON (trazado, radio, extrusión, símbolos) y la decodificación del
 * relieve. Las teselas satélite y los marcadores del DOM no lo usan, y
 * por eso eran lo único que se veía. Tuvo pinta de bug de datos, de bug
 * de eventos, de bug de posición y de bug del móvil, y no era ninguno.
 *
 * Y no vale con `?url`: ese worker hace a su vez
 * `import "./maplibre-gl-shared.mjs"`, que tampoco estaría. Con
 * `?worker&url` Vite empaqueta el worker CON lo que importa en un único
 * fichero con hash en `/assets/`, y aquí se le da a MapLibre esa
 * dirección. Mismo origen, mismo caché offline que el resto.
 */
maplibregl.setWorkerUrl(urlDelWorker)
import type { FieldProof, PlayerStage } from '../../types/player'
import {
  getPlayerAvatarInitials,
  getPlayerAvatarUrl,
  getPlayerColor,
} from '../../shared/playerIdentity'
import type { MapSurfacePropsGL } from './mapSurfaceContract'

/**
 * El mapa, en WebGL. Motor NUEVO, en paralelo al de Leaflet.
 *
 * Por qué existe: Leaflet dibuja el mapa como un mosaico de <img> que
 * reposiciona con `transform` en cada gesto. Eso trae de serie tres cosas
 * que llevamos una sesión entera parcheando sin poder cerrarlas: el zoom
 * va por niveles enteros (de 17 a 16, un salto), las teselas contiguas
 * dejan costuras de subpíxel al escalar, y cada nivel nuevo pide un juego
 * de imágenes distinto -blanco mientras llegan-. Son límites del enfoque,
 * no fallos sueltos. Aquí lo dibuja la GPU: zoom continuo, sin costuras.
 *
 * ⚠️ NO sustituye a MapSurface.tsx todavía. Se elige con `map_engine` en
 * la configuración de la misión, y por defecto manda Leaflet. La lista de
 * capas que faltan está en `mapSurfaceContract.ts`.
 *
 * Las teselas son LAS MISMAS que usa Leaflet (`/map-tiles/{z}/{x}/{y}.png`,
 * el proxy con caché en disco): el modo sin cobertura sigue valiendo tal
 * cual -mismo origen, mismas URL, mismo service worker-, y este cambio no
 * arrastra una migración de datos.
 */

const FUENTE_TESELAS = 'saga-raster'
const CAPA_TESELAS = 'saga-raster-capa'
const FUENTE_RELIEVE = 'saga-relieve'
const CAPA_SOMBRAS = 'saga-sombras'
const FUENTE_RADIO = 'saga-radio'
const CAPA_RADIO_RELLENO = 'saga-radio-relleno'
const CAPA_RADIO_BORDE = 'saga-radio-borde'
const FUENTE_RUTA = 'saga-ruta'
const CAPA_RUTA = 'saga-ruta-linea'
const CAPA_RUTA_BORDE = 'saga-ruta-borde'
const FUENTE_NODOS_VOLUMEN = 'saga-nodos-volumen'
const FUENTE_RELIEVE_SOMBRAS = 'saga-relieve-sombras'
const FUENTE_NODOS_ICONOS = 'saga-nodos-iconos'
const CAPA_NODOS_ICONOS = 'saga-nodos-iconos-capa'
const CAPA_NODOS_VOLUMEN = 'saga-nodos-volumen-capa'

/**
 * Los colores de los alfileres NO siguen al tema, igual que en Leaflet.
 *
 * Ahí el color dice si un nodo está hecho, si es el que toca o si falta:
 * es información, no decoración, y cambiarla por tema obligaría a
 * reaprender el mapa. Son los mismos valores que `--theme-pin-*` declara
 * idénticos en los tres temas (ver mobile-themes.css).
 */
const COLOR_NODO_HECHO = '#22c55e'
const COLOR_NODO_ACTUAL = '#3b82f6'
const COLOR_NODO_PENDIENTE = '#ef4444'

const PITCH_3D = 55

type Punto = { lat: number; lon: number }

/**
 * El radio de un nodo, como polígono de verdad.
 *
 * MapLibre sabe pintar círculos, pero su radio va en PÍXELES: al alejarse
 * el círculo seguiría midiendo lo mismo en pantalla y dejaría de
 * significar "50 metros a la redonda", que es justo lo único que ese
 * círculo tiene que decir. Un polígono en coordenadas sí escala con el
 * mapa porque está en el terreno, no en la pantalla.
 */
function circuloGeoJSON(centro: Punto, radioMetros: number, lados = 64) {
  const coords: [number, number][] = []
  const radioLat = radioMetros / 111320
  const radioLon = radioMetros / (111320 * Math.cos((centro.lat * Math.PI) / 180))

  for (let i = 0; i <= lados; i += 1) {
    const angulo = (i / lados) * Math.PI * 2
    coords.push([centro.lon + radioLon * Math.cos(angulo), centro.lat + radioLat * Math.sin(angulo)])
  }

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
      },
    ],
  }
}

/**
 * Trazado guardado en administración para llegar a un nodo (`route_track`).
 *
 * Mismo lector que el motor de Leaflet, y acepta las mismas dos formas en
 * que se ha ido guardando: pares [lat, lon] y objetos con lat/lon.
 */
function leerTrackDelNodo(stage: PlayerStage): Punto[] {
  const salida: Punto[] = []
  const crudo = (stage as unknown as Record<string, unknown>).route_track
  if (!Array.isArray(crudo)) return salida

  for (const punto of crudo) {
    let lat: number | null = null
    let lon: number | null = null

    if (Array.isArray(punto) && punto.length >= 2) {
      lat = Number(punto[0])
      lon = Number(punto[1])
    } else if (punto && typeof punto === 'object') {
      const p = punto as Record<string, unknown>
      lat = Number(p.lat ?? p.latitude)
      lon = Number(p.lon ?? p.lng ?? p.longitude)
    }

    if (lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)) {
      salida.push({ lat, lon })
    }
  }

  return salida
}

const COLECCION_VACIA = { type: 'FeatureCollection' as const, features: [] }

/**
 * Dibuja una chincheta con el número dentro, en un canvas.
 *
 * A doble resolución (`pixelRatio: 2` al registrarla) para que no salga
 * borrosa en un móvil. Forma: cabeza redonda con luz arriba y borde
 * oscuro, punta hacia abajo, y una sombra elíptica en el suelo que es lo
 * que la hace parecer CLAVADA y no pegada a la pantalla.
 */
function dibujarChincheta(numero: string, color: string): ImageData | null {
  const ancho = 56
  const alto = 72
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * 2
  lienzo.height = alto * 2
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)

  // Sombra en el suelo, bajo la punta.
  ctx.save()
  ctx.translate(ancho / 2, alto - 4)
  ctx.scale(1, 0.38)
  const sombra = ctx.createRadialGradient(0, 0, 2, 0, 0, 16)
  sombra.addColorStop(0, 'rgba(0,0,0,.55)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(0, 0, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Cuerpo: círculo arriba + punta abajo, en un solo trazo.
  const cx = ancho / 2
  const cy = 24
  const r = 19
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.2, false)
  ctx.lineTo(cx, alto - 6)
  ctx.closePath()
  const luz = ctx.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, r + 6)
  luz.addColorStop(0, 'rgba(255,255,255,.55)')
  luz.addColorStop(0.35, color)
  luz.addColorStop(1, 'rgba(0,0,0,.45)')
  ctx.fillStyle = luz
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#0b1220'
  ctx.stroke()

  // Disco claro para que el número se lea sobre cualquier color.
  ctx.beginPath()
  ctx.arc(cx, cy, 12.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,.92)'
  ctx.fill()

  ctx.fillStyle = '#0b1220'
  ctx.font = `900 ${numero.length > 1 ? 14 : 16}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(numero, cx, cy + 0.5)

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * El estilo del mapa, declarado en crudo y NO por URL.
 *
 * Una URL de estilo sería una petición más que falla sin cobertura, justo
 * lo que no puede pasar en el monte. Sin tipografías ni iconos externos por
 * el mismo motivo: cada recurso de fuera es otra cosa que puede faltar.
 *
 * Es una función y no una constante porque hace falta poder volver a
 * aplicarlo si el montaje se queda a medias (ver el vigilante de abajo).
 */
function estiloDelMapa(): maplibregl.StyleSpecification {
  return {
    version: 8,
      sources: {
        [FUENTE_TESELAS]: {
          type: 'raster',
          tiles: [`${window.location.origin}/map-tiles/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 19,
          attribution: '&copy; Esri',
        },
        /**
         * Elevación del terreno. Esto es lo que hace que se vea el
         * DESNIVEL: inclinar la cámara sobre una foto plana no es 3D,
         * es la misma foto vista de lado.
         *
         * `maxzoom: 15` porque es hasta donde llega Terrarium. Sin ese
         * tope, al acercarse MapLibre pide teselas que no existen y el
         * relieve desaparece justo cuando más cerca estás.
         */
        /**
         * El radio y el trazado nacen aquí, vacíos.
         *
         * Declararlos en el estilo -y no añadirlos después- es lo que
         * mata de raíz el fallo que costó tres versiones: al añadirlos
         * al vuelo hay que esperar a que el estilo esté montado, y
         * ninguna de las dos señales de MapLibre sirve a ciegas. El
         * evento `style.load` YA ha ocurrido cuando enganchas el
         * escuchador, porque el estilo va en línea y se monta dentro del
         * constructor; e `isStyleLoaded()` es más estricto que el
         * evento, porque exige además que carguen todas las fuentes.
         * Entre las dos, el código se quedaba en tierra de nadie.
         *
         * Naciendo con el estilo, existen desde el primer fotograma.
         */
        [FUENTE_RADIO]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_RUTA]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_NODOS_VOLUMEN]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_NODOS_ICONOS]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_RELIEVE]: {
          type: 'raster-dem',
          tiles: [`${window.location.origin}/dem-tiles/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        },
        [FUENTE_RELIEVE_SOMBRAS]: {
          type: 'raster-dem',
          tiles: [`${window.location.origin}/dem-tiles/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 15,
          encoding: 'terrarium',
        },
      },
      layers: [
        { id: CAPA_TESELAS, type: 'raster', source: FUENTE_TESELAS },
        // Sombreado de laderas: marca el relieve aunque la foto satélite
        // sea plana. Sin esto el monte está ahí pero no se lee.
        {
          id: CAPA_SOMBRAS,
          type: 'hillshade',
          source: FUENTE_RELIEVE_SOMBRAS,
          /**
         * Sombreado fuerte a propósito.
         *
         * A la altura a la que se juega -zoom 17-18, unos cientos de
         * metros de ancho- el desnivel REAL de un valle son unos pocos
         * metros: geométricamente correcto e invisible. El sombreado de
         * laderas es lo que hace legible la forma del terreno a esa
         * escala, más que la propia malla.
         */
        paint: {
          'hillshade-exaggeration': 0.85,
          /**
           * Sombra azulada y luz cálida, como en los mapas de montaña.
           *
           * Con los colores por defecto (gris sobre gris) el sombreado se
           * funde con la foto satélite y el monte se lee plano aunque la
           * malla esté levantada. El contraste de color es lo que hace
           * que una ladera "se vea" desde arriba.
           */
          // Sombras del TERRENO, no del tema: una ladera a la sombra es
          // azul oscura con cualquier piel de la app. (no-tema)
          'hillshade-shadow-color': '#0f172a', // no-tema
          'hillshade-highlight-color': '#fef3c7',
          'hillshade-accent-color': '#1e293b', // no-tema
          'hillshade-illumination-direction': 315,
        },
        },
        {
        id: CAPA_RADIO_RELLENO,
        type: 'fill',
        source: FUENTE_RADIO,
        paint: { 'fill-color': COLOR_NODO_ACTUAL, 'fill-opacity': 0.32 },
        },
        {
        id: CAPA_RADIO_BORDE,
        type: 'line',
        source: FUENTE_RADIO,
        // 3 px y blanco al borde: sobre foto aérea con sol, una línea
        // azul de 2 px se perdía. El radio dice a qué distancia entras
        // en el nodo; si no se ve, no sirve de nada.
        /**
         * Borde a trazos: un círculo continuo se confunde con una rotonda
         * o un depósito de la propia foto satélite. A trazos se lee como
         * lo que es -una marca del juego, no algo del terreno-.
         */
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0.95,
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2.5, 17, 4.5, 19, 7],
          // Sin trazos: las líneas a trazos tienen historial de no pintarse
          // bien sobre relieve en MapLibre, y aquí lo primero es que se vea.
        },
        },
        {
        id: CAPA_RUTA_BORDE,
        type: 'line',
        source: FUENTE_RUTA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0b1220',
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 9, 19, 15],
        },
        },
        {
        /**
         * ESTO es 3D de verdad, y no un dibujo que lo imita.
         *
         * Los alfileres del DOM son calcomanías pegadas a la pantalla: no
         * se inclinan con la cámara, no los tapa una loma y al girar el
         * mapa siguen mirando de frente. Da igual cuánta sombra se les
         * pinte, nunca van a parecer parte del terreno.
         *
         * Un volumen extruido sí es geometría dentro del mapa: se levanta
         * del suelo, se inclina con la vista, lo esconde el monte que
         * tiene delante y crece en perspectiva al acercarse. El alfiler
         * con el número se queda encima, legible, que para leer un número
         * una calcomanía es justo lo que hace falta.
         */
        id: CAPA_NODOS_VOLUMEN,
        type: 'fill-extrusion',
        source: FUENTE_NODOS_VOLUMEN,
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'altura'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.92,
        },
      },
      {
        id: CAPA_RUTA,
        type: 'line',
        source: FUENTE_RUTA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        /**
         * Grosor por zoom y no fijo.
         *
         * La ruta se dibuja sobre FOTO SATÉLITE: sobre asfalto claro o
         * sobre arena, un hilo blanco translúcido desaparece. De ahí que
         * antes "no se viera el trazado" aunque estuviera pintado.
         *
         * Va acompañada de una línea oscura por debajo (CAPA_RUTA_BORDE)
         * que hace de contorno; es el mismo truco que usan las apps de
         * senderismo para que la traza se lea sobre cualquier fondo.
         */
        paint: {
          'line-color': '#f8fafc',
          'line-opacity': 0.95,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 5.5, 19, 9],
        },
      },
      {
        /**
         * Los nodos como SÍMBOLOS del mapa, no como marcadores del DOM.
         *
         * Un marcador del DOM se coloca desde JavaScript, un fotograma
         * después de que el mapa se haya dibujado: con relieve y zoom, va
         * siempre por detrás del terreno -"se quedan mal y al soltar se
         * recolocan"-. Un símbolo lo pinta el propio motor, en el mismo
         * fotograma y sobre la altura correcta del terreno.
         *
         * La imagen de cada chincheta se dibuja en un canvas al vuelo, con
         * el número horneado dentro (ver `styleimagemissing`): así no hace
         * falta ninguna fuente de letras externa, que sería una petición
         * más que falla sin cobertura.
         */
        id: CAPA_NODOS_ICONOS,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        layout: {
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // Billboard: siempre de frente, como una chincheta clavada que
          // miras desde cualquier lado. Pegarla al plano del mapa la
          // aplastaría con la inclinación.
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.45, 15, 0.7, 17, 0.95, 19, 1.2],
          // El nodo en juego se pinta el último: queda encima si se solapan.
          'symbol-sort-key': ['get', 'orden'],
        },
      },
    ],
      /**
       * Exageración 1.5: el desnivel real de la ruta es suave y a escala
       * exacta, desde el aire, casi no se aprecia. Subirlo más convierte
       * el monte en una sierra que no existe.
       */
      terrain: { source: FUENTE_RELIEVE, exaggeration: 2.2 },
  }
}

export function MapSurfaceGL({
  className,
  currentStage,
  missionStages,
  currentLevel = 0,
  playerPosition,
  initialCenter,
  tresD = true,
  fieldProofs,
  onOpenFieldProofs,
  selfProfile,
}: MapSurfacePropsGL) {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<maplibregl.Map | null>(null)
  const marcadorXogadorRef = useRef<maplibregl.Marker | null>(null)
  const marcadoresNodosRef = useRef<maplibregl.Marker[]>([])
  const marcadoresFotosRef = useRef<maplibregl.Marker[]>([])

  /** Lo último que se mandó pintar a cada fuente, para poder reintentarlo. */
  const ultimoDatoRef = useRef(new Map<string, GeoJSON.FeatureCollection>())
  /** La ruta se encuadra una vez al entrar, no cada vez que llegan datos. */
  const encuadreInicialRef = useRef(false)
  /** Sube cuando hay que repintar todo: el estilo se rehizo por debajo. */
  const [versionEstilo, setVersionEstilo] = useState(0)
  /** Qué foto y color tiene ya pintados el avatar, para no rehacerlo en balde. */
  const fichaAvatarRef = useRef('')

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return

    const centro =
      initialCenter ||
      (currentStage?.lat != null && currentStage?.lon != null
        ? { lat: currentStage.lat, lon: currentStage.lon }
        : { lat: 42.4333, lon: -8.65 })

    const mapa = new maplibregl.Map({
      container: contenedorRef.current,
      center: [centro.lon, centro.lat],
      zoom: 16,
      // Inclinado ya al abrir, no animándose desde plano: con la vista 3D
      // por defecto, empezar en plano y bascular al montar se ve como un
      // tirón cada vez que entras.
      pitch: tresD ? PITCH_3D : 0,
      attributionControl: false,
      // El estilo va declarado en crudo, NO por URL: una URL de estilo
      // sería una petición más que falla sin cobertura, justo lo que no
      // puede pasar en el monte. Sin sprites ni fuentes por el mismo
      // motivo: cada recurso externo es otra cosa que puede faltar.
      style: estiloDelMapa(),
    })

    mapaRef.current = mapa

    /**
     * Imagen de chincheta dibujada al vuelo.
     *
     * MapLibre pide la imagen la primera vez que una capa la nombra y no
     * la tiene. Se dibuja aquí en un canvas, con el número horneado, y se
     * registra. Funciona igual tras un rehecho del estilo -que borra las
     * imágenes-: las pide otra vez y se vuelven a dibujar.
     *
     * Formato del nombre: `nodo-<número>-<estado>`.
     */
    mapa.on('styleimagemissing', (evento) => {
      const partes = /^nodo-(\d+)-(hecho|actual|pendiente)$/.exec(evento.id)
      if (!partes) return
      if (mapa.hasImage(evento.id)) return
      const color =
        partes[2] === 'hecho'
          ? COLOR_NODO_HECHO
          : partes[2] === 'actual'
            ? COLOR_NODO_ACTUAL
            : COLOR_NODO_PENDIENTE
      const imagen = dibujarChincheta(partes[1], color)
      if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 2 })
    })

    /**
     * Vigilante: si el estilo no montó, volver a aplicarlo.
     *
     * MapLibre v6 monta el estilo dentro de un `requestAnimationFrame`. Un
     * navegador NO ejecuta fotogramas en una pestaña que no se está
     * pintando, así que si el mapa se crea con la pantalla bloqueada o con
     * la app en segundo plano -algo normalísimo durante los segundos que
     * tarda la descarga offline- ese fotograma no llega, el estilo se
     * queda sin montar y el mapa se ve EN BLANCO, con los nodos flotando
     * encima porque son marcadores del DOM y esos sí aparecen.
     *
     * No da ningún error ni se recupera solo si el fotograma pendiente se
     * perdió. Volver a aplicar el estilo al recuperar visibilidad cuesta
     * nada y evita quedarse mirando un mapa vacío en mitad del monte.
     */
    /**
     * Volcar en el mapa lo que no cupo antes.
     *
     * `styledata` salta cada vez que el estilo cambia de estado, incluida
     * la primera vez que termina de montarse. Es el momento exacto en que
     * las fuentes pasan a existir y hay que rellenarlas con lo que ya se
     * había calculado mientras tanto.
     */
    const volcarPendientes = () => {
      const vivo = mapaRef.current
      if (!vivo) return
      for (const [id, datos] of ultimoDatoRef.current) {
        const fuente = vivo.getSource(id) as maplibregl.GeoJSONSource | undefined
        fuente?.setData(datos)
      }
    }
    mapa.on('styledata', volcarPendientes)

    let rescates = 0
    const vigilarEstilo = () => {
      const vivo = mapaRef.current
      if (!vivo || document.visibilityState !== 'visible') return
      /**
       * `isStyleLoaded()` NO vale aquí: es `false` cada vez que hay una
       * tesela cargando, o sea, en cada zoom. Con esa comprobación el
       * vigilante rehacía el estilo entero hasta cinco veces sobre un
       * mapa sano: vaciaba las fuentes, recargaba teselas y descolocaba
       * los marcadores -"carga raro y al soltar se recoloca"-. Lo que
       * importa es si el estilo llegó a montarse, y eso se ve en si tiene
       * capas.
       */
      let capas = 0
      try {
        capas = vivo.getStyle().layers.length
      } catch {
        capas = 0
      }
      if (capas > 0) return
      // Cinco intentos y basta: si a estas alturas no monta, el problema no
      // es el fotograma perdido y reintentar en bucle solo gasta batería.
      if (rescates >= 5) return
      rescates += 1
      try {
        vivo.setStyle(estiloDelMapa())
        // El estilo nuevo nace con las fuentes vacías, así que hay que
        // volver a meterles los datos que ya se habían calculado.
        vivo.once('styledata', () => setVersionEstilo((v) => v + 1))
      } catch {
        // Si el mapa ya no existe, no hay nada que rescatar.
      }
    }
    document.addEventListener('visibilitychange', vigilarEstilo)
    const relojVigilante = window.setInterval(vigilarEstilo, 4000)

    if (
      new URLSearchParams(window.location.search).has('depurar-mapa') ||
      // El banco de pruebas SIEMPRE necesita el asa: es su razón de ser, y
      // pedírsela por parámetro llegaba tarde -los efectos del hijo corren
      // antes que los del padre, así que el mapa miraba la dirección antes
      // de que el banco hubiera podido escribir el parámetro-.
      window.location.pathname === '/banco-mapa'
    ) {
      /**
       * Asa de depuración, solo con `?depurar-mapa=1` en la dirección.
       *
       * MapLibre no deja ninguna referencia al mapa accesible desde el
       * DOM, así que comprobar desde fuera si el terreno está puesto o qué
       * capas hay era imposible y se estaba verificando a ojo. Que es
       * exactamente como se colaron los fallos de esta pantalla.
       *
       * No se expone nunca por defecto: es una puerta abierta al mapa.
       */
      const ventana = window as unknown as {
        __sagaMapa?: maplibregl.Map
        __sagaEstilo?: () => maplibregl.StyleSpecification
      }
      ventana.__sagaMapa = mapa
      // El estilo también: en una pestaña que no pinta, MapLibre nunca
      // monta el estilo (espera un fotograma). Con esto se puede forzar
      // desde fuera y medir las capas de datos aunque nadie mire.
      ventana.__sagaEstilo = estiloDelMapa
    }

    return () => {
      mapa.off('styledata', volcarPendientes)
      document.removeEventListener('visibilitychange', vigilarEstilo)
      window.clearInterval(relojVigilante)
      marcadorXogadorRef.current?.remove()
      marcadorXogadorRef.current = null
      marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
      marcadoresNodosRef.current = []
      marcadoresFotosRef.current.forEach((marcador) => marcador.remove())
      marcadoresFotosRef.current = []
      mapa.remove()
      mapaRef.current = null
    }
    // Solo al montar, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Cambia los datos de una fuente, si el mapa está en condiciones. */
  /**
   * Cambia los datos de una fuente, y si no puede, se acuerda.
   *
   * ESTE era el fallo que se llevó media docena de versiones. La línea
   * anterior era `fuente?.setData(datos)`: si el estilo todavía no había
   * terminado de montarse, `getSource` devolvía nada, la interrogación se
   * tragaba la llamada y NO SE REINTENTABA JAMÁS. Los nodos llegan de la
   * API en menos de lo que tarda el estilo en montar, así que el trazado,
   * el radio y los volúmenes se perdían casi siempre.
   *
   * Y el síntoma engañaba: las teselas y el relieve se veían -van
   * declarados en el estilo, no necesitan que nadie les meta datos- y los
   * nodos y las fotos también -son marcadores del DOM-. Lo único que
   * faltaba era lo que hay que rellenar después. Sin un solo error.
   *
   * Ahora lo último de cada fuente se guarda siempre, y se vuelca en
   * cuanto el estilo está en condiciones.
   */
  const pintarFuente = useCallback(
    (id: string, datos: GeoJSON.FeatureCollection | typeof COLECCION_VACIA) => {
      ultimoDatoRef.current.set(id, datos as GeoJSON.FeatureCollection)
      const mapa = mapaRef.current
      if (!mapa) return
      const fuente = mapa.getSource(id) as maplibregl.GeoJSONSource | undefined
      fuente?.setData(datos as GeoJSON.FeatureCollection)
    },
    // `versionEstilo` no se usa dentro, pero al cambiar obliga a repintar
    // tras un rescate del estilo, que es justo lo que hace falta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [versionEstilo]
  )

  // Tu posición.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !playerPosition) return

    const lngLat: [number, number] = [playerPosition.lon, playerPosition.lat]

    const fichaActual = `${selfProfile?.avatar_url || ''}|${selfProfile?.color || ''}`
    if (marcadorXogadorRef.current && fichaAvatarRef.current !== fichaActual) {
      // Cambió la foto o el color: el elemento se construye una vez, así
      // que hay que tirarlo y rehacerlo.
      marcadorXogadorRef.current.remove()
      marcadorXogadorRef.current = null
    }

    if (!marcadorXogadorRef.current) {
      /**
       * TÚ eres un avatar con tu foto, no una chincheta.
       *
       * Aquí estuvo el marcador por defecto de MapLibre y era un error de
       * lectura, no de estética: en un mapa lleno de chinchetas numeradas,
       * una chincheta más no dice "este eres tú". La foto sí, y de un
       * vistazo -que es justo lo que haces mientras caminas-.
       */
      const color = getPlayerColor(selfProfile || {})
      const foto = getPlayerAvatarUrl(selfProfile || {})
      const iniciales = getPlayerAvatarInitials(selfProfile || {})

      const avatar = document.createElement('div')
      avatar.setAttribute('aria-label', 'Tu posición')
      Object.assign(avatar.style, {
        width: '46px',
        height: '46px',
        borderRadius: '999px',
        border: `3px solid ${color}`,
        background: foto ? `#0b1220 center/cover url(${foto})` : color,
        // Halo del color del jugador: lo separa del terreno sea cual sea
        // la foto satélite de debajo, clara u oscura.
        boxShadow: `0 0 0 4px ${color}55, 0 6px 16px rgba(0,0,0,.55)`,
        display: 'grid',
        placeItems: 'center',
        color: '#ffffff',
        font: '950 15px system-ui, sans-serif',
        overflow: 'hidden',
      } as Partial<CSSStyleDeclaration>)
      if (!foto) avatar.textContent = iniciales

      fichaAvatarRef.current = fichaActual
      marcadorXogadorRef.current = new maplibregl.Marker({ element: avatar })
        .setLngLat(lngLat)
        .addTo(mapa)
      return
    }

    marcadorXogadorRef.current.setLngLat(lngLat)
    // Si cambia la ficha (foto nueva, otro color) hay que rehacer el
    // avatar: el elemento del marcador se construye una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPosition?.lat, playerPosition?.lon, selfProfile?.avatar_url, selfProfile?.color])

  // Radio del nodo actual.
  useEffect(() => {
    if (currentStage?.lat == null || currentStage?.lon == null) {
      pintarFuente(FUENTE_RADIO, COLECCION_VACIA)
      return
    }

    const radio = typeof currentStage.radius === 'number' && currentStage.radius > 0
      ? currentStage.radius
      : 30

    pintarFuente(
      FUENTE_RADIO,
      circuloGeoJSON({ lat: currentStage.lat, lon: currentStage.lon }, radio)
    )
  }, [currentStage?.lat, currentStage?.lon, currentStage?.radius, pintarFuente])

  /**
   * Los nodos van como marcadores del DOM, NO como capa de círculos.
   *
   * Con el relieve activado, una capa de círculos queda ENTERRADA bajo la
   * malla del terreno: el mapa se veía bien y los nodos no aparecían por
   * ningún lado -reportado en el móvil, y costó encontrarlo porque no da
   * ningún error: se dibujan, pero por debajo del monte-.
   *
   * Un marcador del DOM va por encima del lienzo siempre, lo tape lo que
   * lo tape, y además permite ponerle el número dentro, como en el motor
   * de Leaflet. Son diez, no diez mil: el coste de tenerlos en el DOM es
   * irrelevante aquí.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
    marcadoresNodosRef.current = []

    const nodos = (Array.isArray(missionStages) ? missionStages : []).filter(
      (nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number'
    )

    const estado = (indice: number) =>
      indice < currentLevel ? 'hecho' : indice === currentLevel ? 'actual' : 'pendiente'

    pintarFuente(FUENTE_NODOS_ICONOS, {
      type: 'FeatureCollection',
      features: nodos.map((nodo, indice) => ({
        type: 'Feature' as const,
        properties: {
          icono: `nodo-${indice + 1}-${estado(indice)}`,
          orden: indice === currentLevel ? 1000 : indice,
        },
        geometry: { type: 'Point' as const, coordinates: [nodo.lon as number, nodo.lat as number] },
      })),
    })

    /**
     * El volumen de cada nodo: un poste corto que sale del suelo.
     *
     * Radio pequeño y altura en METROS, no en píxeles: así la perspectiva
     * lo trata como lo que dice ser -algo plantado en el terreno- y crece,
     * se inclina y se tapa solo, sin una línea de código que lo simule.
     */
    /**
     * Bajo cada chincheta, un disco de metro y medio de alto pegado al
     * terreno: es geometría del mapa, así que se inclina, se tapa y se
     * escala con el relieve. Da la lectura de "clavada AHÍ" sin levantar
     * un poste que tape el icono. El del nodo en juego es más ancho.
     */
    pintarFuente(FUENTE_NODOS_VOLUMEN, {
      type: 'FeatureCollection',
      features: nodos.map((nodo, indice) => ({
        type: 'Feature' as const,
        properties: {
          color:
            indice < currentLevel
              ? COLOR_NODO_HECHO
              : indice === currentLevel
                ? COLOR_NODO_ACTUAL
                : COLOR_NODO_PENDIENTE,
          base: 0,
          altura: 1.5,
        },
        geometry: circuloGeoJSON(
          { lat: nodo.lat as number, lon: nodo.lon as number },
          indice === currentLevel ? 7 : 4.5,
          24
        ).features[0].geometry,
      })),
    })

    /**
     * Abrir sobre el NODO ACTUAL, no sobre la ruta entera.
     *
     * Encuadrar los diez nodos de golpe sonaba bien y quedó fatal: a zoom
     * 13 la ruta entra en pantalla pero los alfileres, que tienen tamaño
     * fijo en píxeles, se amontonan en una fila de chinchetas sobre un
     * mapa de media Galicia. No informa de nada y parece roto.
     *
     * Lo que hace falta al abrir es "dónde tengo que ir ahora", así que se
     * abre encima del nodo en juego. Solo la primera vez y solo sin GPS:
     * en cuanto hay posición, manda ella.
     */
    if (!encuadreInicialRef.current && !playerPosition && currentStage?.lat != null) {
      encuadreInicialRef.current = true
      mapa.jumpTo({ center: [currentStage.lon as number, currentStage.lat as number], zoom: 17 })
    }

    /**
     * Trazado REAL, el que guarda administración en cada nodo
     * (`route_track`): sigue caminos de verdad.
     *
     * Aquí hubo una línea recta de nodo a nodo y se quitó porque mentía
     * -cruzaba el monte por donde no se puede andar-. Esto no: es el
     * mismo trazado que dibuja el motor de Leaflet, leído del mismo sitio.
     */
    const tramos = nodos
      .map((nodo) => leerTrackDelNodo(nodo))
      .filter((track) => track.length > 1)

    pintarFuente(
      FUENTE_RUTA,
      tramos.length > 0
        ? {
            type: 'FeatureCollection',
            features: tramos.map((track) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: {
                type: 'LineString' as const,
                coordinates: track.map((punto) => [punto.lon, punto.lat]),
              },
            })),
          }
        : COLECCION_VACIA
    )
    // `playerPosition` solo decide si procede encuadrar al entrar; no debe
    // rehacer los marcadores en cada paso que das.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionStages, currentLevel, currentStage?.lat, currentStage?.lon, pintarFuente])

  /**
   * Fotos de campo. Marcadores del DOM por lo mismo que los nodos: una
   * capa de MapLibre quedaría enterrada bajo el relieve, y además una foto
   * ES una miniatura, que es un elemento del DOM de toda la vida.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    marcadoresFotosRef.current.forEach((marcador) => marcador.remove())
    marcadoresFotosRef.current = []

    const fotos = (Array.isArray(fieldProofs) ? fieldProofs : []).filter(
      (foto) => typeof foto.lat === 'number' && typeof foto.lon === 'number'
    )

    fotos.forEach((foto) => {
      /**
       * La foto va dentro de un envoltorio, no suelta.
       *
       * MapLibre escribe el `transform` del elemento que le entregas para
       * colocarlo en pantalla; si el volcado 3D se pusiera ahí, lo
       * machacaría en cada fotograma. El envoltorio es de MapLibre y el
       * volcado va dentro.
       */
      const envoltorio = document.createElement('div')
      Object.assign(envoltorio.style, {
        transformOrigin: 'bottom center',
        cursor: 'pointer',
      } as Partial<CSSStyleDeclaration>)

      const elemento = document.createElement('button')
      elemento.type = 'button'
      elemento.setAttribute('aria-label', `Foto de ${foto.display_name || foto.user}`)
      Object.assign(elemento.style, {
        width: '46px',
        height: '46px',
        padding: '0',
        borderRadius: '10px',
        // Marco blanco grueso: la foto queda como una polaroid clavada en
        // el terreno, que es lo que hace que se lea como objeto y no como
        // una mancha de la propia imagen satélite.
        border: '3px solid #f8fafc',
        /**
         * SIN volcado falso.
         *
         * Aquí hubo un `rotateX` en CSS para que la foto pareciera tumbada
         * sobre el terreno. Es mentira y se nota: un giro de CSS no sigue
         * a la cámara del mapa, así que al desplazar o girar la foto se
         * queda inclinada hacia un lado que no corresponde a nada. Se veía
         * peor que plana.
         *
         * Lo que sí es 3D de verdad va en el mapa, no en el DOM: ver la
         * capa de postes extruidos de los nodos.
         */
        transformOrigin: 'bottom center',
        boxShadow: '0 2px 4px rgba(0,0,0,.45), 0 12px 16px -6px rgba(0,0,0,.6)',
        backgroundImage: `url(${foto.thumbnail_url || foto.image_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        cursor: 'pointer',
      } as Partial<CSSStyleDeclaration>)
      envoltorio.appendChild(elemento)

      elemento.addEventListener('click', (evento) => {
        evento.stopPropagation()
        // Se abren TODAS las de ese punto, no solo la tocada: en un nodo
        // suele haber varias y el visor ya sabe pasarlas.
        onOpenFieldProofs?.(
          fotos.filter((otra) => otra.lat === foto.lat && otra.lon === foto.lon)
        )
      })

      marcadoresFotosRef.current.push(
        new maplibregl.Marker({ element: envoltorio, anchor: 'bottom' })
          .setLngLat([foto.lon, foto.lat])
          .addTo(mapa)
      )
    })
  }, [fieldProofs, onOpenFieldProofs])

  /**
   * Los marcadores crecen al acercarse.
   *
   * Un tamaño fijo obliga a elegir entre "de lejos tapa media ruta" y "de
   * cerca no se distingue". Escalando con el zoom, de lejos son
   * señaladores discretos y de cerca la foto se ve de verdad.
   *
   * Se escala el elemento, no se recrean los marcadores: recrearlos en
   * cada fotograma de zoom haría parpadear el mapa entero.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    const escalar = () => {
      const zoom = mapa.getZoom()
      // 15 -> 0.8 ; 19 -> 1.6. Fuera de ese tramo se queda en los topes.
      const factor = Math.max(0.8, Math.min(1.6, 0.8 + (zoom - 15) * 0.2))
      for (const marcador of marcadoresFotosRef.current) {
        marcador.getElement().style.scale = String(factor)
      }
    }

    escalar()
    mapa.on('zoom', escalar)
    return () => {
      mapa.off('zoom', escalar)
    }
  }, [fieldProofs, missionStages])

  // 2D / 3D. Inclinar la cámara es gratis aquí -es la misma escena, otra
  // matriz- y no pide ni un dato más, así que funciona igual sin cobertura.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    mapa.easeTo({ pitch: tresD ? PITCH_3D : 0, duration: 420 })
  }, [tresD])

  return (
    <section className={['map-surface', className].filter(Boolean).join(' ')}>
      <div
        ref={contenedorRef}
        aria-label="Mapa de la misión (WebGL)"
        style={{ position: 'absolute', inset: 0 }}
      />

    </section>
  )
}

export default MapSurfaceGL
