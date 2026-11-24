import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AdminReactOverviewStage } from '../../lib/adminApi'
import { agruparPorNodo, tintaClara, type Punto } from '../../lib/campo'
import { escapeHtml } from '../../lib/htmlEscape'

export type PinDeCampo = Punto & {
  iniciales: string
  nombre: string
  color: string
  /** Minutos en su nodo si está atascado (la etiqueta del pin). */
  minutos?: number | null
}

type Props = {
  stages: AdminReactOverviewStage[]
  pines: PinDeCampo[]
  elegido: string | null
  pocos: boolean
  onElegir: (id: string) => void
}

const CLASE_DE_ESTADO: Record<string, string> = {
  sin_conexion: 'sin',
  senal_floja: 'viejo',
  atascado: 'atascado',
  terminado: 'fin',
  normal: '',
}

function coordenadas(s: AdminReactOverviewStage): [number, number] | null {
  return typeof s.lat === 'number' && typeof s.lon === 'number' ? [s.lat, s.lon] : null
}

/** El trazado guardado de cada tramo (GPX de campo) o la recta entre nodos: sin pedir nada a servicios de fuera. */
function trazado(stages: AdminReactOverviewStage[]): Array<[number, number]> {
  const puntos: Array<[number, number]> = []
  stages.forEach((s, i) => {
    const c = coordenadas(s)
    if (!c) return
    const tramo = (s as unknown as { route_track?: unknown }).route_track
    if (i > 0 && Array.isArray(tramo) && tramo.length >= 2) {
      for (const p of tramo) {
        if (Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) puntos.push([Number(p[0]), Number(p[1])])
      }
    }
    puntos.push(c)
  })
  return puntos
}

/**
 * El mapa del panel de campo (24/11): UNA capa (`/map-tiles`, ninguna con «Pocos datos»), la ruta guardada, los nodos con
 * su número y cada jugador con su inicial y su estado. Alejado, quien va al mismo nodo se agrupa en un círculo. Ni caminos
 * ni rutas de servicios de fuera: mirar la partida no pide nada que no sea del propio servidor.
 */
