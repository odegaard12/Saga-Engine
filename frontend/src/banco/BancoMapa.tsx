import { useEffect, useMemo, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { MapSurfaceGL } from '../player/components/MapSurfaceGL'
import type { FieldProof, PlayerStage } from '../types/player'

/**
 * Banco de pruebas del mapa.
 *
 * Existe porque el mapa no se podía mirar. La pantalla del jugador sólo se
 * abre en vertical -en un escritorio enseña el aviso de girar el móvil y el
 * mapa no llega a montarse-, exige elegir jugador, pide permisos y se pasa
 * cuarenta y cinco segundos descargando la misión antes de pintar nada. Con
 * todo eso por delante, revisar un cambio de mapa era imposible, y lo que
 * pasaba es que se corregía a ciegas y se daba por bueno sin verlo.
 *
 * Aquí el mapa se abre solo, a pantalla completa, con los datos de verdad y
 * con los números a la vista: si el estilo montó, si hay relieve, cuántos
 * vértices tiene el radio, cuántos tramos el trazado. Lo que antes había que
 * adivinar.
 *
 * No es una pantalla de juego y no pretende parecerlo.
 */

const ESTILO_PANEL: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  zIndex: 10,
  maxWidth: 320,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(11,18,32,.86)',
  color: '#e2e8f0',
  font: '500 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(148,163,184,.25)',
}

const ESTILO_BOTON: React.CSSProperties = {
  padding: '6px 10px',
  marginRight: 6,
  marginTop: 6,
  borderRadius: 8,
  border: '1px solid rgba(148,163,184,.35)',
  background: 'rgba(30,41,59,.9)',
  color: '#e2e8f0',
  font: '600 12px system-ui, sans-serif',
  cursor: 'pointer',
}

type Lectura = {
  estiloCargado: boolean
  teselas: boolean
  relieve: boolean
  terreno: number | null
  zoom: number
  pitch: number
  bearing: number
  capas: string[]
  radioVertices: number
  rutaTramos: number
  nodosVolumen: number
}

/** Lee el estado real del mapa. Nada de esto se puede deducir mirando. */
function leerMapa(mapa: maplibregl.Map | undefined): Lectura | null {
  if (!mapa) return null
  const datos = (id: string) => {
    try {
      const fuente = mapa.getSource(id) as { _data?: GeoJSON.FeatureCollection } | undefined
      return fuente?._data ?? null
    } catch {
      return null
    }
  }
  const radio = datos('saga-radio')
  const ruta = datos('saga-ruta')
  const volumen = datos('saga-nodos-volumen')
  let capas: string[] = []
  try {
    capas = mapa.getStyle().layers.map((capa) => capa.id)
  } catch {
    capas = []
  }
  const terreno = (() => {
    try {
      return mapa.getTerrain()?.exaggeration ?? null
    } catch {
      return null
    }
  })()

  return {
    estiloCargado: mapa.isStyleLoaded() === true,
    teselas: Boolean(mapa.getSource('saga-raster')),
    relieve: Boolean(mapa.getSource('saga-relieve')),
    terreno,
    zoom: Number(mapa.getZoom().toFixed(2)),
    pitch: Math.round(mapa.getPitch()),
    bearing: Math.round(mapa.getBearing()),
    capas,
    radioVertices: radio?.features?.[0]?.geometry
      ? ((radio.features[0].geometry as GeoJSON.Polygon).coordinates?.[0]?.length ?? 0)
      : 0,
    rutaTramos: ruta?.features?.length ?? 0,
    nodosVolumen: volumen?.features?.length ?? 0,
  }
}

function Fila({ etiqueta, valor, mal }: { etiqueta: string; valor: string; mal?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ opacity: 0.65 }}>{etiqueta}</span>
      <span style={{ color: mal ? '#f87171' : '#4ade80', fontWeight: 700 }}>{valor}</span>
    </div>
  )
}

