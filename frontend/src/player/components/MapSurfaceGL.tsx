import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapSurfacePropsGL } from './mapSurfaceContract'

/**
 * El mapa, en WebGL. Motor NUEVO, en paralelo al de Leaflet.
 *
 * Por qué existe: Leaflet dibuja el mapa como un mosaico de <img> que
 * reposiciona con `transform` en cada gesto. Eso trae de serie tres cosas
 * que llevamos toda una sesión parcheando sin poder cerrarlas del todo:
 * el zoom va por niveles enteros (de 17 a 16, un salto), las teselas
 * contiguas dejan costuras de subpíxel al escalar, y cada cambio de nivel
 * pide un juego de imágenes nuevo -blanco mientras llegan-. Son límites
 * del enfoque, no fallos sueltos: en MapLibre el mapa lo dibuja la GPU,
 * el zoom es continuo y las teselas se escalan sin costuras.
 *
 * ⚠️ NO sustituye a MapSurface.tsx todavía. Se elige con `map_engine` en
 * la configuración de la misión, y por defecto sigue mandando Leaflet.
 * El plan es portar por capas -teselas, tu marcador, nodos, radios, ruta,
 * el grupo, offline- comparando las dos en el móvil hasta que esta gane
 * en todo. Mientras tanto, lo que juega la gente no se toca.
 *
 * Las teselas son LAS MISMAS que usa Leaflet (`/map-tiles/{z}/{x}/{y}.png`,
 * el proxy con caché en disco): así el modo sin cobertura sigue valiendo
 * tal cual -mismo origen, mismas URL, mismo service worker- y este cambio
 * no arrastra consigo una migración de datos.
 */

const FUENTE_TESELAS = 'saga-raster'
const CAPA_TESELAS = 'saga-raster-capa'

export function MapSurfaceGL({
  className,
  currentStage,
  missionStages,
  playerPosition,
  initialCenter,
}: MapSurfacePropsGL) {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<maplibregl.Map | null>(null)
  const marcadorXogadorRef = useRef<maplibregl.Marker | null>(null)
  const marcadoresNodosRef = useRef<maplibregl.Marker[]>([])

  // Montaje. Una sola vez: el resto de props se aplican en efectos aparte,
  // igual que en el motor viejo.
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return

    const centro = initialCenter ||
      (currentStage?.lat != null && currentStage?.lon != null
        ? { lat: currentStage.lat, lon: currentStage.lon }
        : { lat: 42.4333, lon: -8.65 })

    const mapa = new maplibregl.Map({
      container: contenedorRef.current,
      center: [centro.lon, centro.lat],
      zoom: 16,
      // Sin controles propios: los botones del juego ya están en el HUD.
      attributionControl: false,
      // El estilo se declara aquí, en crudo, y no se descarga de ningún
      // sitio: una URL de estilo sería una petición más que falla sin
      // cobertura, justo lo que no puede pasar en el monte.
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
        layers: [
          {
            id: CAPA_TESELAS,
            type: 'raster',
            source: FUENTE_TESELAS,
          },
        ],
      },
    })

    mapaRef.current = mapa

    return () => {
      marcadorXogadorRef.current?.remove()
      marcadorXogadorRef.current = null
      marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
      marcadoresNodosRef.current = []
      mapa.remove()
      mapaRef.current = null
    }
    // Solo al montar, a propósito: ver la nota de arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tu posición.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !playerPosition) return

    const lngLat: [number, number] = [playerPosition.lon, playerPosition.lat]

    if (!marcadorXogadorRef.current) {
      marcadorXogadorRef.current = new maplibregl.Marker({ color: '#22c55e' })
        .setLngLat(lngLat)
        .addTo(mapa)
      return
    }

    marcadorXogadorRef.current.setLngLat(lngLat)
  }, [playerPosition?.lat, playerPosition?.lon])

  // Los nodos de la ruta.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
    marcadoresNodosRef.current = []

    const nodos = Array.isArray(missionStages) ? missionStages : []

    nodos.forEach((nodo) => {
      if (typeof nodo.lat !== 'number' || typeof nodo.lon !== 'number') return
      const marcador = new maplibregl.Marker({ color: '#3b82f6' })
        .setLngLat([nodo.lon, nodo.lat])
        .addTo(mapa)
      marcadoresNodosRef.current.push(marcador)
    })
  }, [missionStages])

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
