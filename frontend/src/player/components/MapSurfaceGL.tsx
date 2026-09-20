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
const FUENTE_RADIO = 'saga-radio'
const CAPA_RADIO_RELLENO = 'saga-radio-relleno'
const CAPA_RADIO_BORDE = 'saga-radio-borde'
const FUENTE_RUTA = 'saga-ruta'
const CAPA_RUTA = 'saga-ruta-linea'
const FUENTE_NODOS = 'saga-nodos'
const CAPA_NODOS = 'saga-nodos-punto'

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
}: MapSurfacePropsGL) {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<maplibregl.Map | null>(null)
  const marcadorXogadorRef = useRef<maplibregl.Marker | null>(null)

  /**
   * ¿Está el estilo montado ya?
   *
   * Es LA fuente de errores de MapLibre: `addSource`/`getSource` antes de
   * que el estilo termine de cargar lanza, y los datos (posición, nodos)
   * llegan por props cuando quieren, no cuando el mapa está listo. Todo
   * lo que toque capas espera a esto.
   */
  const [estiloListo, setEstiloListo] = useState(false)

  const [tresD, setTresD] = useState(false)

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
        },
        layers: [{ id: CAPA_TESELAS, type: 'raster', source: FUENTE_TESELAS }],
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

      mapa.addSource(FUENTE_NODOS, { type: 'geojson', data: COLECCION_VACIA })
      mapa.addLayer({
        id: CAPA_NODOS,
        type: 'circle',
        source: FUENTE_NODOS,
        paint: {
          // El alfiler SÍ va en píxeles: es un señalador, tiene que
          // verse igual de lejos que de cerca. Lo que va en metros es el
          // radio del nodo, que es información del terreno.
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0b1220',
        },
      })

      setEstiloListo(true)
    }

    mapa.on('load', alCargar)

    return () => {
      marcadorXogadorRef.current?.remove()
      marcadorXogadorRef.current = null
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

  // Nodos y trazado entre ellos.
  useEffect(() => {
    const nodos = (Array.isArray(missionStages) ? missionStages : []).filter(
      (nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number'
    )

    pintarFuente(FUENTE_NODOS, {
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
        },
        geometry: { type: 'Point' as const, coordinates: [nodo.lon as number, nodo.lat as number] },
      })),
    })

    /**
     * El trazado se queda VACÍO a propósito hasta que siga caminos.
     *
     * Aquí había una línea recta de nodo a nodo, y probándola en el móvil
     * quedó claro que no es "el trazado a medias": es información falsa.
     * Cruza el monte por donde no se puede andar, y quien la mire
     * caminando se fía de ella. El motor de Leaflet traza por caminos
     * reales (ver roadRoute* en MapSurface.tsx); hasta que eso esté
     * portado, mejor no pintar nada que pintar una ruta que miente.
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

      <button
        type="button"
        onClick={() => setTresD((valor) => !valor)}
        aria-label={tresD ? 'Ver el mapa plano' : 'Inclinar el mapa'}
        title={tresD ? 'Ver el mapa plano' : 'Inclinar el mapa'}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 210,
          zIndex: 500,
          minWidth: 44,
          minHeight: 44,
          borderRadius: 'var(--theme-radius-card)',
          // Sin colores de respaldo clavados: `--saga-glass-*` las declara
          // `:root` en mobile-shell.css, así que siempre tienen valor, y un
          // respaldo en crudo aquí sería un color que no sigue al tema.
          border: '1px solid var(--saga-glass-border)',
          background: 'var(--saga-glass-bg)',
          backdropFilter: 'var(--theme-blur)',
          WebkitBackdropFilter: 'var(--theme-blur)',
          color: '#f8fafc',
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: '.04em',
          cursor: 'pointer',
        }}
      >
        {tresD ? '2D' : '3D'}
      </button>
    </section>
  )
}

export default MapSurfaceGL