export default function BancoMapa() {
  const [stages, setStages] = useState<PlayerStage[]>([])
  const [nivel, setNivel] = useState(0)
  const [fotos, setFotos] = useState<FieldProof[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tresD, setTresD] = useState(true)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [posicion, setPosicion] = useState<{ lat: number; lon: number } | null>(null)
  const [intento, setIntento] = useState(0)

  const usuario = useMemo(
    () => new URLSearchParams(window.location.search).get('user') || '',
    []
  )

  /**
   * Pedir la partida. Sin candados.
   *
   * Había un `useRef` que impedía repetir la petición, y si el componente
   * se montaba dos veces -cosa que pasa- la segunda se quedaba sin nodos
   * para siempre: el panel decía "nodos 0" mientras el mapa tenía diez
   * marcadores puestos. Un banco de pruebas que miente es peor que no
   * tenerlo.
   */
  useEffect(() => {
    if (!usuario) {
      setError('Falta ?user= en la dirección. Ejemplo: /banco-mapa?user=NOMBRE')
      return
    }

    void (async () => {
      try {
        const respuesta = await fetch(`/api/game/${encodeURIComponent(usuario)}?fresh=${Date.now()}`)
        if (!respuesta.ok) {
          setError(`El servidor respondió ${respuesta.status} para ese jugador.`)
          return
        }
        const datos = await respuesta.json()
        setStages(Array.isArray(datos.stages) ? datos.stages : [])
        setNivel(typeof datos.level === 'number' ? datos.level : 0)
      } catch (fallo) {
        setError(`No se pudo pedir la partida: ${String(fallo)}`)
      }

      try {
        const respuesta = await fetch('/api/field-proofs')
        if (respuesta.ok) {
          const datos = await respuesta.json()
          setFotos(Array.isArray(datos.proofs) ? datos.proofs : [])
        }
      } catch {
        // Las fotos son un extra; sin ellas el banco sigue valiendo.
      }
    })()
  }, [usuario, intento])

  // Las lecturas se refrescan solas: casi todo lo interesante del mapa
  // cambia sin que React se entere.
  useEffect(() => {
    const reloj = window.setInterval(() => {
      setLectura(leerMapa((window as unknown as { __sagaMapa?: maplibregl.Map }).__sagaMapa))
    }, 700)
    return () => window.clearInterval(reloj)
  }, [])

  const nodoActual = stages[nivel] || stages[0]

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', background: '#0b1220' }}>
      <MapSurfaceGL
        className="banco-mapa"
        currentStage={nodoActual ?? null}
        missionStages={stages}
        currentLevel={nivel}
        playerPosition={posicion}
        tresD={tresD}
        fieldProofs={fotos}
        selfProfile={{ user: usuario, display_name: usuario }}
      />

      <div style={ESTILO_PANEL}>
        <div style={{ fontWeight: 800, letterSpacing: '.06em', marginBottom: 8 }}>
          BANCO DE MAPA
        </div>

        {error ? <div style={{ color: '#f87171' }}>{error}</div> : null}

        <Fila etiqueta="nodos" valor={String(stages.length)} mal={stages.length === 0} />
        <Fila etiqueta="nivel" valor={String(nivel)} />
        <Fila etiqueta="fotos" valor={String(fotos.length)} />

        {lectura ? (
          <>
            <Fila
              etiqueta="estilo montado"
              valor={lectura.estiloCargado ? 'sí' : 'NO'}
              mal={!lectura.estiloCargado}
            />
            <Fila etiqueta="teselas" valor={lectura.teselas ? 'sí' : 'NO'} mal={!lectura.teselas} />
            <Fila
              etiqueta="relieve"
              valor={lectura.terreno != null ? `x${lectura.terreno}` : 'NO'}
              mal={lectura.terreno == null}
            />
            <Fila etiqueta="zoom / pitch" valor={`${lectura.zoom} / ${lectura.pitch}°`} />
            <Fila
              etiqueta="radio (vértices)"
              valor={String(lectura.radioVertices)}
              mal={lectura.radioVertices === 0}
            />
            <Fila
              etiqueta="trazado (tramos)"
              valor={String(lectura.rutaTramos)}
              mal={lectura.rutaTramos === 0}
            />
            <Fila
              etiqueta="nodos con volumen"
              valor={String(lectura.nodosVolumen)}
              mal={lectura.nodosVolumen === 0}
            />
            <Fila etiqueta="capas" valor={String(lectura.capas.length)} />
          </>
        ) : (
          <div style={{ opacity: 0.6 }}>esperando al mapa…</div>
        )}

        <div>
          <button type="button" style={ESTILO_BOTON} onClick={() => setTresD((v) => !v)}>
            {tresD ? 'ver 2D' : 'ver 3D'}
          </button>
          <button type="button" style={ESTILO_BOTON} onClick={() => setIntento((v) => v + 1)}>
            recargar datos
          </button>
          <button
            type="button"
            style={ESTILO_BOTON}
            onClick={() => setNivel((v) => (v + 1) % Math.max(1, stages.length))}
          >
            nodo siguiente
          </button>
          <button type="button" style={ESTILO_BOTON} onClick={() => setIntento((v) => v + 1)}>
            recargar datos
          </button>
          <button
            type="button"
            style={ESTILO_BOTON}
            onClick={() =>
              setPosicion(
                nodoActual?.lat != null
                  ? { lat: (nodoActual.lat as number) + 0.0004, lon: nodoActual.lon as number }
                  : null
              )
            }
          >
            ponerme al lado
          </button>
        </div>
      </div>
    </div>
  )
}