export default function MapaDeCampo({ stages, pines, elegido, pocos, onElegir }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const capaTeselas = useRef<L.TileLayer | null>(null)
  const capaRuta = useRef<L.LayerGroup | null>(null)
  const capaJugadores = useRef<L.LayerGroup | null>(null)
  const elegirRef = useRef(onElegir)
  elegirRef.current = onElegir
  const [zoom, setZoom] = useState(15)

  useEffect(() => {
    if (!raiz.current || mapa.current) return
    const m = L.map(raiz.current, { zoomControl: false, attributionControl: false, doubleClickZoom: true })
    capaRuta.current = L.layerGroup().addTo(m)
    capaJugadores.current = L.layerGroup().addTo(m)
    m.setView([42.6, -8.7], 14)
    m.on('zoomend', () => setZoom(m.getZoom()))
    mapa.current = m
    return () => {
      m.remove()
      mapa.current = null
    }
  }, [])

  useEffect(() => {
    const m = mapa.current
    if (!m) return
    capaTeselas.current?.remove()
    capaTeselas.current = null
    raiz.current?.classList.toggle('campo-mapa-liso', pocos)
    if (pocos) return
    capaTeselas.current = L.tileLayer(`${window.location.origin}/map-tiles/{z}/{x}/{y}.png`, {
      maxNativeZoom: 19,
      maxZoom: 21,
      updateWhenIdle: true,
      keepBuffer: 1,
    }).addTo(m)
  }, [pocos])

  // La ruta y los nodos: sólo cuando cambian los nodos. La primera vez, el mapa encuadra la ruta entera.
  const encuadrado = useRef(false)
  useEffect(() => {
    const m = mapa.current
    const capa = capaRuta.current
    if (!m || !capa) return
    capa.clearLayers()
    const linea = trazado(stages)
    if (linea.length >= 2) {
      L.polyline(linea, { className: 'campo-ruta-borde', weight: 7, interactive: false }).addTo(capa)
      L.polyline(linea, { className: 'campo-ruta', weight: 3.5, interactive: false }).addTo(capa)
    }
    stages.forEach((s, i) => {
      const c = coordenadas(s)
      if (!c) return
      L.marker(c, {
        icon: L.divIcon({ className: 'campo-nodo-icono', html: `<span class="campo-nodo">${i + 1}</span>`, iconSize: [24, 24] }),
        interactive: false,
        keyboard: false,
      }).addTo(capa)
    })
    const conSitio = stages.map(coordenadas).filter((c): c is [number, number] => Boolean(c))
    if (!encuadrado.current && conSitio.length > 0) {
      encuadrado.current = true
      // Sin que la ruta quede debajo de la cabecera, de la hoja de abajo (móvil) o de la columna (escritorio).
      const escritorio = (raiz.current?.clientWidth ?? 0) >= 900
      m.fitBounds(L.latLngBounds(conSitio), {
        paddingTopLeft: escritorio ? [40, 150] : [28, 150],
        paddingBottomRight: escritorio ? [480, 40] : [28, 330],
        maxZoom: 17,
      })
      setZoom(m.getZoom())
    }
  }, [stages])

  // Los jugadores: se rehacen con cada sondeo (son pocos) y al cambiar de zoom (agrupar o no).
  useEffect(() => {
    const m = mapa.current
    const capa = capaJugadores.current
    if (!m || !capa) return
    capa.clearLayers()
    const porId = new Map(pines.map((p) => [p.id, p]))
    const { sueltos, racimos } = agruparPorNodo(pines, elegido ? 99 : zoom)
    for (const r of racimos) {
      const marca = L.marker([r.lat, r.lon], {
        icon: L.divIcon({
          className: 'campo-pin-icono',
          html: `<span class="campo-racimo ${CLASE_DE_ESTADO[r.peor] || ''}" aria-label="${r.ids.length} jugadores">${r.ids.length}</span>`,
          iconSize: [40, 40],
        }),
        title: r.ids.map((id) => porId.get(id)?.nombre || id).join(', '),
        keyboard: true,
      }).addTo(capa)
      marca.on('click', () => {
        const caja = L.latLngBounds(r.ids.map((id) => porId.get(id)).filter(Boolean).map((p) => [p!.lat, p!.lon] as [number, number]))
        m.fitBounds(caja.pad(0.6), { maxZoom: 18 })
      })
    }
    for (const p of sueltos) {
      const clases = ['campo-pin', CLASE_DE_ESTADO[p.atencion] || '', tintaClara(p.color) ? 'tinta-clara' : 'tinta-oscura']
      if (p.id === elegido) clases.push('elegido')
      const etiqueta = p.atencion === 'atascado' && p.minutos ? `<b class="campo-pin-min">${p.minutos}'</b>` : ''
      const marca = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: 'campo-pin-icono',
          html: `<span class="${clases.filter(Boolean).join(' ')}" style="--pin:${escapeHtml(p.color)}">${escapeHtml(p.iniciales)}${etiqueta}</span>`,
          iconSize: [36, 36],
        }),
        title: p.nombre,
        alt: p.nombre,
        keyboard: true,
        zIndexOffset: p.id === elegido ? 1000 : p.atencion === 'normal' ? 0 : 500,
      }).addTo(capa)
      marca.on('click', () => elegirRef.current(p.id))
    }
  }, [pines, zoom, elegido])

  // Con una ficha abierta, el mapa se centra en el jugador (un poco por encima: la hoja tapa la mitad de abajo).
  useEffect(() => {
    const m = mapa.current
    const p = elegido ? pines.find((x) => x.id === elegido) : null
    if (!m || !p) return
    const ancho = raiz.current?.clientWidth ?? 0
    const alto = raiz.current?.clientHeight ?? 0
    const enEscritorio = ancho >= 900
    const objetivo = m.project([p.lat, p.lon], Math.max(m.getZoom(), 16))
    const desplazado = enEscritorio ? objetivo.add([210, 0]) : objetivo.add([0, Math.round(alto * 0.22)])
    m.setView(m.unproject(desplazado, Math.max(m.getZoom(), 16)), Math.max(m.getZoom(), 16), { animate: true })
    // Sólo al elegir, no con cada sondeo: si se mueve, el organizador decide si sigue mirándolo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido])

  return <div ref={raiz} className="campo-mapa" aria-label="Mapa de la partida" />
}
