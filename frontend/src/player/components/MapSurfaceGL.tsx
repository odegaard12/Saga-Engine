import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
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
        [FUENTE_RELIEVE]: {
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
          source: FUENTE_RELIEVE,
          /**
         * Sombreado fuerte a propósito.
         *
         * A la altura a la que se juega -zoom 17-18, unos cientos de
         * metros de ancho- el desnivel REAL de un valle son unos pocos
         * metros: geométricamente correcto e invisible. El sombreado de
         * laderas es lo que hace legible la forma del terreno a esa
         * escala, más que la propia malla.
         */
        paint: { 'hillshade-exaggeration': 0.85 },
        },
        {
        id: CAPA_RADIO_RELLENO,
        type: 'fill',
        source: FUENTE_RADIO,
        paint: { 'fill-color': COLOR_NODO_ACTUAL, 'fill-opacity': 0.28 },
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 17, 4, 19, 6],
          'line-dasharray': [2, 1.5],
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 5, 19, 9],
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
    let rescates = 0
    const vigilarEstilo = () => {
      const vivo = mapaRef.current
      if (!vivo || document.visibilityState !== 'visible') return
      if (vivo.isStyleLoaded()) return
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

    if (new URLSearchParams(window.location.search).has('depurar-mapa')) {
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
      ;(window as unknown as { __sagaMapa?: maplibregl.Map }).__sagaMapa = mapa
    }

    return () => {
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
  const pintarFuente = useCallback(
    (id: string, datos: GeoJSON.FeatureCollection | typeof COLECCION_VACIA) => {
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

    nodos.forEach((nodo, indice) => {
      const color =
        indice < currentLevel
          ? COLOR_NODO_HECHO
          : indice === currentLevel
            ? COLOR_NODO_ACTUAL
            : COLOR_NODO_PENDIENTE

      /**
       * Chincheta, no un punto plano.
       *
       * Un círculo suelto sobre la foto aérea no dice DÓNDE toca el suelo:
       * con la cámara inclinada, un punto plano parece flotar y se lee mal
       * a qué sitio del terreno pertenece. La forma de gota con la punta
       * abajo sí lo dice, y anclada por la punta (`anchor: 'bottom'`) se
       * clava en el sitio exacto aunque el mapa se incline.
       */
      /**
       * El envoltorio es de MapLibre; la chincheta va dentro.
       *
       * Esto NO es decoración: MapLibre reescribe el `transform` del
       * elemento que le entregas para colocarlo en pantalla. El giro de
       * la gota estaba puesto ahí y se machacaba en cada fotograma, así
       * que lo que se veía eran bolas, no chinchetas. Dentro del
       * envoltorio el giro sobrevive.
       */
      const elemento = document.createElement('div')
      elemento.setAttribute('aria-label', `Nodo ${indice + 1}`)
      Object.assign(elemento.style, {
        width: '34px',
        height: '42px',
        position: 'relative',
      } as Partial<CSSStyleDeclaration>)

      /**
       * Sombra en el SUELO, separada de la chincheta.
       *
       * Una sombra pegada al alfiler lo hace parecer un adhesivo sobre el
       * cristal. Una elipse aplastada a sus pies es lo que da la lectura
       * de "está clavado ahí abajo, en el terreno".
       */
      const sombra = document.createElement('div')
      Object.assign(sombra.style, {
        position: 'absolute',
        left: '50%',
        bottom: '-2px',
        width: '20px',
        height: '7px',
        transform: 'translateX(-50%)',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(0,0,0,.55), rgba(0,0,0,0) 70%)',
      } as Partial<CSSStyleDeclaration>)
      elemento.appendChild(sombra)

      const gota = document.createElement('div')
      Object.assign(gota.style, {
        position: 'absolute',
        left: '50%',
        top: '0',
        width: '30px',
        height: '30px',
        marginLeft: '-15px',
        borderRadius: '50% 50% 50% 0',
        transform: 'rotate(-45deg)',
        /**
         * Degradado, no color plano: la luz arriba y la sombra abajo es
         * lo que convierte un disco en un cuerpo con volumen. Es el mismo
         * color del estado del nodo, solo que con relieve.
         */
        background: `radial-gradient(circle at 32% 28%, #ffffff55, ${color} 55%, #00000055)`,
        border: '2px solid #0b1220',
        boxShadow: '0 2px 5px rgba(0,0,0,.45)',
        display: 'grid',
        placeItems: 'center',
      } as Partial<CSSStyleDeclaration>)
      elemento.appendChild(gota)

      // El número va derecho: el giro es de la chincheta, no del texto.
      const numero = document.createElement('span')
      numero.textContent = String(indice + 1)
      Object.assign(numero.style, {
        transform: 'rotate(45deg)',
        color: '#0b1220',
        font: '900 13px system-ui, sans-serif',
        textShadow: '0 1px 0 rgba(255,255,255,.35)',
      } as Partial<CSSStyleDeclaration>)
      gota.appendChild(numero)

      const marcador = new maplibregl.Marker({ element: elemento, anchor: 'bottom' })
        .setLngLat([nodo.lon as number, nodo.lat as number])
        .addTo(mapa)

      marcadoresNodosRef.current.push(marcador)
    })

    /**
     * Encuadrar la ruta la primera vez, si todavía no hay GPS.
     *
     * Abriendo siempre a zoom 16 sobre un punto, los diez nodos de una ruta
     * de kilómetros caen fuera de la pantalla o salen alineados contra un
     * borde, que es justo lo que se veía. Encuadrar la ruta entera da el
     * "dónde estoy y a dónde voy" de un vistazo.
     *
     * Solo la primera vez y solo sin GPS: en cuanto hay posición, mandas
     * tú, y mover la cámara bajo los pies del jugador es peor que no
     * encuadrar nada.
     */
    if (!encuadreInicialRef.current && nodos.length > 1 && !playerPosition) {
      encuadreInicialRef.current = true
      const limites = new maplibregl.LngLatBounds()
      nodos.forEach((nodo) => limites.extend([nodo.lon as number, nodo.lat as number]))
      mapa.fitBounds(limites, { padding: 60, animate: false, maxZoom: 16 })
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
  }, [missionStages, currentLevel, pintarFuente])

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
        // La perspectiva tiene que vivir en el PADRE para que el volcado
        // del hijo tenga profundidad real y no sea un simple aplastado.
        perspective: '140px',
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
         * Inclinada hacia atrás y levantada del suelo.
         *
         * Con la cámara en 3D el suelo se ve en picado; una foto
         * perfectamente plana parecía pegada al cristal de la pantalla en
         * vez de estar EN el sitio. Volcarla la planta sobre el terreno.
         */
        transform: 'rotateX(22deg)',
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
      for (const marcador of marcadoresNodosRef.current) {
        marcador.getElement().style.scale = String(factor)
      }
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
