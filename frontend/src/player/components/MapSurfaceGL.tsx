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
import { cargarGrafo, rutaPorCaminos, type GrafoDeCaminos } from '../routing/roadGraph'

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
const CAPA_GUIA = 'saga-guia-capa'
/** Fases de la "hormiga" de la guía: el trazo avanza hacia el nodo. */
const PATRONES_GUIA: [number, number][] = [[0.001, 3], [1, 2], [2, 1], [3, 0.001]]
const CAPA_FOTOS = 'saga-fotos-capa'
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
  /** La red de caminos, si el panel la preparó; null mientras no está o si no hay. */
  const grafoRef = useRef<GrafoDeCaminos | null>(null)
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
    mapa.once('idle', () => {
      onListoRef.current?.()
    })

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
    // La red de caminos se pide una vez; si no está preparada, no pasa nada.
    void cargarGrafo().then((grafo) => {
      grafoRef.current = grafo
    })

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
    }

    return () => {
      pulsoVivo = false
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
    const objetivo = camino[mejor]
    const claveObjetivo = `${objetivo.lat.toFixed(5)},${objetivo.lon.toFixed(5)}`
    if (mejorMetros > 120 && grafoRef.current) {
      const previa = rutaCaminosRef.current
      if (
        previa &&
        previa.hastaClave === claveObjetivo &&
        metrosEntre(previa.desde, playerPosition) < 15
      ) {
        porCaminos = previa.coords
      } else {
        const calculada = rutaPorCaminos(grafoRef.current, playerPosition, objetivo, 400)
        porCaminos = calculada ?? []
        rutaCaminosRef.current = {
          desde: { lat: playerPosition.lat, lon: playerPosition.lon },
          hastaClave: claveObjetivo,
          coords: porCaminos,
        }
      }
    }

    const coordenadas: [number, number][] = [
      [playerPosition.lon, playerPosition.lat],
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
  }, [playerPosition?.lat, playerPosition?.lon, currentStage, pintarFuente])

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
