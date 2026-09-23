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
import { crearRedDeCaminos, type RedDeCaminos } from '../routing/redDeCaminos'
import {
  ALTO_BOLA_PX,
  ANCHO_BOLA_PX,
  CENTRO_HALO_3D_PX,
  COLOR_TIPO,
  DESPLAZAMIENTO_ANCLA_PX,
  OSCURO_TIPO,
  renderizarBola,
} from './bolaRenderizada'
import { crearCapaNodosTresD, type CapaNodosTresD, type TipoDeNodo } from './nodosTresD'

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
const FUENTE_FOTOS = 'saga-fotos'
const CAPA_RUTA_PULSO = 'saga-ruta-pulso'
const FUENTE_JUGADOR = 'saga-jugador'
const CAPA_JUGADOR = 'saga-jugador-capa'
const ICONO_AVATAR = 'avatar-propio'
const FUENTE_GUIA = 'saga-guia'
const CAPA_NODOS_TRES_D = 'saga-nodos-3d'
const CAPA_GUIA = 'saga-guia-capa'
/** Fases de la "hormiga" de la guía: el trazo avanza hacia el nodo. */
const PATRONES_GUIA: [number, number][] = [[0.001, 3], [1, 2], [2, 1], [3, 0.001]]
const CAPA_FOTOS = 'saga-fotos-capa'
const CAPA_NODOS_ICONOS = 'saga-nodos-iconos-capa'
const CAPA_NODOS_HALO = 'saga-nodos-halo-capa'
/** La moneda de la poképarada, en su propia capa para que flote (ver `latir`). */
const CAPA_NODOS_MONEDA = 'saga-nodos-moneda-capa'
const ICONO_HALO = 'halo-actual'
const ICONO_HALO_3D = 'halo-actual-3d'
/**
 * Los símbolos (fotos, nodos, tú) van tres metros por encima del suelo.
 *
 * Con relieve, MapLibre esconde un símbolo cuyo punto de anclaje queda
 * por debajo de la malla del terreno, y esa malla es basta: en cuesta el
 * anclaje caía unos centímetros bajo ella según el ángulo de la cámara,
 * y las fotos "a veces sí, a veces no, cuando quieren". Tres metros no se
 * notan (un par de píxeles al zoom de juego) y sacan el anclaje de la
 * zona de duda.
 */
const ALTURA_SIMBOLOS_M = 3
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
/** Distancia en metros entre dos puntos (suficiente para unos pocos km). */
function metrosEntre(a: Punto, b: Punto): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

/** A partir de cuántos metros del camino se avisa; se apaga algo más cerca, para no parpadear. */
const FUERA_DE_TRAZADO_M = 500
const DE_VUELTA_AL_TRAZADO_M = 400

/** checkpoint / qr / minijuego, del campo `kind` del servidor (o del tipo, si viene). */
function tipoDelNodo(nodo: {
  kind?: string
  type?: string
  physical_node_kind?: string
  physical_item_kind?: string
  is_map_collectible?: boolean
}): TipoDeNodo {
  const texto = String(nodo.kind || nodo.type || '').toLowerCase()
  const fisico = String(nodo.physical_node_kind || nodo.physical_item_kind || '').toLowerCase()
  if (texto === 'checkpoint') return 'checkpoint'
  /**
   * Un coleccionable se recoge: para el jugador no es lo mismo que un
   * minijuego, y hasta ahora los diez nodos de la ruta real salían con la
   * misma forma porque todos eran `minijuego`. El servidor ya lo dice en
   * `kind`; se mira también el campo físico por si el nodo viene de un
   * paquete guardado antes.
   */
  if (texto === 'coleccionable' || fisico.includes('collectible') || nodo.is_map_collectible === true) {
    return 'coleccionable'
  }
  if (texto.includes('qr')) return 'qr'
  return 'minijuego'
}

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
 * La BOLA de un nodo, como imagen para un símbolo del mapa.
 *
 * Los nodos se dibujaban con three.js dentro del lienzo de MapLibre y en
 * el móvil salían serrados -sin antialiasing de contexto, y activarlo
 * rompía las fotos-, además de temblar al mover el mapa. Un símbolo lo
 * pinta el propio MapLibre, a tres veces la resolución de pantalla, en el
 * mismo fotograma y a la altura exacta del terreno: nítido a cualquier
 * zoom y sin nada que parpadee. El aspecto de bola (luz, sombra, brillo)
 * va horneado en la imagen; el número, la chapa del tipo y la peana con
 * la forma del tipo, también.
 */
