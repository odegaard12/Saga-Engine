import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
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

const COLECCION_VACIA = { type: 'FeatureCollection' as const, features: [] }

export function MapSurfaceGL({
  className,
  currentStage,
  missionStages,
  currentLevel = 0,
  playerPosition,
  initialCenter,
  tresD = true,
}: MapSurfacePropsGL) {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<maplibregl.Map | null>(null)
  const marcadorXogadorRef = useRef<maplibregl.Marker | null>(null)
  const marcadoresNodosRef = useRef<maplibregl.Marker[]>([])

  /**
   * ¿Está el estilo montado ya?
   *
   * Es LA fuente de errores de MapLibre: `addSource`/`getSource` antes de
   * que el estilo termine de cargar lanza, y los datos (posición, nodos)
   * llegan por props cuando quieren, no cuando el mapa está listo. Todo
   * lo que toque capas espera a esto.
   */
  const [estiloListo, setEstiloListo] = useState(false)

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
      style: {
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
            paint: { 'hillshade-exaggeration': 0.5 },
          },
        ],
        /**
         * Exageración 1.5: el desnivel real de la ruta es suave y a escala
         * exacta, desde el aire, casi no se aprecia. Subirlo más convierte
         * el monte en una sierra que no existe.
         */
        terrain: { source: FUENTE_RELIEVE, exaggeration: 1.5 },
      },
    })

    mapaRef.current = mapa

    const alCargar = () => {
      // Las capas se crean vacías una sola vez; los efectos de abajo solo
      // les cambian los datos. Crear y destruir capas en cada cambio de
      // props es lo que hace parpadear a un mapa de WebGL.
      mapa.addSource(FUENTE_RADIO, { type: 'geojson', data: COLECCION_VACIA })
      mapa.addLayer({
        id: CAPA_RADIO_RELLENO,
        type: 'fill',
        source: FUENTE_RADIO,
        paint: { 'fill-color': COLOR_NODO_ACTUAL, 'fill-opacity': 0.12 },
      })
      mapa.addLayer({
        id: CAPA_RADIO_BORDE,
        type: 'line',
        source: FUENTE_RADIO,
        paint: { 'line-color': COLOR_NODO_ACTUAL, 'line-width': 2, 'line-opacity': 0.75 },
      })

      mapa.addSource(FUENTE_RUTA, { type: 'geojson', data: COLECCION_VACIA })
      mapa.addLayer({
        id: CAPA_RUTA,
        type: 'line',
        source: FUENTE_RUTA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f8fafc', 'line-width': 3, 'line-opacity': 0.55 },
      })

      setEstiloListo(true)
    }

    mapa.on('load', alCargar)

    return () => {
      marcadorXogadorRef.current?.remove()
      marcadorXogadorRef.current = null
      marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
      marcadoresNodosRef.current = []
      mapa.remove()
      mapaRef.current = null
      setEstiloListo(false)
    }
    // Solo al montar, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Cambia los datos de una fuente, si el mapa está en condiciones. */
  const pintarFuente = useCallback(
    (id: string, datos: GeoJSON.FeatureCollection | typeof COLECCION_VACIA) => {
      const mapa = mapaRef.current
      if (!mapa || !estiloListo) return
      const fuente = mapa.getSource(id) as maplibregl.GeoJSONSource | undefined
      fuente?.setData(datos as GeoJSON.FeatureCollection)
    },
    [estiloListo]
  )

  // Tu posición.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !playerPosition) return

    const lngLat: [number, number] = [playerPosition.lon, playerPosition.lat]

    if (!marcadorXogadorRef.current) {
      marcadorXogadorRef.current = new maplibregl.Marker({ color: COLOR_NODO_HECHO })
        .setLngLat(lngLat)
        .addTo(mapa)
      return
    }

    marcadorXogadorRef.current.setLngLat(lngLat)
  }, [playerPosition?.lat, playerPosition?.lon])

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

      const elemento = document.createElement('div')
      elemento.textContent = String(indice + 1)
      elemento.setAttribute('aria-label', `Nodo ${indice + 1}`)
      Object.assign(elemento.style, {
        width: '26px',
        height: '26px',
        borderRadius: '50%',
        background: color,
        border: '2px solid #0b1220',
        color: '#0b1220',
        font: '900 12px system-ui, sans-serif',
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,.45)',
      } as Partial<CSSStyleDeclaration>)

      const marcador = new maplibregl.Marker({ element: elemento })
        .setLngLat([nodo.lon as number, nodo.lat as number])
        .addTo(mapa)

      marcadoresNodosRef.current.push(marcador)
    })

    /**
     * El trazado se queda VACÍO a propósito hasta que siga caminos.
     *
     * Aquí había una línea recta de nodo a nodo, y probándola en el móvil
     * quedó claro que no es "el trazado a medias": es información falsa.
     * Cruza el monte por donde no se puede andar, y quien la mire
     * caminando se fía de ella.
     */
    pintarFuente(FUENTE_RUTA, COLECCION_VACIA)
  }, [missionStages, currentLevel, pintarFuente])

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