function dibujarBola(numero: string, estado: 'hecho' | 'actual' | 'pendiente', tipo: TipoDeNodo): ImageData | null {
  const escala = 3
  const ancho = 64
  const alto = 92
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = alto * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)

  // El color es el TIPO, como en 3D (poképaradas); el hecho, apagado.
  const color = estado === 'hecho' ? '#94a3b8' : COLOR_TIPO[tipo] // no-tema: color horneado en la imagen del nodo
  const oscuro = estado === 'hecho' ? '#475569' : OSCURO_TIPO[tipo] // no-tema: color horneado en la imagen del nodo
  const cx = ancho / 2
  const suelo = alto - 8
  const r = estado === 'actual' ? 21 : 18
  const cy = suelo - 34 - r

  // Suelo: sombra, aro de color y peana con la forma del tipo, aplastados
  // como los vería la cámara inclinada.
  ctx.save()
  ctx.translate(cx, suelo)
  ctx.scale(1, 0.4)
  const sombra = ctx.createRadialGradient(0, 0, 2, 0, 0, 20)
  sombra.addColorStop(0, 'rgba(0,0,0,.5)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(0, 0, 20, 0, Math.PI * 2)
  ctx.fill()
  const aro = ctx.createRadialGradient(0, 0, 10, 0, 0, 19)
  aro.addColorStop(0, 'rgba(0,0,0,0)')
  aro.addColorStop(0.55, color + 'cc')
  aro.addColorStop(1, color + '00')
  ctx.fillStyle = aro
  ctx.beginPath()
  ctx.arc(0, 0, 19, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(15,23,42,.85)' // no-tema: peana horneada en la imagen, no un color de pantalla
  ctx.beginPath()
  if (tipo === 'qr') {
    ctx.rect(-8, -8, 16, 16)
  } else if (tipo === 'minijuego') {
    ctx.moveTo(0, -10)
    ctx.lineTo(10, 7)
    ctx.lineTo(-10, 7)
    ctx.closePath()
  } else if (tipo === 'coleccionable') {
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i
      const x = Math.cos(a) * 9.5
      const y = Math.sin(a) * 9.5
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  } else {
    ctx.arc(0, 0, 9, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.restore()

  // Mástil: canto oscuro y alma clara.
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(11,18,32,.5)'
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(cx, suelo - 2)
  ctx.lineTo(cx, cy + r - 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,.9)'
  ctx.lineWidth = 2.5
  ctx.stroke()

  // La bola: luz arriba a la izquierda, sombra abajo a la derecha.
  const luz = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05)
  luz.addColorStop(0, 'rgba(255,255,255,.95)')
  luz.addColorStop(0.28, color)
  luz.addColorStop(1, oscuro)
  ctx.fillStyle = luz
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(11,18,32,.55)'
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.35)'
  ctx.beginPath()
  ctx.ellipse(cx - r * 0.3, cy - r * 0.45, r * 0.32, r * 0.2, -0.6, 0, Math.PI * 2)
  ctx.fill()

  // Disco claro con el número: se lee sobre cualquier color.
  const rd = r * 0.62
  ctx.beginPath()
  ctx.arc(cx, cy, rd, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,.95)'
  ctx.fill()
  ctx.fillStyle = '#0b1220'
  ctx.font = `900 ${numero.length > 1 ? rd * 1.15 : rd * 1.35}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(numero, cx, cy + 0.5)

  // Chapa del tipo, arriba a la derecha.
  const bx = cx + r * 0.72
  const by = cy - r * 0.72
  ctx.beginPath()
  ctx.arc(bx, by, 7.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = oscuro
  ctx.strokeStyle = oscuro
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (tipo === 'checkpoint') {
    ctx.moveTo(bx - 2.5, by - 4)
    ctx.lineTo(bx - 2.5, by + 4)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx - 2.5, by - 4)
    ctx.lineTo(bx + 3.5, by - 4)
    ctx.lineTo(bx + 2, by - 1.5)
    ctx.lineTo(bx + 3.5, by + 1)
    ctx.lineTo(bx - 2.5, by + 1)
    ctx.closePath()
    ctx.fill()
  } else if (tipo === 'qr') {
    ctx.rect(bx - 4, by - 4, 2.8, 2.8)
    ctx.rect(bx + 1.2, by - 4, 2.8, 2.8)
    ctx.rect(bx - 4, by + 1.2, 2.8, 2.8)
    ctx.rect(bx + 1.6, by + 1.6, 2, 2)
    ctx.fill()
  } else if (tipo === 'coleccionable') {
    ctx.moveTo(bx, by - 4.2)
    ctx.lineTo(bx + 4, by - 1)
    ctx.lineTo(bx, by + 4.2)
    ctx.lineTo(bx - 4, by - 1)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.moveTo(bx - 2.6, by - 3.6)
    ctx.lineTo(bx + 3.6, by)
    ctx.lineTo(bx - 2.6, by + 3.6)
    ctx.closePath()
    ctx.fill()
  }

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/** Resplandor del nodo en juego, del mismo tamaño que la bola: late por `icon-opacity`. */
function dibujarHalo(centroY = 92 - 8 - 34 - 21, ancho = 64, alto = 92): ImageData | null {
  const escala = 3
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = alto * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  const cx = ancho / 2
  const r = 21
  const cy = centroY
  const g = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.5)
  g.addColorStop(0, COLOR_NODO_ACTUAL + 'aa')
  g.addColorStop(1, COLOR_NODO_ACTUAL + '00')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2)
  ctx.fill()
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * Enmarca una miniatura como foto de campo: cuadrado con esquinas
 * redondeadas, marco blanco grueso y sombra en el suelo bajo la base.
 * Sin imagen (aún cargando, o fallida) deja el marco con un gris neutro:
 * el sitio se ve igual, la foto llega cuando llega.
 */
function dibujarFoto(imagen: HTMLImageElement | null): ImageData | null {
  const lado = 48
  const ancho = 60
  const alto = 64
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * 2
  lienzo.height = alto * 2
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)

  // Sombra en el suelo.
  ctx.save()
  ctx.translate(ancho / 2, alto - 5)
  ctx.scale(1, 0.35)
  const sombra = ctx.createRadialGradient(0, 0, 3, 0, 0, 20)
  sombra.addColorStop(0, 'rgba(0,0,0,.5)')
  sombra.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sombra
  ctx.beginPath()
  ctx.arc(0, 0, 20, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const x = (ancho - lado) / 2
  const y = 4
  const radio = 9
  const trazarMarco = (inset: number) => {
    const r = Math.max(2, radio - inset)
    ctx.beginPath()
    ctx.roundRect(x + inset, y + inset, lado - inset * 2, lado - inset * 2, r)
  }

  trazarMarco(0)
  ctx.fillStyle = '#f8fafc'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.shadowColor = 'transparent'

  trazarMarco(3)
  ctx.save()
  ctx.clip()
  if (imagen) {
    // Recorte centrado, como `object-fit: cover`.
    const escala = Math.max((lado - 6) / imagen.width, (lado - 6) / imagen.height)
    const w = imagen.width * escala
    const h = imagen.height * escala
    ctx.drawImage(imagen, x + 3 + (lado - 6 - w) / 2, y + 3 + (lado - 6 - h) / 2, w, h)
  } else {
    // Gris de foto sin cargar: es un hueco, no un color de la piel. (no-tema)
    ctx.fillStyle = '#94a3b8' // no-tema
    ctx.fillRect(x, y, lado, lado)
  }
  ctx.restore()

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * Tu avatar: círculo con tu foto (o tus iniciales sobre tu color), anillo
 * blanco y halo de tu color. Es lo que hace que "este soy yo" se lea de
 * un vistazo entre chinchetas numeradas.
 */
function dibujarAvatar(
  ficha: { color: string; iniciales: string },
  imagen: HTMLImageElement | null
): ImageData | null {
  const lado = 64
  const lienzo = document.createElement('canvas')
  lienzo.width = lado * 2
  lienzo.height = lado * 2
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)
  const c = lado / 2

  // Halo del color del jugador: lo separa del terreno, claro u oscuro.
  const halo = ctx.createRadialGradient(c, c, 18, c, c, 31)
  halo.addColorStop(0, ficha.color + 'aa')
  halo.addColorStop(1, ficha.color + '00')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(c, c, 31, 0, Math.PI * 2)
  ctx.fill()

  // Anillo blanco.
  ctx.beginPath()
  ctx.arc(c, c, 22, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.shadowColor = 'transparent'

  // Foto recortada en círculo, o disco de color con iniciales.
  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, 19, 0, Math.PI * 2)
  ctx.clip()
  if (imagen) {
    const escala = Math.max(38 / imagen.width, 38 / imagen.height)
    const w = imagen.width * escala
    const h = imagen.height * escala
    ctx.drawImage(imagen, c - w / 2, c - h / 2, w, h)
  } else {
    ctx.fillStyle = ficha.color
    ctx.fillRect(0, 0, lado, lado)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 15px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ficha.iniciales.slice(0, 2) || '·', c, c + 0.5)
  }
  ctx.restore()

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

/**
 * Registra (o sustituye) el avatar en el mapa. Primero con iniciales, que
 * es inmediato; si hay foto, se carga y se sustituye al llegar.
 */
function pintarAvatar(mapa: maplibregl.Map, ficha: { color: string; foto: string; iniciales: string }) {
  const poner = (datos: ImageData | null) => {
    if (!datos) return
    try {
      if (mapa.hasImage(ICONO_AVATAR)) mapa.updateImage(ICONO_AVATAR, datos)
      else mapa.addImage(ICONO_AVATAR, datos, { pixelRatio: 2 })
    } catch {
      // El mapa pudo cerrarse mientras cargaba la foto.
    }
  }
  poner(dibujarAvatar(ficha, null))
  if (!ficha.foto) return
  const imagen = new Image()
  imagen.crossOrigin = 'anonymous'
  imagen.onload = () => poner(dibujarAvatar(ficha, imagen))
  imagen.src = ficha.foto
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
         * `maxzoom: 14`: Terrarium llega a 15, pero z15 sólo aporta detalle
         * que a pie no se aprecia y duplica el relieve del paquete offline
         * (90 KB por tesela). Con 14, al acercarse MapLibre amplía la de
         * z14, y el paquete cabe. Sin tope, pediría teselas que no existen
         * y el relieve desaparecería justo cuando más cerca estás.
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
        [FUENTE_FOTOS]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_JUGADOR]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_GUIA]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_RELIEVE]: {
          type: 'raster-dem',
          tiles: [`${window.location.origin}/dem-tiles/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 14,
          encoding: 'terrarium',
        },
        [FUENTE_RELIEVE_SOMBRAS]: {
          type: 'raster-dem',
          tiles: [`${window.location.origin}/dem-tiles/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 14,
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
        /**
         * Sin círculo del radio de entrada. Óscar: "cutre". La fuente
         * sigue existiendo por si vuelve a hacer falta; lo que marca el
         * nodo en juego es el brillo en el suelo del propio nodo.
         */
        {
        id: CAPA_RADIO_BORDE,
        type: 'line',
        source: FUENTE_RADIO,
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0,
          'line-width': 0,
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
          /**
           * El color cuenta la partida: verde lo andado, azul el tramo
           * en juego, claro y apagado lo que queda. Cada tramo lleva el
           * estado del nodo al que llega.
           */
          'line-color': [
            'match',
            ['get', 'estado'],
            'hecho',
            COLOR_NODO_HECHO,
            'actual',
            COLOR_NODO_ACTUAL,
            '#f8fafc',
          ],
          'line-opacity': ['match', ['get', 'estado'], 'pendiente', 0.55, 0.95],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 5.5, 19, 9],
        },
      },
      {
        /**
         * Pulso sobre el tramo en juego: una línea blanca más ancha cuya
         * opacidad respira (ver el bucle en el montaje). Es lo que dice
         * "por aquí, ahora" sin leer nada.
         */
        id: CAPA_RUTA_PULSO,
        type: 'line',
        source: FUENTE_RUTA,
        filter: ['==', ['get', 'estado'], 'actual'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0.4,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 11, 19, 18],
          'line-blur': 3,
        },
      },
      {
        /**
         * La guía: una línea a trazos de ti al nodo que toca, con los
         * trazos avanzando hacia él (ver el bucle del pulso). Es la
         * animación "entre el jugador y el nodo" que había en el motor de
         * siempre y que aquí faltaba. Recta a propósito: no dice por
         * dónde ir -eso lo dice el trazado-, dice hacia dónde.
         */
        id: CAPA_GUIA,
        type: 'line',
        source: FUENTE_GUIA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLOR_NODO_ACTUAL,
          'line-opacity': 0.9,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 3.5, 19, 5],
          'line-dasharray': [0.001, 3],
        },
      },
      {
        /**
         * Fotos de campo como símbolos del mapa, por lo mismo que los
         * nodos: un marcador del DOM va un fotograma por detrás del
         * terreno y "no se queda en su sitio" con relieve y zoom. La
         * miniatura se carga y se enmarca en un canvas bajo demanda (ver
         * `styleimagemissing`), y el motor la coloca en el mismo fotograma
         * que el resto del mapa.
         */
        id: CAPA_FOTOS,
        type: 'symbol',
        source: FUENTE_FOTOS,
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 15, 0.75, 17, 1, 19, 1.25],
          'symbol-sort-key': ['get', 'orden'],
        },
      },
      {
        // Resplandor del nodo en juego: late por icon-opacity (ver `latir`).
        id: CAPA_NODOS_HALO,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        filter: ['==', ['get', 'estado'], 'actual'],
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_HALO,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.32, 15, 0.7, 17, 1.4, 19, 2.8],
        },
        paint: { 'icon-opacity': 0.6 },
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
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // Billboard: siempre de frente, como una chincheta clavada que
          // miras desde cualquier lado. Pegarla al plano del mapa la
          // aplastaría con la inclinación.
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          /**
           * Crecen con el mapa al acercarse, como cualquier cosa del mundo.
           * Con una escala casi fija en píxeles, al ampliar el nodo parecía
           * cada vez más pequeño frente a las casas y los caminos, que sí
           * crecen: "cuanto más me acerco más pequeños se hacen". Base 1,5
           * por nivel de zoom: la mitad que el terreno (que dobla), para que
           * de cerca no tapen el mapa.
           */
          'icon-size': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.32, 15, 0.7, 17, 1.4, 19, 2.8],
          // El nodo en juego se pinta el último: queda encima si se solapan.
          'symbol-sort-key': ['get', 'orden'],
        },
      },
      {
        /**
         * La moneda de la poképarada, encima de su base. Mismo encuadre,
         * mismo ancla y mismo tamaño que la base, así que encajan exactas;
         * va aparte para que suba y baje sola (`icon-translate`, ver
         * `latir`). Sólo en 3D.
         */
        id: CAPA_NODOS_MONEDA,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono3dm'],
          'icon-anchor': 'bottom',
          'icon-offset': [0, DESPLAZAMIENTO_ANCLA_PX],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.32, 15, 0.7, 17, 1.4, 19, 2.8],
          'symbol-sort-key': ['get', 'orden'],
          visibility: 'none',
        },
        paint: { 'icon-translate': [0, 0], 'icon-translate-anchor': 'viewport' },
      },
      {
        /**
         * TÚ, como símbolo del mapa y no como marcador del DOM.
         *
         * El avatar era el último marcador del DOM que quedaba, y por eso
         * era el único que seguía saltando con el relieve al hacer zoom.
         * La foto se enmarca en un canvas con tu color (ver
         * `styleimagemissing`) y el motor la coloca en el mismo fotograma
         * que el terreno, igual que los nodos y las fotos.
         */
        id: CAPA_JUGADOR,
        type: 'symbol',
        source: FUENTE_JUGADOR,
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_AVATAR,
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 0.9, 19, 1.1],
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
  onListo,
  focusRequest,
  followPlayer = false,
  onUserMapMove,
  onRumbo,
}: MapSurfacePropsGL) {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<maplibregl.Map | null>(null)
  /** El aviso de "pintado" se da una vez; la prop puede cambiar de identidad entre renders. */
  const onListoRef = useRef(onListo)
  onListoRef.current = onListo
  /** Metros al camino cuando estás fuera de él; null cuando vas por él. */
  const [fueraDeTrazado, setFueraDeTrazado] = useState<number | null>(null)
  /** Un gesto del jugador en curso: seguirle ahora le quitaría el mapa de las manos. */
  const gestoRef = useRef(false)
  /** Para reaplicar el modo 2D/3D (capas visibles) cuando cambia el botón. */
  const aplicarModoRef = useRef<(() => void) | null>(null)
  /** Los nodos en 3D (three.js dentro del mapa). Se crea una vez. */
  const capaNodosRef = useRef<CapaNodosTresD | null>(null)
  if (!capaNodosRef.current) capaNodosRef.current = crearCapaNodosTresD(CAPA_NODOS_TRES_D)
  const tresDRef = useRef(tresD)
  tresDRef.current = tresD
  /** La red de caminos, si el panel la preparó; null mientras no está o si no hay. */
  /** La red de caminos, en su worker; `redLista` re-pinta la guía al llegar. */
  const redRef = useRef<RedDeCaminos | null>(null)
  if (!redRef.current) redRef.current = crearRedDeCaminos()
  const [redLista, setRedLista] = useState(false)
  /** Sube cada vez que el worker devuelve una ruta: re-pinta la guía. */
  const [rutaVersion, setRutaVersion] = useState(0)
  const pedidaRef = useRef<{ desde: Punto; hastaClave: string } | null>(null)
  /** Última ruta por caminos calculada, para no recalcular a cada aviso del GPS. */
  const rutaCaminosRef = useRef<{ desde: Punto; hastaClave: string; coords: [number, number][] } | null>(null)
  /** Última posición a la que se siguió, para no encadenar animaciones por 2 metros. */
  const ultimoSeguimientoRef = useRef<Punto | null>(null)
  /** Callbacks por ref: los escuchadores del mapa se registran una vez. */
  const onUserMapMoveRef = useRef(onUserMapMove)
  onUserMapMoveRef.current = onUserMapMove
  const onRumboRef = useRef(onRumbo)
  onRumboRef.current = onRumbo
  const followPlayerRef = useRef(followPlayer)
  followPlayerRef.current = followPlayer
  /** Último encuadre atendido, para no repetir el mismo `token`. */
  const ultimoEncuadreRef = useRef<number | null>(null)
  /** Tu ficha (color, foto, iniciales) para dibujar el avatar cuando el mapa lo pida. */
  const fichaRef = useRef<{ color: string; foto: string; iniciales: string }>({
    color: COLOR_NODO_HECHO,
    foto: '',
    iniciales: '',
  })
  const marcadoresNodosRef = useRef<maplibregl.Marker[]>([])
  /** Miniatura de cada foto por nombre de icono, para dibujarla cuando el mapa la pida. */
  const fotosPorIconoRef = useRef(new Map<string, string>())
  /** Lo último recibido, para resolver un toque sobre una foto sin cerrar props viejas. */
  const fotosRef = useRef<FieldProof[]>([])
  const abrirFotosRef = useRef<((proofs: FieldProof[]) => void) | undefined>(undefined)

  /** Lo último que se mandó pintar a cada fuente, para poder reintentarlo. */
  const ultimoDatoRef = useRef(new Map<string, GeoJSON.FeatureCollection>())
  /** La ruta se encuadra una vez al entrar, no cada vez que llegan datos. */
  const encuadreInicialRef = useRef(false)
  /** Sube cuando hay que repintar todo: el estilo se rehizo por debajo. */
  const [versionEstilo, setVersionEstilo] = useState(0)

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
      /**
       * SIN antialiasing de contexto (MSAA). Se probó en 5.25.24 y en el
       * móvil no se notó nada, pero desde entonces las fotos del mapa
       * aparecían y desaparecían: con relieve, MapLibre decide qué
       * símbolos tapa el terreno leyendo profundidad, y con el lienzo
       * multimuestreado eso se rompe. La calidad de lo 3D va por otro
       * lado: texturas difuminadas y geometría con más caras.
       *
       * Tope de zoom 19,5: la foto aérea no tiene más detalle que z19, y
       * por encima el mapa estira píxeles; eso era "amplío mucho y se
       * pixela", y ningún antialiasing lo arregla.
       */
      maxZoom: 19.5,
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
      if (evento.id === ICONO_AVATAR) {
        if (mapa.hasImage(ICONO_AVATAR)) return
        pintarAvatar(mapa, fichaRef.current)
        return
      }
      if (evento.id.startsWith('foto-')) {
        if (mapa.hasImage(evento.id)) return
        const url = fotosPorIconoRef.current.get(evento.id)
        // Se registra YA un marco vacío: MapLibre no vuelve a pedir la
        // misma imagen, así que si se tardara en cargar la miniatura, sin
        // esto la foto no aparecería nunca. Cuando llegue, se sustituye.
        const vacio = dibujarFoto(null)
        if (vacio) mapa.addImage(evento.id, vacio, { pixelRatio: 2 })
        if (!url) return
        const imagen = new Image()
        imagen.crossOrigin = 'anonymous'
        imagen.onload = () => {
          const lista = dibujarFoto(imagen)
          if (!lista || !mapaRef.current) return
          if (mapa.hasImage(evento.id)) mapa.updateImage(evento.id, lista)
          else mapa.addImage(evento.id, lista, { pixelRatio: 2 })
        }
        imagen.src = url
        return
      }
      if (evento.id === ICONO_HALO) {
        if (mapa.hasImage(ICONO_HALO)) return
        const halo = dibujarHalo()
        if (halo) mapa.addImage(ICONO_HALO, halo, { pixelRatio: 3 })
        return
      }
      if (evento.id === ICONO_HALO_3D) {
        if (mapa.hasImage(ICONO_HALO_3D)) return
        const halo = dibujarHalo(CENTRO_HALO_3D_PX, ANCHO_BOLA_PX, ALTO_BOLA_PX)
        if (halo) mapa.addImage(ICONO_HALO_3D, halo, { pixelRatio: 3 })
        return
      }
      const moneda3d = /^nodo3dm-(\d+)-(hecho|actual|pendiente)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (moneda3d) {
        if (mapa.hasImage(evento.id)) return
        const imagen = renderizarBola(Number(moneda3d[1]), moneda3d[2] as 'hecho' | 'actual' | 'pendiente', moneda3d[3] as TipoDeNodo, 'moneda')
        // Sin WebGL, la base ya lleva la bola dibujada entera: la moneda, vacía.
        mapa.addImage(evento.id, imagen ?? new ImageData(1, 1), { pixelRatio: 3 })
        return
      }
      const bola3d = /^nodo3d-(\d+)-(hecho|actual|pendiente)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (bola3d) {
        if (mapa.hasImage(evento.id)) return
        const estado3d = bola3d[2] as 'hecho' | 'actual' | 'pendiente'
        const tipo3d = bola3d[3] as TipoDeNodo
        // Objeto 3D renderizado una vez; si este navegador no puede, la bola dibujada.
        const imagen = renderizarBola(Number(bola3d[1]), estado3d, tipo3d, 'base') ?? dibujarBola(bola3d[1], estado3d, tipo3d)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const bola = /^nodo-(\d+)-(hecho|actual|pendiente)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (bola) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarBola(bola[1], bola[2] as 'hecho' | 'actual' | 'pendiente', bola[3] as TipoDeNodo)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
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
      /**
       * La capa 3D (three.js) se añade cuando el estilo tiene capas, y se
       * vuelve a añadir tras un rehecho del estilo, que la borra. En 3D
       * los nodos son los modelos; las chinchetas planas y los discos
       * extruidos se ocultan. En 2D, al revés.
       */
      try {
        /**
         * La capa three.js en vivo NO se añade al mapa. Dibujar dentro del
         * lienzo de MapLibre salía serrado y parpadeaba al girar en el
         * móvil: "se genera en el momento y con el giro hace píxeles
         * nuevos". En 3D los nodos son objetos 3D renderizados UNA vez,
         * con luz y sombra, a tres veces la resolución y con sobremuestreo,
         * que el mapa coloca como símbolos (`renderizarBola`). En 2D, la
         * bola dibujada (`dibujarBola`). Misma capa, distinta imagen.
         */
        const enTresD = tresDRef.current
        if (vivo.getLayer(CAPA_NODOS_VOLUMEN)) {
          vivo.setLayoutProperty(CAPA_NODOS_VOLUMEN, 'visibility', enTresD ? 'none' : 'visible')
        }
        if (vivo.getLayer(CAPA_NODOS_ICONOS)) {
          vivo.setLayoutProperty(CAPA_NODOS_ICONOS, 'visibility', 'visible')
          vivo.setLayoutProperty(CAPA_NODOS_ICONOS, 'icon-image', ['get', enTresD ? 'icono3d' : 'icono'])
          vivo.setLayoutProperty(CAPA_NODOS_ICONOS, 'icon-offset', [0, enTresD ? DESPLAZAMIENTO_ANCLA_PX : 0])
        }
        if (vivo.getLayer(CAPA_NODOS_MONEDA)) {
          vivo.setLayoutProperty(CAPA_NODOS_MONEDA, 'visibility', enTresD ? 'visible' : 'none')
        }
        if (vivo.getLayer(CAPA_NODOS_HALO)) {
          vivo.setLayoutProperty(CAPA_NODOS_HALO, 'visibility', 'visible')
          vivo.setLayoutProperty(CAPA_NODOS_HALO, 'icon-image', enTresD ? ICONO_HALO_3D : ICONO_HALO)
          vivo.setLayoutProperty(CAPA_NODOS_HALO, 'icon-offset', [0, enTresD ? DESPLAZAMIENTO_ANCLA_PX : 0])
        }
      } catch {
        // Estilo a medio montar: se repite en el siguiente `styledata`.
      }
    }
    aplicarModoRef.current = volcarPendientes
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
    /**
     * El pulso del tramo en juego.
     *
     * MapLibre no anima propiedades solo; se cambia la opacidad de la capa
     * unas diez veces por segundo con una senoide. Sólo con la pestaña
     * visible: en segundo plano no hay nadie mirando y sí batería.
     */
    let pulsoVivo = true
    const latir = () => {
      if (!pulsoVivo) return
      const vivo = mapaRef.current
      if (vivo && document.visibilityState === 'visible') {
        try {
          if (vivo.getLayer(CAPA_RUTA_PULSO)) {
            const fase = (performance.now() / 1000) * ((Math.PI * 2) / 1.6)
            vivo.setPaintProperty(CAPA_RUTA_PULSO, 'line-opacity', 0.12 + 0.5 * (0.5 + 0.5 * Math.sin(fase)))
          }
          if (vivo.getLayer(CAPA_NODOS_HALO)) {
            const fase = (performance.now() / 1000) * ((Math.PI * 2) / 1.8)
            vivo.setPaintProperty(CAPA_NODOS_HALO, 'icon-opacity', 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(fase)))
          }
          if (tresDRef.current && vivo.getLayer(CAPA_NODOS_MONEDA)) {
            // La moneda sube y baja despacio, como en una poképarada.
            const flota = -3 - 3 * Math.sin((performance.now() / 1000) * ((Math.PI * 2) / 2.6))
            vivo.setPaintProperty(CAPA_NODOS_MONEDA, 'icon-translate', [0, flota])
            if (vivo.getLayer(CAPA_NODOS_HALO)) vivo.setPaintProperty(CAPA_NODOS_HALO, 'icon-translate', [0, flota])
          }
          if (vivo.getLayer(CAPA_GUIA)) {
            const paso = Math.floor(performance.now() / 160) % PATRONES_GUIA.length
            vivo.setPaintProperty(CAPA_GUIA, 'line-dasharray', PATRONES_GUIA[paso])
          }
        } catch {
          // Entre un rehecho del estilo y el siguiente la capa puede no estar.
        }
      }
      window.setTimeout(latir, 100)
    }
    latir()

    /**
     * `idle` salta cuando no queda nada por cargar ni por dibujar: teselas,
     * elevación, imágenes de símbolos. La primera vez es "el mapa está".
     * Sólo se avisa una vez: después, cada zoom vuelve a pasar por `idle`
     * y eso ya no le importa a nadie.
     */
    /**
     * "El mapa ha pintado" NO es el evento `idle`.
     *
     * `idle` sólo salta cuando no queda nada por hacer, y el pulso del
     * trazado cambia una propiedad del estilo diez veces por segundo: el
     * mapa no está ocioso NUNCA. Todo lo que colgaba de idle -el aviso al
     * velo de carga, la red de caminos, la animación de los nodos 3D- no
     * se ejecutaba jamás: la guía salía recta, los modelos se quedaban
     * bajo el monte y el velo esperaba su tope. Lo que importa es que las
     * teselas de la vista estén: se pregunta cada cuarto de segundo, con
     * tope de ocho segundos por si alguna tesela no llega nunca.
     */
    const desde = performance.now()
    const esperarPintado = window.setInterval(() => {
      const vivo = mapaRef.current
      if (!vivo) {
        window.clearInterval(esperarPintado)
        return
      }
      let capas = 0
      try {
        capas = vivo.getStyle().layers.length
      } catch {
        capas = 0
      }
      const listo = capas > 0 && vivo.areTilesLoaded()
      if (!listo && performance.now() - desde < 8000) return
      window.clearInterval(esperarPintado)
      onListoRef.current?.()
      capaNodosRef.current?.arrancarAnimacion()
    }, 250)

    /**
     * La red de caminos se carga en un worker desde el primer momento: la
     * descarga (guardada por el service worker desde la pantalla de carga)
     * y el análisis de 21 MB de JSON no tocan el hilo principal. Antes se
     * analizaba aquí mismo y el mapa se quedaba congelado unos segundos
     * nada más entrar: "el trazado aparece mucho después".
     */
    void redRef.current?.cargar().then((ok) => setRedLista(ok))

    // El rumbo cambia con dos dedos; el botón de norte sólo tiene sentido
    // cuando el mapa está girado.
    const alGirar = () => onRumboRef.current?.(Math.round(mapa.getBearing()))
    mapa.on('rotate', alGirar)
    alGirar()

    /**
     * Si el jugador mueve el mapa con la mano, "seguirme" se apaga. Sólo
     * gestos con `originalEvent`: los movimientos que hace el propio
     * código (seguir, encuadrar) no cuentan, o se apagaría solo.
     */
    const alTocar = (evento: { originalEvent?: unknown }) => {
      if (evento.originalEvent) {
        gestoRef.current = true
        onUserMapMoveRef.current?.()
      }
    }
    const alSoltar = () => {
      gestoRef.current = false
    }
    mapa.on('moveend', alSoltar)
    mapa.on('dragstart', alTocar)
    mapa.on('zoomstart', alTocar)
    mapa.on('rotatestart', alTocar)
    mapa.on('pitchstart', alTocar)

    document.addEventListener('visibilitychange', vigilarEstilo)
    const relojVigilante = window.setInterval(vigilarEstilo, 4000)

    mapa.on('click', CAPA_FOTOS, (evento) => {
      const props = evento.features?.[0]?.properties as { lat?: number; lon?: number } | undefined
      if (!props || typeof props.lat !== 'number' || typeof props.lon !== 'number') return
      // Se abren TODAS las de ese punto: en un nodo suele haber varias y el
      // visor ya sabe pasarlas.
      const grupo = fotosRef.current.filter((otra) => otra.lat === props.lat && otra.lon === props.lon)
      if (grupo.length) abrirFotosRef.current?.(grupo)
    })
    mapa.on('mouseenter', CAPA_FOTOS, () => {
      mapa.getCanvas().style.cursor = 'pointer'
    })
    mapa.on('mouseleave', CAPA_FOTOS, () => {
      mapa.getCanvas().style.cursor = ''
    })

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
      ;(window as unknown as { __sagaNodos3D?: () => unknown }).__sagaNodos3D = () => capaNodosRef.current?.estadisticas()
      ;(window as unknown as { __sagaCapa3D?: () => unknown }).__sagaCapa3D = () => capaNodosRef.current?.interno()
    }

    return () => {
      pulsoVivo = false
      window.clearInterval(esperarPintado)
      mapa.off('rotate', alGirar)
      mapa.off('moveend', alSoltar)
      mapa.off('dragstart', alTocar)
      mapa.off('zoomstart', alTocar)
      mapa.off('rotatestart', alTocar)
      mapa.off('pitchstart', alTocar)
      mapa.off('styledata', volcarPendientes)
      document.removeEventListener('visibilitychange', vigilarEstilo)
      window.clearInterval(relojVigilante)
      marcadoresNodosRef.current.forEach((marcador) => marcador.remove())
      marcadoresNodosRef.current = []
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

  // Tu posición: un punto en una fuente del mapa; el avatar se dibuja al pedirlo.
  useEffect(() => {
    const ficha = {
      color: getPlayerColor(selfProfile || {}),
      foto: getPlayerAvatarUrl(selfProfile || {}) || '',
      iniciales: getPlayerAvatarInitials(selfProfile || {}) || '',
    }
    const cambio =
      ficha.color !== fichaRef.current.color ||
      ficha.foto !== fichaRef.current.foto ||
      ficha.iniciales !== fichaRef.current.iniciales
    fichaRef.current = ficha
    const mapa = mapaRef.current
    // Si cambió la ficha y el avatar ya estaba dibujado, se redibuja.
    if (cambio && mapa) {
      try {
        if (mapa.hasImage(ICONO_AVATAR)) pintarAvatar(mapa, ficha)
      } catch {
        // Sin estilo todavía: se pintará cuando el mapa lo pida.
      }
    }

    if (!playerPosition) {
      pintarFuente(FUENTE_JUGADOR, COLECCION_VACIA)
      return
    }
    pintarFuente(FUENTE_JUGADOR, {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [playerPosition.lon, playerPosition.lat] },
        },
      ],
    })

    /**
     * Seguirme, sin tirones.
     *
     * Cada aviso del GPS lanzaba una animación de 600 ms, y como los avisos
     * llegan cada pocos segundos -a veces con el anterior sin terminar-, el
     * mapa iba a sacudidas. Ahora: no se sigue mientras el jugador tiene
     * el mapa en la mano, no se sigue por menos de tres metros, y la
     * animación es más larga que el intervalo entre avisos, así que una
     * enlaza con la siguiente en vez de cortarla.
     */
    if (followPlayerRef.current && mapa && !gestoRef.current) {
      const anterior = ultimoSeguimientoRef.current
      if (!anterior || metrosEntre(anterior, playerPosition) >= 3) {
        ultimoSeguimientoRef.current = { lat: playerPosition.lat, lon: playerPosition.lon }
        mapa.easeTo({
          center: [playerPosition.lon, playerPosition.lat],
          duration: 1400,
          easing: (x) => x,
          essential: true,
        })
      }
    }
  }, [
    playerPosition?.lat,
    playerPosition?.lon,
    selfProfile?.avatar_url,
    selfProfile?.color,
    selfProfile?.display_name,
    pintarFuente,
  ])

  // 2D / 3D: modelos en 3D, chinchetas planas en 2D.
  useEffect(() => {
    aplicarModoRef.current?.()
  }, [tresD])

  /**
   * La guía de ti al nodo que toca, POR EL CAMINO.
   *
   * Recta era mentira: cruzaba el monte por donde no se puede andar. Ahora
   * se busca el punto del trazado del nodo más cercano a ti y la guía es
   * un tramito recto hasta ese punto más el trazado que queda desde ahí
   * hasta el nodo. Y de paso se sabe a cuántos metros del camino estás:
   * si son más de 500, "fuera del trazado".
   */
  useEffect(() => {
    if (!playerPosition || currentStage?.lat == null || currentStage?.lon == null) {
      pintarFuente(FUENTE_GUIA, COLECCION_VACIA)
      setFueraDeTrazado(null)
      return
    }
    const nodo = { lat: currentStage.lat as number, lon: currentStage.lon as number }
    const track = leerTrackDelNodo(currentStage)
    const camino = track.length > 1 ? track : [nodo]

    let mejor = 0
    let mejorMetros = Infinity
    camino.forEach((punto, indice) => {
      const metros = metrosEntre(playerPosition, punto)
      if (metros < mejorMetros) {
        mejorMetros = metros
        mejor = indice
      }
    })

    /**
     * Lejos del trazado: por carreteras y caminos hasta el punto más
     * cercano de la ruta, si el panel preparó la red de caminos. La ruta
     * se recalcula sólo cuando te has movido más de quince metros o ha
     * cambiado el destino: A* sobre decenas de miles de nodos cada aviso
     * del GPS gastaría batería para nada.
     */
    let porCaminos: [number, number][] = []
    /**
     * Fuera del trazado y sin ruta por caminos todavía (la red cargando, o
     * el worker calculando), el tramo de ti al camino NO se pinta: recto
     * era mentira y se recolocaba a la vista. La guía empieza en el
     * trazado y el tramo aparece cuando llega, por carreteras si estás
     * lejos y por pistas si estás cerca (ver `factorPorLejania`).
     */
    let esperandoCaminos = false
    const objetivo = camino[mejor]
    const claveObjetivo = `${objetivo.lat.toFixed(5)},${objetivo.lon.toFixed(5)}`
    if (mejorMetros > 120) {
      const previa = rutaCaminosRef.current
      if (previa && previa.hastaClave === claveObjetivo && metrosEntre(previa.desde, playerPosition) < 15) {
        porCaminos = previa.coords
      } else {
        esperandoCaminos = true
        const red = redRef.current
        const pedida = pedidaRef.current
        const yaPedida =
          pedida !== null && pedida.hastaClave === claveObjetivo && metrosEntre(pedida.desde, playerPosition) < 15
        if (red && redLista && !yaPedida) {
          const peticion = { desde: { lat: playerPosition.lat, lon: playerPosition.lon }, hastaClave: claveObjetivo }
          pedidaRef.current = peticion
          void red.ruta(peticion.desde, objetivo, mejorMetros).then((coords) => {
            if (pedidaRef.current !== peticion) return
            rutaCaminosRef.current = { desde: peticion.desde, hastaClave: claveObjetivo, coords: coords ?? [] }
            setRutaVersion((v) => v + 1)
          })
        }
      }
    }

    const coordenadas: [number, number][] = [
      ...(esperandoCaminos ? [] : ([[playerPosition.lon, playerPosition.lat]] as [number, number][])),
      ...porCaminos,
      ...camino.slice(mejor).map((punto) => [punto.lon, punto.lat] as [number, number]),
    ]
    pintarFuente(FUENTE_GUIA, {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordenadas } },
      ],
    })

    // Con histéresis: se enciende a 500 m y se apaga por debajo de 400,
    // para que en el borde no parpadee a cada aviso del GPS.
    setFueraDeTrazado((antes) => {
      if (antes === null) return mejorMetros > FUERA_DE_TRAZADO_M ? Math.round(mejorMetros) : null
      return mejorMetros > DE_VUELTA_AL_TRAZADO_M ? Math.round(mejorMetros) : null
    })
  }, [playerPosition?.lat, playerPosition?.lon, currentStage, pintarFuente, redLista, rutaVersion])

  /**
   * Los tres encuadres, siempre con el norte arriba.
   *
   * "Ver la ruta" y "volver a mí" giran el mapa al norte además de
   * encuadrar: es lo que hace de este botón también el de la brújula, y
   * por eso no hace falta otro. La aguja de la barra dice si el mapa está
   * girado; un toque aquí lo endereza.
   */
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !focusRequest) return
    if (ultimoEncuadreRef.current === focusRequest.token) return
    /**
     * "Centrar en mí" sin posición todavía: se pulsa, el navegador pide el
     * permiso de ubicación, el jugador acepta… y la posición llega DESPUÉS
     * de que este efecto haya corrido. Consumir el token aquí era perderlo:
     * el mapa no se centraba nunca. Se deja pendiente y se vuelve a pasar
     * por aquí cuando la posición aparece.
     */
    if (focusRequest.target === 'player' && !playerPosition) return
    ultimoEncuadreRef.current = focusRequest.token

    if (focusRequest.target === 'route') {
      const nodos = (Array.isArray(missionStages) ? missionStages : []).filter(
        (nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number'
      )
      if (nodos.length === 0) return
      const limites = new maplibregl.LngLatBounds()
      nodos.forEach((nodo) => limites.extend([nodo.lon as number, nodo.lat as number]))
      if (playerPosition) limites.extend([playerPosition.lon, playerPosition.lat])
      mapa.fitBounds(limites, { padding: 70, bearing: 0, duration: 800, maxZoom: 16 })
      return
    }
    const destino =
      focusRequest.target === 'player' && playerPosition
        ? { lat: playerPosition.lat, lon: playerPosition.lon }
        : currentStage?.lat != null && currentStage?.lon != null
          ? { lat: currentStage.lat as number, lon: currentStage.lon as number }
          : null
    if (!destino) return
    mapa.easeTo({ center: [destino.lon, destino.lat], zoom: 17, bearing: 0, duration: 700, essential: true })
    // `missionStages`/posición se leen en el momento del encuadre; no hay
    // que reencuadrar cuando cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.token, focusRequest?.target, playerPosition?.lat, playerPosition?.lon])

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

    capaNodosRef.current?.setNodos(
      nodos.map((nodo, indice) => ({
        id: String((nodo as { id?: unknown }).id ?? indice),
        lat: nodo.lat as number,
        lon: nodo.lon as number,
        numero: indice + 1,
        tipo: tipoDelNodo(nodo),
        estado: estado(indice),
      }))
    )

    pintarFuente(FUENTE_NODOS_ICONOS, {
      type: 'FeatureCollection',
      features: nodos.map((nodo, indice) => ({
        type: 'Feature' as const,
        properties: {
          // Número, estado y tipo van en el nombre: la imagen se hornea
          // al vuelo con los tres (ver `styleimagemissing`).
          icono: `nodo-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
          icono3d: `nodo3d-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
          icono3dm: `nodo3dm-${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
          estado: estado(indice),
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
    /**
     * Y sólo si nadie dio un centro inicial. La pantalla del jugador ya
     * abre el mapa sobre el nodo o el GPS; saltar otra vez al llegar los
     * datos era un tirón visible -el mapa se movía y las teselas se
     * borraban justo después de cargar-.
     */
    if (!encuadreInicialRef.current && !initialCenter && !playerPosition && currentStage?.lat != null) {
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
    // Cada tramo es el trazado que LLEGA a su nodo, así que hereda el
    // estado de ese nodo: andado, en juego o pendiente.
    const tramos = nodos
      .map((nodo, indice) => ({ track: leerTrackDelNodo(nodo), estado: estado(indice) }))
      .filter((tramo) => tramo.track.length > 1)

    pintarFuente(
      FUENTE_RUTA,
      tramos.length > 0
        ? {
            type: 'FeatureCollection',
            features: tramos.map((tramo) => ({
              type: 'Feature' as const,
              properties: { estado: tramo.estado },
              geometry: {
                type: 'LineString' as const,
                coordinates: tramo.track.map((punto) => [punto.lon, punto.lat]),
              },
            })),
          }
        : COLECCION_VACIA
    )
    // `playerPosition` solo decide si procede encuadrar al entrar; no debe
    // rehacer los marcadores en cada paso que das.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionStages, currentLevel, currentStage?.lat, currentStage?.lon, pintarFuente])

  /** Fotos de campo: puntos en una fuente del mapa; la imagen se pide al dibujar. */
  useEffect(() => {
    const fotos = (Array.isArray(fieldProofs) ? fieldProofs : []).filter(
      (foto) => typeof foto.lat === 'number' && typeof foto.lon === 'number'
    )
    fotosRef.current = fotos
    abrirFotosRef.current = onOpenFieldProofs

    const tabla = new Map<string, string>()
    fotos.forEach((foto) => {
      tabla.set(`foto-${foto.id}`, foto.thumbnail_url || foto.image_url)
    })
    fotosPorIconoRef.current = tabla

    pintarFuente(FUENTE_FOTOS, {
      type: 'FeatureCollection',
      features: fotos.map((foto, indice) => ({
        type: 'Feature' as const,
        properties: {
          icono: `foto-${foto.id}`,
          lat: foto.lat,
          lon: foto.lon,
          orden: indice,
        },
        geometry: { type: 'Point' as const, coordinates: [foto.lon, foto.lat] },
      })),
    })
  }, [fieldProofs, onOpenFieldProofs, pintarFuente])


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
      {fueraDeTrazado !== null ? (
        /**
         * Aviso de fuera del trazado. Pequeño, en el centro, sin tapar la
         * barra de arriba ni la de abajo. Dice cuánto, porque no es lo
         * mismo 520 m que 3 km.
         */
        <div
          role="status"
          style={{
            // Centrado por márgenes, no por transform: el contenedor del
            // mapa lleva sus propias transformaciones y el `translateX`
            // se veía descentrado en el móvil.
            position: 'absolute',
            left: 0,
            right: 0,
            top: '38%',
            width: 'fit-content',
            margin: '0 auto',
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(var(--theme-ink), .78)',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,.35)',
            font: '800 13px system-ui, sans-serif',
            letterSpacing: '.02em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          Fuera del trazado ·{' '}
          {fueraDeTrazado >= 1000 ? `${(fueraDeTrazado / 1000).toFixed(1)} km` : `${fueraDeTrazado} m`}
        </div>
      ) : null}

    </section>
  )
}

export default MapSurfaceGL
