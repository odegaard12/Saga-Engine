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
/**
 * Teselas en paralelo: casi todas salen de la caché del service worker, no
 * de la red, así que las 16 de fábrica dejaban el mapa esperando turno al
 * desampliar -la vista nueva pide de golpe decenas de teselas-.
 */
maplibregl.setMaxParallelImageRequests(32)
import type { FieldProof, PlayerStage, TeamProfileLiveStatus } from '../../types/player'
import { getPlayerAvatarUrl, getPlayerColor } from '../../shared/playerIdentity'
import type { MapSurfacePropsGL } from './mapSurfaceContract'
import { crearRedDeCaminos, type RedDeCaminos } from '../routing/redDeCaminos'
import {
  ALTO_BOLA_PX,
  ANCHO_BOLA_PX,
  CENTRO_HALO_3D_PX,
  COLOR_TIPO,
  DESPLAZAMIENTO_ANCLA_PX,
  dibujarSuelo,
  OSCURO_TIPO,
  renderizarBola,
} from './bolaRenderizada'
import {
  contenidoPopupGrupo,
  contenidoPopupJugador,
  desplazamientoDeHueco,
  HUECOS_TOTALES,
  metrosPorPixel,
  ordenDePresencia,
  planDeJugadores,
  type ElementoDeMapa,
} from './jugadoresEnMapa'
import { crearCapaNodosTresD, type CapaNodosTresD, type TipoDeNodo } from './nodosTresD'
import { alCambiarCoberturaDelMapa, mapaCubierto } from '../hooks/useCubreElMapa'
import { useWakeLock } from '../hooks/useWakeLock'
import { Deslizador, intervaloDeDibujoMs } from '../avatares/movimientoSuave'
import { dibujarSueloDeJugador } from '../avatares/dibujarSuelo'
import {
  DESPLAZAMIENTO_PIES_PX,
  dibujarRetratoConFoto,
  dibujarRetratoDeMapa,
  idDeRetrato,
  idDeRetratoConFoto,
  leerIdDeFoto,
  leerIdDeRetrato,
  precargarCaras,
  precargarFotos,
  reintentarCaras,
  reintentarFotos,
  urlDeFotoValida,
} from '../avatares/retratoDeMapa'
import {
  dibujarBrilloDeNodo,
  dibujarChispa,
  dibujarFlechaDeRuta,
  dibujarInsignia,
  dibujarOnda,
} from '../avatares/dibujarEfectos'
import {
  EVENTO_ELEGIR_PERSONAJE,
  EVENTO_GESTO,
  EVENTO_MENU_DE_GESTOS,
  EVENTO_PERSONAJE_ELEGIDO,
} from '../avatares/GestorDePersonaje'
import { avatarLocal, hayPendiente, reintentarPendiente } from '../avatares/elegirPersonaje'
import { normalizarAvatar, type AvatarConfig } from '../avatares/avatarConfig'
import { aspectoDe, aspectoPorDefecto, partsAAspecto, type Aspecto, type MxId } from '../avatares3d/mixamo/catalogo'
import type { ComplementoDeAvatares, JugadorAvatar } from '../avatares3d/mixamo/capaAvatares'
import {
  brillo as curvaBrillo,
  Celebracion,
  chispas as curvaChispas,
  decidirCelebracion,
  onda as curvaOnda,
  prefiereMenosMovimiento,
  rebote as curvaRebote,
  CADUCA_ESPERANDO_MS,
  DURACION_VUELO_MS,
} from '../avatares/celebracion'
import { cortarTrazado, progresoAndado } from '../avatares/rutaAndada'

/**
 * El mapa del jugador, en WebGL (MapLibre): el único que hay.
 *
 * Sustituyó al de Leaflet, que dibujaba el mapa como un mosaico de <img> con
 * zoom por niveles enteros, costuras entre teselas y blanco mientras llegaban
 * las de cada nivel. Aquí lo dibuja la GPU: zoom continuo, relieve y nodos 3D.
 *
 * Las teselas salen del proxy con caché en disco
 * (`/map-tiles/{z}/{x}/{y}.png`) y el relieve de `/dem-tiles`: mismo origen,
 * mismas URL y mismo service worker, así que el modo sin cobertura y el
 * paquete offline (`offline/mapTileCache.ts`) siguen valiendo.
 *
 * Sin WebGL (contexto que no se puede crear) no hay mapa: se muestra un
 * aviso y la partida sigue con el resto de la interfaz. No hay segundo mapa.
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
const CAPA_AURA = 'saga-jugador-aura'
/** Suelo de cada jugador (aro del equipo + flecha de rumbo), tumbado en el mapa. */
const CAPA_SUELO_JUGADOR = 'saga-jugador-suelo'
const CAPA_SUELO_OTROS = 'saga-otros-suelo'
/** Flechas de dirección sobre lo que queda del trazado (line-pattern, pegado al terreno). */
const CAPA_RUTA_FLECHAS = 'saga-ruta-flechas'
const ICONO_FLECHA_RUTA = 'ruta-flecha'
/** La celebración al completar un nodo: una fuente, cuatro capas. */
const FUENTE_CELEBRACION = 'saga-celebracion'
const CAPA_CELEB_ONDA = 'saga-celebracion-onda'
const CAPA_CELEB_BRILLO = 'saga-celebracion-brillo'
const CAPA_CELEB_CHISPAS = 'saga-celebracion-chispas'
const CAPA_CELEB_INSIGNIA = 'saga-celebracion-insignia'
const ICONO_CELEB_ONDA = 'celebra-onda'
const ICONO_CELEB_BRILLO = 'celebra-brillo'
const ICONO_CELEB_CHISPA = 'celebra-chispa'
const ICONO_CELEB_INSIGNIA = 'celebra-insignia'
/** Los compañeros: símbolos del mapa, como los nodos y tú (ver CAPA_OTROS). */
const FUENTE_OTROS = 'saga-otros'
const CAPA_OTROS = 'saga-otros-capa'
const FUENTE_GUIA = 'saga-guia'
const CAPA_NODOS_TRES_D = 'saga-nodos-3d'
const CAPA_GUIA = 'saga-guia-capa'
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
/**
 * Los nodos, más pegados: a tres metros, con el mapa inclinado se veían
 * por encima de su sitio (la línea del camino acababa bajo el halo) y
 * "no asentados". Con el relieve de una sola resolución (ver la fuente de
 * elevación) la malla y la cota del nodo coinciden y dos metros bastan.
 */
const ALTURA_NODOS_M = 2
/** El halo del suelo del nodo, tumbado en el mapa (sólo en 3D). */
const CAPA_NODOS_SUELO = 'saga-nodos-suelo-capa'
/** El radio de entrada del nodo en juego, a su tamaño real en el mapa. */
const CAPA_NODO_ENTRADA = 'saga-nodo-entrada-capa'
/** Radio de la imagen del radio de entrada, en píxeles CSS (ver `dibujarEntrada`). */
const RADIO_ENTRADA_PX = 128
/**
 * Metros por píxel a zoom 0 en el ecuador, con el zoom de MapLibre
 * (mundo de 512 px): 40 075 016,686 / 512.
 */
const METROS_POR_PX_Z0 = 78271.517
/**
 * Tamaño del radio de entrada: el REAL. `entradaK` (por nodo) = metros de
 * radio / (metros por píxel a zoom 0 × radio de la imagen), y el tamaño es
 * `entradaK · 2^zoom`: base 2 exacta entre dos paradas, así que crece y
 * mengua con el mapa, sin escalones, como un dibujo sobre el terreno.
 */
const TAMANO_ENTRADA: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 2], ['zoom'],
  10, ['*', 1024, ['number', ['get', 'entradaK'], 0]],
  20, ['*', 1048576, ['number', ['get', 'entradaK'], 0]],
]

/**
 * Tamaño de nodos, fotos y jugador según el zoom, SIN escalones.
 *
 * Con una interpolación sólo por zoom, MapLibre topa el tamaño de cada
 * símbolo en el de un zoom por encima de su tesela (`evaluateCameraSize`
 * acaba en `Math.min(…, layoutSize)`): ampliando deprisa, el nodo se
 * quedaba quieto hasta que llegaba la tesela siguiente y entonces pegaba el
 * salto ("se nota que se recarga el tamaño"). Si el tamaño depende además
 * de un dato del punto -aquí uno que no existe y vale 1-, MapLibre guarda
 * los dos extremos en cada punto y mezcla en la GPU, sin techo. Y sólo dos
 * paradas: con más, el tramo que cubre cada tesela vuelve a tener tope.
 */
const SIN_ESCALON: maplibregl.ExpressionSpecification = ['number', ['get', 'escala'], 1]
// Base 1,15 entre 0,6 (z12) y 3,6 (z19,5): 1,12 en z14, 1,44 en z15, 1,81 en z16,
// 2,24 en z17 y 3,29 en z19; lo mismo que la curva de seis paradas de antes.
const TAMANO_NODOS: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.15], ['zoom'],
  12, ['*', 0.6, SIN_ESCALON],
  19.5, ['*', 3.6, SIN_ESCALON],
]
const TAMANO_FOTOS: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  12, ['*', 0.5, SIN_ESCALON],
  19.5, ['*', 1.3, SIN_ESCALON],
]
// Retrato (66 px de alto a tamaño 1) y suelo del jugador: 0,8 en z12 (53 px), ~1,12 en z16 (74 px), ~1,42 en z18
// (94 px), ~1,64 en z19 (108 px) y 1,9 en z20 (125 px): la misma curva que el avatar 3D (`alturaEnPantallaPx`,
// 80/101/113/126 px), para que el paso 3D <-> retrato no pegue un salto de tamaño. 5.48: más grandes.
const TAMANO_JUGADOR: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.25], ['zoom'],
  12, ['*', 0.8, SIN_ESCALON],
  20, ['*', 1.9, SIN_ESCALON],
]

/** Celebración: como los nodos, con `s` (dato del punto) como multiplicador. */
const TAMANO_CELEBRACION: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.15], ['zoom'],
  12, ['*', 0.6, ['number', ['get', 's'], 1]],
  19.5, ['*', 3.6, ['number', ['get', 's'], 1]],
]
const TAMANO_CHISPAS: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  12, ['*', 0.45, ['number', ['get', 's'], 1]],
  19.5, ['*', 0.95, ['number', ['get', 's'], 1]],
]

/** `icon-offset` por hueco (dato del punto): ver `desplazamientoDeHueco`. */
const OFFSET_DE_HUECO = [
  'match', ['number', ['get', 'hueco'], 0],
  ...Array.from({ length: HUECOS_TOTALES }, (_, i) => [
    i + 1,
    ['literal', [desplazamientoDeHueco(i + 1)[0], desplazamientoDeHueco(i + 1)[1] + DESPLAZAMIENTO_PIES_PX]],
  ]).flat(),
  // Sin hueco: sólo lo que hay que bajar la imagen para que los pies caigan en la coordenada.
  ['literal', [0, DESPLAZAMIENTO_PIES_PX]],
] as unknown as maplibregl.ExpressionSpecification

/** Las fotos de cada nodo, en un montón al lado de su base (ver `dibujarPila`). */
const CAPA_FOTOS_PILA = 'saga-fotos-pila-capa'
/**
 * El montón crece con el nodo (la mitad que él): así queda pegado a su base a
 * cualquier zoom. A la derecha de la peana, de pie en el suelo.
 */
const TAMANO_PILA: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.15], ['zoom'],
  12, ['*', 0.3, SIN_ESCALON],
  19.5, ['*', 1.8, SIN_ESCALON],
]
/** Desde qué zoom se reparten las fotos de un mismo sitio. */
const ZOOM_FOTOS_REPARTIDAS = 18
/** Cuántas fotos de un mismo sitio se enseñan repartidas; el visor las tiene todas. */
const MAX_FOTOS_GRUPO = 8
/**
 * Dónde va cada foto de un grupo, en píxeles a tamaño 1: en filas de
 * cuatro, en leve sonrisa. Junto a un nodo, por DEBAJO de su peana, para
 * no taparle el número; en campo abierto, alrededor del punto. Las fotos de
 * un nodo estaban todas en el mismo punto, apiladas y bajo el nodo: al
 * ampliar no se separaban y no había forma de tocar una.
 */
function huecoDeFoto(enNodo: boolean, n: number, i: number): [number, number] {
  const fila = Math.floor(i / 4)
  const enFila = Math.min(4, n - fila * 4)
  const x = ((i % 4) - (enFila - 1) / 2) * 64
  const y = (enNodo ? 72 : n > 1 ? 34 : 0) + fila * 70 + Math.abs(x) * 0.2
  return [Math.round(x), Math.round(y)]
}
const DESPLAZAMIENTO_FOTOS = ((): maplibregl.ExpressionSpecification => {
  // Tabla fija: una propiedad con un array dentro llega al estilo como texto.
  const casos: unknown[] = []
  for (const enNodo of [false, true]) {
    for (let n = 1; n <= MAX_FOTOS_GRUPO; n += 1) {
      for (let i = 0; i < n; i += 1) casos.push(`${enNodo ? 1 : 0}-${n}-${i}`, ['literal', huecoDeFoto(enNodo, n, i)])
    }
  }
  return ['match', ['get', 'hueco'], ...casos, ['literal', [0, 0]]] as unknown as maplibregl.ExpressionSpecification
})()

/**
 * La guía por caminos se guarda: al volver a abrir la app en el mismo
 * sitio (en casa, por ejemplo), sale al instante en vez de esperar a que
 * el worker cargue la red y la calcule otra vez.
 */
const CLAVE_GUIA_GUARDADA = 'saga:guia-por-caminos:v1'
type RutaGuia = { desde: Punto; hastaClave: string; coords: [number, number][] }
function leerGuiaGuardada(): RutaGuia | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_GUIA_GUARDADA)
    if (!crudo) return null
    const ruta = JSON.parse(crudo) as RutaGuia
    if (typeof ruta?.hastaClave !== 'string' || !Array.isArray(ruta.coords)) return null
    if (typeof ruta.desde?.lat !== 'number' || typeof ruta.desde?.lon !== 'number') return null
    return ruta
  } catch {
    return null
  }
}
function guardarGuia(ruta: RutaGuia): void {
  try {
    window.localStorage.setItem(CLAVE_GUIA_GUARDADA, JSON.stringify(ruta))
  } catch {
    // Sin almacenamiento: se calcula cada vez, como antes.
  }
}
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
/** Tú en el mapa, para la capa de avatares 3D. */
const CLAVE_YO = 'yo'
/**
 * Imagen transparente de lo que ocupa un avatar 3D de pie: el símbolo del mapa se
 * queda (toques, cursor, huecos) pero el cuerpo lo pinta la capa three.js.
 */
const ICONO_HUECO_3D = 'pj-hueco-3d'

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
/**
 * El trazado de un nodo, cosido a sus nodos: empieza en el anterior y
 * acaba EN este. El track grabado se queda a veces a unos metros -se grabó
 * por el camino y el nodo está al lado- y la línea no llegaba al halo.
 * Hasta 250 m se cose con un tramito recto; más lejos sería inventarse el
 * camino.
 */
function cerrarTramo(track: Punto[], desde: PlayerStage | null, hasta: PlayerStage): Punto[] {
  if (track.length < 2) return track
  const punto = (stage: PlayerStage | null): Punto | null => {
    if (!stage || stage.lat == null || stage.lon == null) return null
    const lat = Number(stage.lat)
    const lon = Number(stage.lon)
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  }
  const coser = (a: Punto, b: Punto | null): b is Punto => {
    if (!b) return false
    const metros = metrosEntre(a, b)
    return metros > 0.5 && metros < 250
  }
  const inicio = punto(desde)
  const fin = punto(hasta)
  return [
    ...(coser(track[0], inicio) ? [inicio] : []),
    ...track,
    ...(coser(track[track.length - 1], fin) ? [fin] : []),
  ]
}

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
/**
 * El radio de entrada, visto desde arriba: velo muy suave dentro y un anillo
 * que brilla justo en el borde, del color del tipo. Nada de relleno oscuro
 * (el círculo de antes, "cutre" y "demasiado oscuro").
 */
function dibujarEntrada(tipo: TipoDeNodo): ImageData | null {
  const escala = 2
  const lado = RADIO_ENTRADA_PX * 2 * escala
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  const c = lado / 2
  const hex = COLOR_TIPO[tipo]
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, hex + '0f')
  g.addColorStop(0.78, hex + '1a')
  g.addColorStop(0.9, hex + '59')
  g.addColorStop(0.965, hex + 'e6')
  g.addColorStop(1, hex + '00')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, lado, lado)
  return ctx.getImageData(0, 0, lado, lado)
}

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
/**
 * El montón de fotos de un nodo: dos tarjetas detrás, la primera foto
 * delante y cuántas hay. Antes las de un nodo no se veían hasta el zoom 18 y
 * entonces salían en fila, pequeñas y encima del camino ("se ven mal").
 */
function dibujarPila(imagen: HTMLImageElement | null, cuantas: number): ImageData | null {
  const lado = 64
  const lienzo = document.createElement('canvas')
  lienzo.width = lado * 2
  lienzo.height = lado * 2
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)
  const tarjeta = (angulo: number, dx: number, dy: number) => {
    ctx.save()
    ctx.translate(30 + dx, 36 + dy)
    ctx.rotate((angulo * Math.PI) / 180)
    ctx.beginPath()
    ctx.roundRect(-21, -21, 42, 42, 7)
    ctx.fillStyle = '#e2e8f0'
    ctx.shadowColor = 'rgba(0,0,0,.4)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 2
    ctx.fill()
    ctx.restore()
  }
  if (cuantas > 2) tarjeta(-12, -4, 1)
  if (cuantas > 1) tarjeta(9, 4, 0)
  // La de delante, con la foto.
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(8, 14, 44, 44, 8)
  ctx.fillStyle = '#f8fafc'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(11, 17, 38, 38, 6)
  ctx.clip()
  if (imagen) {
    const escala = Math.max(38 / imagen.width, 38 / imagen.height)
    const w = imagen.width * escala
    const h = imagen.height * escala
    ctx.drawImage(imagen, 11 + (38 - w) / 2, 17 + (38 - h) / 2, w, h)
  } else {
    ctx.fillStyle = '#94a3b8' // no-tema: color horneado en la imagen del montón
    ctx.fillRect(11, 17, 38, 38)
  }
  ctx.restore()
  // Cuántas.
  if (cuantas > 1) {
    ctx.beginPath()
    ctx.arc(50, 15, 11, 0, Math.PI * 2)
    ctx.fillStyle = '#0f172a' // no-tema: color horneado en la imagen del montón
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cuantas > 99 ? '99+' : String(cuantas), 50, 15.5)
  }
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height)
}

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
 * El icono de un grupo de compañeros: disco oscuro con el número dentro, en el
 * mismo lienzo (64 × 84) y con los pies en el mismo sitio que los muñecos, para
 * que compartan ancla y desplazamiento en la capa.
 */
function dibujarGrupo(cuantos: number): ImageData | null {
  const escala = 3
  const lienzo = document.createElement('canvas')
  lienzo.width = 64 * escala
  lienzo.height = 84 * escala
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  ctx.scale(escala, escala)
  const cx = 32
  const cy = 52
  ctx.beginPath()
  ctx.arc(cx, cy, 22, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 2
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.beginPath()
  ctx.arc(cx, cy, 19, 0, Math.PI * 2)
  ctx.fillStyle = '#1f302b'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 20px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(Math.min(cuantos, 99)), cx, cy + 1)
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
        [FUENTE_OTROS]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_CELEBRACION]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_GUIA]: { type: 'geojson', data: COLECCION_VACIA },
        [FUENTE_RELIEVE]: {
          type: 'raster-dem',
          tiles: [`${window.location.origin}/dem-tiles/{z}/{x}/{y}.png`],
          tileSize: 256,
          /**
           * La FORMA del terreno, sólo hasta z12 (el sombreado sí usa z14).
           * El dato de España es de ~30 m y z12 ya lo tiene entero; z13 y
           * z14 son el mismo dato remuestreado, un poco distinto en cada
           * nivel. Con la exageración de 2,2, al cruzar de un zoom a otro
           * el suelo -y los nodos encima- daba saltos. Desde z12 la malla
           * no cambia al ampliar, y de cerca el relieve sale más suave.
           */
          maxzoom: 12,
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
        // Sin fundido: las teselas salen de la caché al instante, y el
        // fundido de 300 ms era lo que hacía parecer que el mapa cargaba.
        { id: CAPA_TESELAS, type: 'raster', source: FUENTE_TESELAS, paint: { 'raster-fade-duration': 0 } },
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
          /**
           * Luz de varias direcciones (`multidirectional`) en vez de una sola
           * a 315°: con una única luz, las laderas que miran a ella se
           * aplanan y las opuestas se ennegrecen; con cuatro, TODA ladera
           * tiene forma y las sombras son más suaves. Mismo coste: es un
           * paso de la GPU sobre la misma fuente de elevación.
           */
          'hillshade-method': 'multidirectional',
          'hillshade-exaggeration': 0.8,
          'hillshade-illumination-direction': [315, 45, 270, 0],
          'hillshade-illumination-altitude': [38, 30, 30, 26],
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
          'hillshade-shadow-color': ['#0d1b33', '#16223a', '#1a2540', '#0f172a'], // no-tema
          'hillshade-highlight-color': ['#fff1cf', '#ffe2a8', '#fdebc4', '#fff6dc'],
          'hillshade-accent-color': '#1e293b', // no-tema
        },
        },
        /**
         * Sin círculo del radio de entrada. Óscar: "cutre". La fuente
         * sigue existiendo por si vuelve a hacer falta; lo que marca el
         * nodo en juego es el brillo en el suelo del propio nodo.
         *
         * EXCEPCIÓN: mapa mudo. Ahí SÍ hace falta un círculo -es la única
         * pista visual que tiene el jugador, a propósito no hay pin-, así
         * que estas dos capas se reutilizan (rellenas y visibles) solo
         * mientras el nodo en juego es de kind 'mapa_mudo' (ver el efecto
         * "Radio del nodo actual" más abajo, que las enciende/apaga).
         */
        {
        id: CAPA_RADIO_RELLENO,
        type: 'fill',
        source: FUENTE_RADIO,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': COLOR_NODO_ACTUAL,
          'fill-opacity': 0.14,
        },
        },
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
          'line-opacity': 0.62,
          // Contorno generoso y con un punto de desenfoque: la traza se lee
          // sobre asfalto claro, arena y monte oscuro por igual.
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 7, 16, 12, 19, 19],
          'line-blur': 0.9,
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
            // Lo ya andado del tramo en juego: verde un punto más oscuro que
            // lo hecho, para que se lea «por aquí ya pasaste».
            'andado',
            '#16a34a', // no-tema: color del estado «andado», como los del resto del trazado
            'actual',
            COLOR_NODO_ACTUAL,
            '#f8fafc',
          ],
          'line-opacity': ['match', ['get', 'estado'], 'pendiente', 0.6, 'andado', 0.8, 'hecho', 0.8, 1],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 7, 19, 12],
        },
      },
      {
        /**
         * Dirección: chevrones blancos que se repiten a lo largo de lo que
         * queda por andar, apuntando en el sentido de la marcha. Es una
         * línea con `line-pattern`, como el resto del trazado: va pegada al
         * terreno y no la entierra el relieve (un símbolo sobre la línea,
         * sí). Sólo de cerca: de lejos no caben.
         */
        id: CAPA_RUTA_FLECHAS,
        type: 'line',
        source: FUENTE_RUTA,
        minzoom: 16,
        filter: ['match', ['get', 'estado'], ['actual', 'pendiente'], true, false],
        layout: { 'line-cap': 'butt' },
        paint: {
          'line-pattern': ICONO_FLECHA_RUTA,
          'line-width': 12,
          'line-opacity': 0.92,
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
          // Trazo fijo: cambiarlo al vuelo recarga la fuente entera (ver `latir`).
          'line-dasharray': [2, 1.2],
        },
      },
      {
        /**
         * El radio de entrada del nodo en juego, a su tamaño REAL, tumbado
         * en el mapa. El halo que marcaba el nodo en juego medía lo mismo en
         * pantalla a cualquier zoom: de lejos era "enorme, más grande que el
         * trazado". Éste es el círculo donde el juego te deja entrar.
         */
        id: CAPA_NODO_ENTRADA,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mapa mudo: nunca el aro de entrada exacto, solo el círculo difuso
        // (CAPA_RADIO_RELLENO/CAPA_RADIO_BORDE) mientras kind === 'mapa_mudo'.
        filter: ['all', ['==', ['get', 'estado'], 'actual'], ['!=', ['get', 'mapaMudo'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'iconoEntrada'],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_ENTRADA,
        },
        paint: { 'icon-opacity': 0.9 },
      },
      {
        /**
         * El suelo de cada nodo: sombra y halo del color del tipo, TUMBADOS
         * sobre el mapa. Con la perspectiva real, en cualquier punto de la
         * pantalla y con cualquier inclinación, el nodo queda asentado.
         * Mismo ancla y mismo tamaño que el nodo: el poste cae en el centro.
         */
        id: CAPA_NODOS_SUELO,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mismo motivo que CAPA_NODO_ENTRADA: sin pin/halo sobre el nodo
        // mudo, ni siquiera el del suelo -solo el círculo difuso lo marca-.
        filter: ['!=', ['get', 'mapaMudo'], true],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'iconoSuelo'],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_NODOS,
          'symbol-sort-key': ['get', 'orden'],
          visibility: 'none',
        },
      },
      {
        // Resplandor del nodo en juego: late por icon-opacity (ver `latir`).
        id: CAPA_NODOS_HALO,
        type: 'symbol',
        source: FUENTE_NODOS_ICONOS,
        // Mapa mudo: sin resplandor -marcaría el punto exacto igual que la
        // chincheta que este halo acompaña-. Se apaga con el mismo filtro
        // que CAPA_NODOS_ICONOS.
        filter: ['all', ['==', ['get', 'estado'], 'actual'], ['!=', ['get', 'mapaMudo'], true]],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_HALO,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_NODOS,
        },
        paint: { 'icon-opacity': 0.6 },
      },
      {
        /**
         * Fotos de campo como símbolos del mapa, por lo mismo que los
         * nodos: un marcador del DOM va un fotograma por detrás del
         * terreno y "no se queda en su sitio" con relieve y zoom. La
         * miniatura se carga y se enmarca en un canvas bajo demanda (ver
         * `styleimagemissing`), y el motor la coloca en el mismo fotograma
         * que el resto del mapa.
         *
         * Va ENCIMA del suelo y del halo de los nodos, y debajo del nodo:
         * las de un nodo se reparten bajo su peana.
         */
        id: CAPA_FOTOS,
        type: 'symbol',
        source: FUENTE_FOTOS,
        // Las de los nodos van en su montón (CAPA_FOTOS_PILA).
        filter: ['!=', ['get', 'tipo'], 'pila'],
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_FOTOS,
          // Repartidas por grupo (ver `huecoDeFoto`): se pueden tocar una a una.
          /**
           * Repartidas SÓLO de muy cerca (zoom 18): de lejos, repartidas
           * "quedan fatal". Hasta ahí van juntas en su sitio y se ve una.
           */
          'icon-offset': ['step', ['zoom'], ['literal', [0, 0]], ZOOM_FOTOS_REPARTIDAS, DESPLAZAMIENTO_FOTOS],
          'symbol-sort-key': ['get', 'orden'],
        },
        // De lejos, sólo la primera de cada sitio; desde el zoom 18, todas repartidas.
        paint: {
          'icon-opacity': ['step', ['zoom'], ['case', ['==', ['get', 'orden'], 0], 1, 0], ZOOM_FOTOS_REPARTIDAS, 1],
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
        // Mapa mudo: sin chincheta -ni 2D ni 3D- mientras kind === 'mapa_mudo'.
        // Es la pieza principal que había que ocultar: sin este filtro el
        // pin marcaba el punto exacto encima del círculo difuso, delatándolo.
        filter: ['!=', ['get', 'mapaMudo'], true],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
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
          'icon-size': TAMANO_NODOS,
          // El nodo en juego se pinta el último: queda encima si se solapan.
          'symbol-sort-key': ['get', 'orden'],
        },
      },
      {
        // Las fotos de cada nodo, en un montón al lado de su base (ver `dibujarPila`).
        id: CAPA_FOTOS_PILA,
        type: 'symbol',
        source: FUENTE_FOTOS,
        filter: ['==', ['get', 'tipo'], 'pila'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom-left',
          'icon-offset': [48, -4],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_PILA,
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
        // Mapa mudo: sin moneda flotante -es el marcador 3D que delataría el
        // punto exacto en modo 3D-, mismo filtro que CAPA_NODOS_ICONOS.
        filter: ['!=', ['get', 'mapaMudo'], true],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono3dm'],
          'icon-anchor': 'bottom',
          'icon-offset': [0, DESPLAZAMIENTO_ANCLA_PX],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_NODOS,
          'symbol-sort-key': ['get', 'orden'],
          visibility: 'none',
        },
        paint: { 'icon-translate': [0, 0], 'icon-translate-anchor': 'viewport' },
      },
      {
        // El suelo de cada compañero: aro del color de su equipo y flecha de rumbo, tumbados.
        id: CAPA_SUELO_OTROS,
        type: 'symbol',
        source: FUENTE_OTROS,
        filter: ['has', 'suelo'],
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'suelo'],
          'icon-rotate': ['number', ['get', 'rumbo'], 0],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_JUGADOR,
        },
        paint: { 'icon-opacity': ['number', ['get', 'opacidad'], 1] },
      },
      {
        /**
         * Los COMPAÑEROS, como símbolos del mapa y no como marcadores del DOM.
         *
         * Los marcadores del DOM (5.42-5.43) se colocan desde JavaScript un
         * fotograma después del terreno y, con relieve y zoom, "se iban a otras
         * zonas de Galicia". Un símbolo lo coloca el motor, en la posición REAL,
         * a cualquier zoom y a la altura del suelo, igual que los nodos. Mismo
         * ancla, misma altura y mismo tamaño compuesto que tu avatar.
         *
         * Si caen encima de ti o unos de otros se separan en PANTALLA con
         * `icon-offset` (dato `hueco`), nunca moviendo sus coordenadas. Va ANTES
         * de tu capa: tú siempre quedas encima. Los datos van por `pintarFuente`
         * (sin `setData` repetido) y la opacidad por presencia es un dato del
         * punto, no un `setPaintProperty` (que repinta el terreno entero).
         */
        id: CAPA_OTROS,
        type: 'symbol',
        source: FUENTE_OTROS,
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_JUGADOR,
          'icon-offset': OFFSET_DE_HUECO,
          'symbol-sort-key': ['get', 'orden'],
        },
        paint: { 'icon-opacity': ['number', ['get', 'opacidad'], 1] },
      },
      {
        // Tu suelo: aro del color de tu equipo y flecha hacia donde caminas.
        id: CAPA_SUELO_JUGADOR,
        type: 'symbol',
        source: FUENTE_JUGADOR,
        filter: ['has', 'suelo'],
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'suelo'],
          'icon-rotate': ['number', ['get', 'rumbo'], 0],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_JUGADOR,
        },
      },
      {
        /**
         * Aura alrededor de ti: cian con GPS (`gps`), naranja en modo prueba
         * (`debug`). Radio fijo en píxeles, como en el mapa antiguo; no es la
         * precisión real en metros.
         */
        id: CAPA_AURA,
        type: 'circle',
        source: FUENTE_JUGADOR,
        filter: ['!=', ['get', 'aura'], 'ninguna'],
        paint: {
          // Crece con el avatar (TAMANO_JUGADOR: 0,8 a 1,9): fijo en 27 px a zoom 12 se comía el muñeco.
          'circle-radius': ['interpolate', ['exponential', 1.25], ['zoom'], 12, 16, 20, 38],
          // Tumbada en el suelo, alrededor de los pies (ahora el muñeco apoya en el punto).
          'circle-pitch-alignment': 'map',
          'circle-color': ['match', ['get', 'aura'], 'debug', '#fb923c', '#22d3ee'],
          'circle-opacity': 0.14,
          'circle-stroke-width': 2,
          'circle-stroke-color': ['match', ['get', 'aura'], 'debug', '#c2410c', '#0891b2'],
          'circle-stroke-opacity': 0.6,
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
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ['get', 'icono'],
          'icon-anchor': 'bottom',
          'icon-offset': [0, DESPLAZAMIENTO_PIES_PX],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_JUGADOR,
        },
      },
      /**
       * La celebración de un nodo completado (ver avatares/celebracion.ts).
       * Sólo símbolos: no los «dibuja» el terreno, así que animarlos cambiando
       * los datos no repinta el relieve. `s` y `o` (escala y opacidad) son datos
       * del punto: un `icon-size` que depende de un dato NO tiene el tope de
       * zoom de las teselas, igual que los nodos.
       */
      {
        id: CAPA_CELEB_ONDA,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'onda'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_ONDA,
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'map',
          'icon-rotation-alignment': 'map',
          'icon-size': TAMANO_CELEBRACION,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
      {
        id: CAPA_CELEB_BRILLO,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'brillo'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_BRILLO,
          'icon-anchor': 'bottom',
          'icon-offset': [0, DESPLAZAMIENTO_ANCLA_PX],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_CELEBRACION,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
      {
        id: CAPA_CELEB_CHISPAS,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'chispa'],
        layout: {
          'symbol-height-offset': ALTURA_SIMBOLOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_CHISPA,
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_CHISPAS,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
      {
        id: CAPA_CELEB_INSIGNIA,
        type: 'symbol',
        source: FUENTE_CELEBRACION,
        filter: ['==', ['get', 'tipo'], 'insignia'],
        layout: {
          'symbol-height-offset': ALTURA_NODOS_M,
          'symbol-height-anchor': 'ground' as const,
          'icon-image': ICONO_CELEB_INSIGNIA,
          'icon-anchor': 'bottom',
          // Encima de la moneda del nodo (la imagen del nodo mide ALTO_BOLA_PX y la moneda va arriba).
          'icon-offset': [0, DESPLAZAMIENTO_ANCLA_PX - CENTRO_HALO_3D_PX - 6],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport',
          'icon-size': TAMANO_CELEBRACION,
        },
        paint: { 'icon-opacity': ['number', ['get', 'o'], 0] },
      },
    ],
      /**
       * Exageración 1.5: el desnivel real de la ruta es suave y a escala
       * exacta, desde el aire, casi no se aprecia. Subirlo más convierte
       * el monte en una sierra que no existe.
       */
      /**
       * Exageración 1,5 (era 2,2). Con 2,2, cerca de un monte la cámara -que
       * va unos 470 m por detrás de ti a zoom 17- quedaba DENTRO del relieve
       * y MapLibre le bajaba a la fuerza la inclinación y el zoom (medido: de
       * 55° a 15°), con saltos al ampliar y el centrado descolocado.
       */
      terrain: { source: FUENTE_RELIEVE, exaggeration: 1.5 },
      /**
       * Cielo y niebla del horizonte. Con la cámara inclinada el borde del
       * mapa era un corte seco contra el fondo; con esto el terreno lejano se
       * funde con el aire y el horizonte da profundidad. Es una sola pasada
       * en la parte alta de la pantalla y no toca las teselas.
       */
      sky: {
        'sky-color': '#5b9bd5', // no-tema: cielo del mapa
        'sky-horizon-blend': 0.55,
        'horizon-color': '#dbe8f3', // no-tema: cielo del mapa
        'horizon-fog-blend': 0.6,
        'fog-color': '#c7d6e3', // no-tema: cielo del mapa
        'fog-ground-blend': 0.22,
      },
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
  gpsState,
  debugSimulation = false,
  gpsAccuracy = null,
  onDebugSetPosition,
  onNodeTap,
  otherPlayers,
}: MapSurfacePropsGL) {
  /**
   * La pantalla no se apaga mientras el mapa está delante.
   *
   * Sin esto el móvil se autobloqueaba a los 30 s sin tocarlo -se camina con el
   * móvil en la mano mirando el mapa, sin tocarlo-, y la página oculta se leía
   * como «se fue a mirar otra app» (ver hooks/salidasDeLaApp.ts). El navegador
   * suelta el bloqueo solo al ocultarse la página y el gestor lo vuelve a pedir
   * al volver. La hoja de los retos pide lo mismo por su cuenta.
   */
  useWakeLock(true)

  /** WebGL no disponible: no hay mapa, sí aviso. */
  const [sinWebGL, setSinWebGL] = useState(false)
  /** Callbacks y datos que leen los escuchadores del mapa (se registran una vez). */
  const debugRef = useRef({ activo: false, alPosicionar: onDebugSetPosition, alNodo: onNodeTap })
  debugRef.current = { activo: debugSimulation, alPosicionar: onDebugSetPosition, alNodo: onNodeTap }
  const etapaActualRef = useRef(currentStage)
  etapaActualRef.current = currentStage
  /** Una foto tocada no cuenta como toque al mapa (ni mueve al jugador en modo prueba). */
  const fotoTocadaRef = useRef(false)
  /** Lo que hay en cada punto de la capa de compañeros (índice = propiedad `idx`). */
  const elementosOtrosRef = useRef<ElementoDeMapa[]>([])
  const popupOtrosRef = useRef<maplibregl.Popup | null>(null)
  // Tu posición, para el popup (distancia) y para apartar a los demás de ti.
  const miPosicionRef = useRef<Punto | null>(null)
  const totalNodosRef = useRef(0)
  const [zoomActual, setZoomActual] = useState(16)
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<maplibregl.Map | null>(null)
  /** El aviso de "pintado" se da una vez; la prop puede cambiar de identidad entre renders. */
  const onListoRef = useRef(onListo)
  onListoRef.current = onListo
  /** `número-estado-tipo` y posición de cada nodo: lo que se hornea bajo la carga. */
  const nodosParaHornearRef = useRef<{ clave: string; lon: number; lat: number }[]>([])
  /**
   * El precalentado en curso (ver `calentar`), para pararlo. Se medía en el
   * móvil: si la carga se quitaba por tope antes de acabar, la cámara seguía
   * saltando de zoom delante del jugador y, al final, volvía a donde estaba
   * al empezar, pisando el "centrar en mí" o el seguimiento del GPS: "no se
   * centra bien".
   */
  const calentadoRef = useRef<{ cancelar: (restaurarZoom: boolean) => void } | null>(null)
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
  const rutaCaminosRef = useRef<RutaGuia | null>(null)
  const guiaLeidaRef = useRef(false)
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
  const focusRequestRef = useRef(focusRequest)
  focusRequestRef.current = focusRequest
  /** Tu color de equipo (#rrggbb en minúsculas) y el aura del GPS, para el bucle de dibujo. */
  const miColorRef = useRef('#3b82f6')
  const auraRef = useRef('ninguna')
  /** Tu foto de perfil (vista 2D), si el servidor te la sirve. */
  const miFotoRef = useRef<string | null>(null)
  const gpsAccuracyRef = useRef<number | null>(gpsAccuracy)
  gpsAccuracyRef.current = gpsAccuracy
  /** Tú y cada compañero: deslizan entre fixes del GPS y saben hacia dónde caminan. */
  const yoRef = useRef(new Deslizador())
  const deslizadoresOtrosRef = useRef(new Map<string, Deslizador>())
  type BaseOtro = {
    clave: string
    lat: number
    lon: number
    /** Color de equipo si es un jugador suelto (lleva aro y flecha); null en un grupo. */
    color: string | null
    props: Record<string, unknown>
    /** Su aspecto 3D si es un jugador suelto y está conectado; null si va en grupo o sin conexión. */
    aspecto: Aspecto | null
    /** Su personaje y su foto de perfil (si tiene), para el retrato de la vista 2D; null en un grupo. */
    mx: MxId | null
    foto: string | null
  }
  const basesOtrosRef = useRef<BaseOtro[]>([])
  const bucleActivoRef = useRef(false)
  const movilRef = useRef<{ dibujar: () => boolean; arrancar: () => void } | null>(null)
  /** La celebración de un nodo completado, y qué hay pendiente de empezar. */
  const celebracionRef = useRef(new Celebracion())
  const celebracionEnRef = useRef<{ lat: number; lon: number } | null>(null)
  const pendienteCelebrarRef = useRef<{ plan: NonNullable<ReturnType<typeof decidirCelebracion>>; desde: number } | null>(null)
  const nivelPrevioRef = useRef<number | null>(null)
  const nivelRef = useRef(currentLevel)
  nivelRef.current = currentLevel
  /** Hasta cuándo no se sigue al jugador con la cámara (celebración y vuelo en curso). */
  const retenerSeguimientoRef = useRef(0)
  const celebrarRef = useRef<(() => void) | null>(null)
  const cortarCelebracionRef = useRef<(() => void) | null>(null)
  /** Lo andado del tramo en juego y el trazado de ese tramo (para cortarlo en tu posición). */
  const tramoActualRef = useRef<Punto[]>([])
  const [progresoRuta, setProgresoRuta] = useState({ clave: '', m: 0 })
  const progresoRutaPrevio = useRef({ clave: '', m: 0 })
  const [mapaListo, setMapaListo] = useState(false)
  const [elegido, setElegido] = useState<AvatarConfig | null>(null)
  const usuarioYo = String(selfProfile?.user || selfProfile?.id || '')
  /**
   * Tu aspecto 3D: el que acabas de elegir; si hay uno pendiente de subir, el del
   * móvil; si no, el del servidor (si lo eligió él); si no, el del móvil, y si no
   * hay nada, el que te toca por tu id (igual en todos los móviles).
   */
  const avatarServidor = normalizarAvatar(selfProfile?.character_chosen ? selfProfile?.avatar : null)
  const miAspecto: Aspecto =
    partsAAspecto(elegido?.parts) ??
    partsAAspecto(usuarioYo && hayPendiente(usuarioYo) ? avatarLocal(usuarioYo)?.parts : null) ??
    partsAAspecto(avatarServidor?.parts) ??
    partsAAspecto(usuarioYo ? avatarLocal(usuarioYo)?.parts : null) ??
    aspectoPorDefecto(usuarioYo || 'player')
  const miAspectoRef = useRef<Aspecto>(miAspecto)
  miAspectoRef.current = miAspecto
  /** Los avatares 3D (complemento de la capa three.js) y quiénes van en 3D ahora mismo. */
  const avataresRef = useRef<ComplementoDeAvatares | null>(null)
  /** Pone la capa three.js (con los avatares) en el mapa si falta: tras cargar el estilo y tras rehacerlo. */
  const aplicarCapaAvataresRef = useRef<(() => void) | null>(null)
  const enTresDRef = useRef<ReadonlySet<string>>(new Set())
  const marcadoresNodosRef = useRef<maplibregl.Marker[]>([])
  /** Miniatura de cada foto por nombre de icono, para dibujarla cuando el mapa la pida. */
  const fotosPorIconoRef = useRef(new Map<string, string>())
  /** Lo último recibido, para resolver un toque sobre una foto sin cerrar props viejas. */
  const fotosRef = useRef<FieldProof[]>([])
  /** Las fotos por sitio: el visor abre el grupo entero, empezando por la tocada. */
  const gruposFotosRef = useRef<FieldProof[][]>([])
  const abrirFotosRef = useRef<((proofs: FieldProof[]) => void) | undefined>(undefined)

  /** Lo último que se mandó pintar a cada fuente, para poder reintentarlo. */
  const ultimoDatoRef = useRef(new Map<string, GeoJSON.FeatureCollection>())
  /**
   * Lo que tiene DE VERDAD cada fuente: el objeto de la fuente y los datos
   * que se le dieron. `setData` no mira si es lo mismo: recorta y recoloca
   * la fuente entera cada vez. Y `volcarPendientes` cuelga de `styledata`,
   * que salta con CADA cambio de estilo -diez por segundo, por `latir`-:
   * todo el trazado, los nodos y las fotos se reteselaban sin parar. Eran
   * los nodos y fotos que aparecían y desaparecían y los tirones al hacer
   * zoom. Sólo se vuelca a una fuente nueva (tras rehacer el estilo) o lo
   * que de verdad ha cambiado.
   */
  const aplicadoRef = useRef(
    new Map<string, { fuente: maplibregl.GeoJSONSource; datos: GeoJSON.FeatureCollection; json: string }>()
  )
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

    // Sin WebGL, MapLibre lanza al construirse. Se mira antes -sin dejar un
    // contexto vivo- y también se atrapa el lanzamiento, por si el
    // navegador cambia de opinión entre una cosa y otra.
    const hayWebGL = (() => {
      try {
        const lienzo = document.createElement('canvas')
        const contexto = lienzo.getContext('webgl2') || lienzo.getContext('webgl')
        contexto?.getExtension('WEBGL_lose_context')?.loseContext()
        return Boolean(contexto)
      } catch {
        return false
      }
    })()
    let mapaCreado: maplibregl.Map | null = null
    if (hayWebGL) {
      try {
        mapaCreado = new maplibregl.Map({
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
      /**
       * Nodos y fotos sin fundido: al cruzar de un zoom a otro MapLibre
       * rehace los símbolos y los fundía -300 ms- entre el viejo y el
       * nuevo. Era el "desamplío y los nodos desaparecen y aparecen".
       */
      fadeDuration: 0,
      // Al pellizcar, las teselas pedidas siguen su curso: cancelarlas a
      // cada paso del gesto dejaba el mapa en blanco hasta soltar.
      cancelPendingTileRequestsWhileZooming: false,
      /**
       * Más teselas en memoria: ocho niveles de zoom en vez de cinco. Al
       * desampliar y volver, lo que ya se vio sigue ahí en vez de leerse y
       * decodificarse otra vez ("se tiene que cargar de vuelta").
       */
      maxTileCacheZoomLevels: 8,
      // El estilo va declarado en crudo, NO por URL: una URL de estilo
      // sería una petición más que falla sin cobertura, justo lo que no
      // puede pasar en el monte. Sin sprites ni fuentes por el mismo
      // motivo: cada recurso externo es otra cosa que puede faltar.
      style: estiloDelMapa(),
        })
      } catch {
        mapaCreado = null
      }
    }
    if (!mapaCreado) {
      setSinWebGL(true)
      // La pantalla de carga espera a `onListo`: sin mapa, no hay nada que esperar.
      onListoRef.current?.()
      return
    }
    const mapa = mapaCreado

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
    const alFaltarImagen = (evento: { id: string }) => {
      if (evento.id === ICONO_HUECO_3D) {
        if (mapa.hasImage(evento.id)) return
        // El hueco tocable de quien va en 3D: 56 × 96 px a tamaño 1 (~63 × 107 a z16, ~100 × 170 a z19,5): el cuerpo mide
        // 80-126 px y un dedo necesita ~44 px de ancho. Transparente: sólo sirve para recibir el toque.
        mapa.addImage(evento.id, { width: 56, height: 96, data: new Uint8Array(56 * 96 * 4) }, { pixelRatio: 1 })
        return
      }
      const conFoto = leerIdDeFoto(evento.id)
      if (conFoto) {
        if (mapa.hasImage(evento.id)) return
        // Su foto de perfil (vista 2D). Mientras llega sale la cara de su personaje; al llegar se repinta.
        const imagen = dibujarRetratoConFoto(conFoto.url, conFoto.mx, conFoto.color, () => {
          const nueva = dibujarRetratoConFoto(conFoto.url, conFoto.mx, conFoto.color)
          if (nueva && mapaRef.current === mapa && mapa.hasImage(evento.id)) mapa.updateImage(evento.id, nueva)
        })
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const retrato = leerIdDeRetrato(evento.id)
      if (retrato) {
        if (mapa.hasImage(evento.id)) return
        // Sin la cara todavía sale la inicial; al llegar (de la caché del móvil) se repinta.
        const imagen = dibujarRetratoDeMapa(retrato.mx, retrato.color, () => {
          const nueva = dibujarRetratoDeMapa(retrato.mx, retrato.color)
          if (nueva && mapaRef.current === mapa && mapa.hasImage(evento.id)) mapa.updateImage(evento.id, nueva)
        })
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const sueloJugador = /^pjs-([0-9a-f]{6})-([01])$/.exec(evento.id)
      if (sueloJugador) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarSueloDeJugador(`#${sueloJugador[1]}`, sueloJugador[2] === '1')
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      const grupoOtros = /^otros-grupo-(\d+)$/.exec(evento.id)
      if (grupoOtros) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarGrupo(Number(grupoOtros[1]))
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
        return
      }
      if (
        evento.id === ICONO_FLECHA_RUTA ||
        evento.id === ICONO_CELEB_ONDA ||
        evento.id === ICONO_CELEB_CHISPA ||
        evento.id === ICONO_CELEB_INSIGNIA ||
        evento.id === ICONO_CELEB_BRILLO
      ) {
        if (mapa.hasImage(evento.id)) return
        const imagen =
          evento.id === ICONO_FLECHA_RUTA
            ? dibujarFlechaDeRuta()
            : evento.id === ICONO_CELEB_ONDA
              ? dibujarOnda()
              : evento.id === ICONO_CELEB_CHISPA
                ? dibujarChispa()
                : evento.id === ICONO_CELEB_INSIGNIA
                  ? dibujarInsignia()
                  : dibujarBrilloDeNodo(ANCHO_BOLA_PX, ALTO_BOLA_PX, CENTRO_HALO_3D_PX)
        const escala = evento.id === ICONO_CELEB_ONDA ? 2 : 3
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: escala })
        return
      }
      const pila = /^pila-(.+)-(\d+)$/.exec(evento.id)
      if (pila) {
        if (mapa.hasImage(evento.id)) return
        const cuantas = Number(pila[2])
        const vacio = dibujarPila(null, cuantas)
        if (vacio) mapa.addImage(evento.id, vacio, { pixelRatio: 2 })
        const url = fotosPorIconoRef.current.get(`foto-${pila[1]}`)
        if (!url) return
        const imagen = new Image()
        imagen.crossOrigin = 'anonymous'
        imagen.onload = () => {
          const lista = dibujarPila(imagen, cuantas)
          if (!lista || !mapaRef.current) return
          if (mapa.hasImage(evento.id)) mapa.updateImage(evento.id, lista)
          else mapa.addImage(evento.id, lista, { pixelRatio: 2 })
        }
        imagen.src = url
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
      const entrada = /^entrada-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (entrada) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarEntrada(entrada[1] as TipoDeNodo)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 2 })
        return
      }
      const suelo = /^suelo-(hecho|actual|pendiente)-(checkpoint|qr|minijuego|coleccionable)$/.exec(evento.id)
      if (suelo) {
        if (mapa.hasImage(evento.id)) return
        const imagen = dibujarSuelo(suelo[1] as 'hecho' | 'actual' | 'pendiente', suelo[2] as TipoDeNodo)
        if (imagen) mapa.addImage(evento.id, imagen, { pixelRatio: 3 })
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
    }
    mapa.on('styleimagemissing', alFaltarImagen)
    // Las caras de los retratos, ya; y las que fallaron sin red se piden otra vez al volver y se repintan.
    precargarCaras()
    const repintarRetratos = () => {
      if (mapaRef.current !== mapa) return
      for (const id of mapa.listImages()) {
        const retrato = leerIdDeRetrato(id)
        const foto = retrato ? null : leerIdDeFoto(id)
        const nueva = retrato
          ? dibujarRetratoDeMapa(retrato.mx, retrato.color)
          : foto
            ? dibujarRetratoConFoto(foto.url, foto.mx, foto.color)
            : null
        if (nueva) mapa.updateImage(id, nueva)
      }
    }
    const alVolverLaRedCaras = () => {
      reintentarCaras(repintarRetratos)
      reintentarFotos(repintarRetratos)
    }
    window.addEventListener('online', alVolverLaRedCaras)

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
    /**
     * La capa three.js (donde viven los avatares 3D) se pone encima de los símbolos de
     * jugador y debajo de la celebración. Los nodos NO se pintan en ella: siguen siendo
     * los símbolos horneados de siempre. Si el estilo se rehace la capa desaparece, y
     * esto la vuelve a poner.
     */
    aplicarCapaAvataresRef.current = () => {
      const vivo = mapaRef.current
      const capa = capaNodosRef.current
      if (!vivo || !capa || !avataresRef.current) return
      try {
        if (!vivo.getLayer(CAPA_NODOS_TRES_D) && vivo.getLayer(CAPA_CELEB_ONDA)) {
          vivo.addLayer(capa.capa, CAPA_CELEB_ONDA)
        }
      } catch {
        // Estilo a medias: se repite en el siguiente `styledata`.
      }
    }
    const volcarPendientes = () => {
      const vivo = mapaRef.current
      if (!vivo) return
      aplicarCapaAvataresRef.current?.()
      for (const [id, datos] of ultimoDatoRef.current) {
        const fuente = vivo.getSource(id) as maplibregl.GeoJSONSource | undefined
        if (!fuente) continue
        const previo = aplicadoRef.current.get(id)
        if (previo && previo.fuente === fuente && previo.datos === datos) continue
        aplicadoRef.current.set(id, { fuente, datos, json: JSON.stringify(datos) })
        fuente.setData(datos)
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
        if (vivo.getLayer(CAPA_NODOS_SUELO)) {
          vivo.setLayoutProperty(CAPA_NODOS_SUELO, 'visibility', enTresD ? 'visible' : 'none')
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
    /**
     * Mientras el mapa se mueve, nada de animar.
     *
     * Cada `setPaintProperty` da el estilo por cambiado y, con relieve,
     * MapLibre tira entonces TODAS las texturas del terreno -la foto, el
     * sombreado y las líneas pintadas encima- y las repinta en el
     * fotograma siguiente. Diez veces por segundo, en pleno pellizco: eran
     * los tirones al ampliar y desampliar. Parado no se nota; moviéndose,
     * se pausa hasta un momento después de soltar.
     */
    let ultimoMovimiento = 0
    const enMovimiento = (m: maplibregl.Map) => {
      const ahora = performance.now()
      if (m.isMoving()) ultimoMovimiento = ahora
      return ahora - ultimoMovimiento < 300
    }
    const latir = () => {
      if (!pulsoVivo) return
      const vivo = mapaRef.current
      /**
       * Con algo encima -un minijuego a pantalla completa, una hoja con el
       * fondo desenfocado, la pantalla final- nadie ve el pulso, y cada cambio
       * de opacidad hace que MapLibre repinte el terreno entero: en un móvil de
       * gama baja eso es lo que más pesa, justo cuando hay un juego que
       * necesita el procesador. Se para el pulso y se vuelve a mirar cada medio
       * segundo (ver hooks/useCubreElMapa.ts).
       */
      const cubierto = mapaCubierto()
      if (vivo && !cubierto && document.visibilityState === 'visible' && !enMovimiento(vivo)) {
        try {
          if (vivo.getLayer(CAPA_RUTA_PULSO)) {
            const fase = (performance.now() / 1000) * ((Math.PI * 2) / 1.6)
            vivo.setPaintProperty(CAPA_RUTA_PULSO, 'line-opacity', 0.12 + 0.5 * (0.5 + 0.5 * Math.sin(fase)))
          }
          if (vivo.getLayer(CAPA_NODOS_HALO)) {
            const fase = (performance.now() / 1000) * ((Math.PI * 2) / 1.8)
            vivo.setPaintProperty(CAPA_NODOS_HALO, 'icon-opacity', 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(fase)))
            if (vivo.getLayer(CAPA_NODO_ENTRADA)) {
              vivo.setPaintProperty(CAPA_NODO_ENTRADA, 'icon-opacity', 0.6 + 0.35 * (0.5 + 0.5 * Math.sin(fase)))
            }
          }
          if (tresDRef.current && vivo.getLayer(CAPA_NODOS_MONEDA)) {
            // La moneda sube y baja despacio, como en una poképarada.
            const flota = -3 - 3 * Math.sin((performance.now() / 1000) * ((Math.PI * 2) / 2.6))
            vivo.setPaintProperty(CAPA_NODOS_MONEDA, 'icon-translate', [0, flota])
            if (vivo.getLayer(CAPA_NODOS_HALO)) vivo.setPaintProperty(CAPA_NODOS_HALO, 'icon-translate', [0, flota])
          }
          if (vivo.getLayer(CAPA_GUIA)) {
            /**
             * La guía late en opacidad. Antes el trazo "crecía" cambiando
             * `line-dasharray`, y esa propiedad no es una más: MapLibre
             * recarga la fuente entera cada vez que cambia -cada 160 ms-,
             * con su reteselado en el worker y el terreno repintado.
             */
            const fase = (performance.now() / 1000) * ((Math.PI * 2) / 1.2)
            vivo.setPaintProperty(CAPA_GUIA, 'line-opacity', 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(fase)))
          }
        } catch {
          // Entre un rehecho del estilo y el siguiente la capa puede no estar.
        }
      }
      window.setTimeout(latir, cubierto ? 500 : 100)
    }
    latir()

    // La animación de los nodos 3D (si la capa está puesta) también se para.
    capaNodosRef.current?.pausar(mapaCubierto())
    const dejarDeVigilarCobertura = alCambiarCoberturaDelMapa((cubierto) => {
      capaNodosRef.current?.pausar(cubierto)
    })

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

    /**
     * Todo lo que el juego va a enseñar, preparado BAJO la pantalla de
     * carga y no cuando aparece.
     *
     * 1. Los nodos. Cada poképarada es un render de three.js que se hacía
     *    la primera vez que el nodo salía en pantalla: llegabas a la zona y
     *    no había puntos, el mapa se trababa horneándolos y salían después.
     * 2. Los zooms de alrededor. Al entrar sólo estaba el zoom de la vista;
     *    al desampliar, 2-3 segundos en blanco mientras se leían las
     *    teselas. Se pasa por dos zooms más lejanos y por la ruta entera,
     *    y se vuelve: todo eso queda en la memoria del mapa.
     *
     * Con tope: a los doce segundos de crear el mapa se deja lo que falte.
     * El de la carga (ver PlayerApp) es mayor, así que el velo nunca se
     * levanta con la cámara aún dando saltos.
     */
    const calentar = async (vivo: maplibregl.Map) => {
      const tope = desde + 12000
      const respiro = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      const claves = nodosParaHornearRef.current.map((nodo) => nodo.clave)
      const entradas = claves.filter((clave) => clave.includes('-actual-')).map((clave) => `entrada-${clave.split('-')[2]}`)
      const imagenes = tresDRef.current
        ? [
            ...entradas,
            ICONO_HALO_3D,
            ...claves.flatMap((clave) => [`suelo-${clave.replace(/^\d+-/, '')}`, `nodo3d-${clave}`, `nodo3dm-${clave}`]),
          ]
        : [ICONO_HALO, ...entradas, ...claves.map((clave) => `nodo-${clave}`)]
      for (const id of imagenes) {
        if (!mapaRef.current || performance.now() > tope) return
        if (vivo.hasImage(id)) continue
        alFaltarImagen({ id })
        await respiro()
      }

      let capas = 0
      try {
        capas = vivo.getStyle().layers.length
      } catch {
        capas = 0
      }
      if (capas === 0) return
      const esperarTeselas = (maximo: number) =>
        new Promise<void>((resolve) => {
          const inicio = performance.now()
          const fin = Math.min(inicio + maximo, tope)
          const id = window.setInterval(() => {
            const ahora = performance.now()
            // Unos fotogramas de gracia: justo tras mover la cámara, las
            // teselas nuevas aún no se han pedido y "todo cargado" miente.
            if (mapaRef.current && ahora - inicio < 200) return
            if (!mapaRef.current || cancelado || vivo.areTilesLoaded() || ahora > fin) {
              window.clearInterval(id)
              resolve()
            }
          }, 100)
        })
      const camara = {
        center: vivo.getCenter(),
        zoom: vivo.getZoom(),
        pitch: vivo.getPitch(),
        bearing: vivo.getBearing(),
      }
      let cancelado = false
      // Los saltos de zoom del calentamiento no se ven: el lienzo queda
      // transparente hasta que la cámara vuelve a su sitio. Si el velo de
      // carga ya se había ido (móvil lento), lo que se veía era el mapa
      // saltando; ahora el mapa aparece una sola vez, ya colocado.
      const lienzo = vivo.getCanvas()
      lienzo.style.opacity = '0'
      const mostrarLienzo = () => {
        lienzo.style.opacity = ''
      }
      calentadoRef.current = {
        // Quien mueve el mapa de verdad manda: se deja de saltar y, si es el
        // propio juego (seguir, encuadrar), se devuelve el zoom antes de que
        // él ponga el centro.
        cancelar: (restaurarZoom) => {
          if (cancelado) return
          cancelado = true
          calentadoRef.current = null
          if (restaurarZoom) vivo.jumpTo({ zoom: camara.zoom, pitch: camara.pitch, bearing: camara.bearing })
          mostrarLienzo()
        },
      }
      // Cada nivel por el que se desampliará, no saltando: el que se salta
      // es el que luego falta (ver `maxTileCacheZoomLevels`).
      const vistas: (() => void)[] = [1, 2, 3, 4.5].map((menos) => () => vivo.jumpTo({ zoom: camara.zoom - menos }))
      const posiciones = nodosParaHornearRef.current
      if (posiciones.length > 1) {
        const limites = new maplibregl.LngLatBounds()
        for (const nodo of posiciones) limites.extend([nodo.lon, nodo.lat])
        vistas.push(() => vivo.fitBounds(limites, { padding: 70, duration: 0, maxZoom: 16, pitch: camara.pitch }))
      }
      for (const ver of vistas) {
        if (!mapaRef.current || cancelado || performance.now() > tope) break
        ver()
        await esperarTeselas(2500)
      }
      if (!mapaRef.current || cancelado) return
      calentadoRef.current = null
      vivo.jumpTo(camara)
      mostrarLienzo()
      await esperarTeselas(1500)
    }

    /**
     * Y en ratos libres, lo que pedirá el siguiente paso: el nodo en juego
     * ya hecho y el siguiente en juego. Así, al completar uno, el cambio de
     * imagen no se hornea en ese momento.
     */
    const adelantarSiguientes = () => {
      if (!tresDRef.current) return
      const claves = nodosParaHornearRef.current.map((nodo) => nodo.clave)
      const enJuego = claves.findIndex((clave) => clave.includes('-actual-'))
      if (enJuego < 0) return
      const siguientes = [claves[enJuego].replace('-actual-', '-hecho-')]
      if (claves[enJuego + 1]) siguientes.push(claves[enJuego + 1].replace('-pendiente-', '-actual-'))
      const trabajos = siguientes.flatMap((clave) => {
        const [numero, estadoSig, tipoSig] = clave.split('-')
        return (['base', 'moneda'] as const).map(
          (parte) => () => renderizarBola(Number(numero), estadoSig as 'hecho' | 'actual' | 'pendiente', tipoSig as TipoDeNodo, parte)
        )
      })
      const siguiente = () => {
        const trabajo = trabajos.shift()
        if (!trabajo || !mapaRef.current) return
        trabajo()
        window.setTimeout(siguiente, 400)
      }
      window.setTimeout(siguiente, 1500)
    }

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
      void calentar(vivo).finally(() => {
        if (!mapaRef.current) return
        onListoRef.current?.()
        setMapaListo(true)
        capaNodosRef.current?.arrancarAnimacion()
        adelantarSiguientes()
      })
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
    const alZoom = () => setZoomActual(Math.round(mapa.getZoom() * 2) / 2)
    mapa.on('zoomend', alZoom)
    alZoom()

    /**
     * Si el jugador mueve el mapa con la mano, "seguirme" se apaga. Sólo
     * gestos con `originalEvent`: los movimientos que hace el propio
     * código (seguir, encuadrar) no cuentan, o se apagaría solo.
     */
    const alTocar = (evento: { originalEvent?: unknown }) => {
      if (evento.originalEvent) {
        // Tocar el mapa corta la celebración y se queda donde estás mirando.
        cortarCelebracionRef.current?.()
        calentadoRef.current?.cancelar(false)
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

    /**
     * Al acabar cada movimiento, la altura del centro = la del terreno ahí.
     *
     * Medido en el móvil simulado: tras "ver la ruta" (centro en un alto,
     * 943 m con la exageración) y volver a ti (886 m), MapLibre dejaba la
     * cámara con la altura del centro de antes. El centro estaba en tus
     * coordenadas, pero tú salías 100 px más abajo: "centra, pero se mueve
     * más hacia arriba de más". Con la altura corregida quedas en el centro
     * exacto. Si ya coincide (lo normal), no se toca nada.
     */
    mapa.on('moveend', () => {
      if (!mapa.getTerrain()) return
      const real = mapa.queryTerrainElevation(mapa.getCenter())
      if (real == null || !Number.isFinite(real)) return
      if (Math.abs(mapa.getCenterElevation() - real) > 2) mapa.setCenterElevation(real)
    })

    mapa.on('click', CAPA_FOTOS, (evento) => {
      const props = evento.features?.[0]?.properties as { grupo?: number; id?: string | number } | undefined
      if (!props || typeof props.grupo !== 'number') return
      fotoTocadaRef.current = true
      // Se abren TODAS las de ese sitio -en un nodo suele haber varias y el
      // visor ya sabe pasarlas-, empezando por la que se ha tocado.
      const grupo = gruposFotosRef.current[props.grupo] || []
      const tocada = grupo.findIndex((foto) => String(foto.id) === String(props.id))
      const ordenadas = tocada > 0 ? [...grupo.slice(tocada), ...grupo.slice(0, tocada)] : grupo
      if (ordenadas.length) abrirFotosRef.current?.(ordenadas)
    })
    mapa.on('click', CAPA_FOTOS_PILA, (evento) => {
      const props = evento.features?.[0]?.properties as { grupo?: number; id?: string | number } | undefined
      if (!props || typeof props.grupo !== 'number') return
      fotoTocadaRef.current = true
      // Se abren TODAS las de ese sitio -en un nodo suele haber varias y el
      // visor ya sabe pasarlas-, empezando por la que se ha tocado.
      const grupo = gruposFotosRef.current[props.grupo] || []
      const tocada = grupo.findIndex((foto) => String(foto.id) === String(props.id))
      const ordenadas = tocada > 0 ? [...grupo.slice(tocada), ...grupo.slice(0, tocada)] : grupo
      if (ordenadas.length) abrirFotosRef.current?.(ordenadas)
    })
    /**
     * Tocar a un compañero (o a un grupo): la tarjeta oscura, anclada a su
     * posición REAL. El contenido se rehace al abrir (la distancia y el «hace
     * 2 min» cambian).
     */
    // Cualquier toque corta la celebración (los gestos con mano ya lo hacen por `alTocar`).
    const alPulsar = () => cortarCelebracionRef.current?.()
    mapa.on('touchstart', alPulsar)
    mapa.on('mousedown', alPulsar)
    /**
     * Tocar un avatar 3D (el tuyo o el de un compañero). Se mide en pantalla (`tocado`), no con el hueco del
     * símbolo: MapLibre lo alza 3 m y, con el cuerpo de 30-60 px, tocar el cuerpo no daba en él. Va ANTES de los
     * toques por capa, que se saltan este mismo toque.
     */
    let toqueDeAvatar: unknown = null
    const abrirPopupDe = (el: ElementoDeMapa) => {
      fotoTocadaRef.current = true
      popupOtrosRef.current?.remove()
      const ventana = new maplibregl.Popup({ offset: 26, closeButton: false, maxWidth: '300px' })
      ventana.on('open', () =>
        ventana.setDOMContent(
          el.tipo === 'grupo'
            ? contenidoPopupGrupo(el.jugadores, () => ventana.remove())
            : contenidoPopupJugador(
                el.jugadores[0],
                el.presencia,
                totalNodosRef.current,
                miPosicionRef.current,
                () => ventana.remove(),
                true
              )
        )
      )
      ventana.setLngLat([el.lon, el.lat]).addTo(mapa)
      popupOtrosRef.current = ventana
    }
    mapa.on('click', (evento) => {
      if (debugRef.current.activo) return
      const clave = avataresRef.current?.tocado(evento.point.x, evento.point.y)
      if (!clave) return
      toqueDeAvatar = evento.originalEvent ?? null
      if (clave === CLAVE_YO) {
        fotoTocadaRef.current = true
        window.dispatchEvent(new CustomEvent(EVENTO_MENU_DE_GESTOS))
        return
      }
      const el = elementosOtrosRef.current.find((x) => x.clave === clave)
      if (el) abrirPopupDe(el)
    })
    // Tocarte a ti mismo: el selector de personaje (en modo prueba el toque coloca al jugador).
    mapa.on('click', CAPA_JUGADOR, (evento) => {
      if (debugRef.current.activo) return
      if (toqueDeAvatar !== null && toqueDeAvatar === evento.originalEvent) return
      fotoTocadaRef.current = true
      // Con tu avatar 3D a la vista, el menú de gestos; si no, directo a la tienda de ropa.
      window.dispatchEvent(
        new CustomEvent(avataresRef.current?.enTresD().has(CLAVE_YO) ? EVENTO_MENU_DE_GESTOS : EVENTO_ELEGIR_PERSONAJE)
      )
    })
    mapa.on('mouseenter', CAPA_JUGADOR, () => {
      if (!debugRef.current.activo) mapa.getCanvas().style.cursor = 'pointer'
    })
    mapa.on('mouseleave', CAPA_JUGADOR, () => {
      mapa.getCanvas().style.cursor = debugRef.current.activo ? 'crosshair' : ''
    })
    /**
     * Al destapar el mapa (se cierra una hoja, vuelve la pantalla): se
     * redibujan los muñecos donde toca AHORA y se empieza la celebración que
     * estuviera esperando.
     */
    const dejarDeVigilarMovil = alCambiarCoberturaDelMapa((cubierto) => {
      if (cubierto) return
      movilRef.current?.dibujar()
      movilRef.current?.arrancar()
      celebrarRef.current?.()
    })
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      movilRef.current?.dibujar()
      movilRef.current?.arrancar()
    }
    document.addEventListener('visibilitychange', alVolver)
    // Un rumbo caduca solo al quedarte quieto: se repasa de vez en cuando (no pinta si no cambia nada).
    const relojRumbo = window.setInterval(() => {
      if (!mapaCubierto() && document.visibilityState === 'visible') movilRef.current?.dibujar()
    }, 3000)

    mapa.on('click', CAPA_OTROS, (evento) => {
      if (toqueDeAvatar !== null && toqueDeAvatar === evento.originalEvent) return
      const props = evento.features?.[0]?.properties as { idx?: number } | undefined
      const el = props && typeof props.idx === 'number' ? elementosOtrosRef.current[props.idx] : undefined
      if (!el) return
      abrirPopupDe(el)
    })
    mapa.on('mouseenter', CAPA_OTROS, () => {
      mapa.getCanvas().style.cursor = 'pointer'
    })
    mapa.on('mouseleave', CAPA_OTROS, () => {
      mapa.getCanvas().style.cursor = debugRef.current.activo ? 'crosshair' : ''
    })
    mapa.on('mouseenter', CAPA_FOTOS, () => {
      mapa.getCanvas().style.cursor = 'pointer'
    })
    mapa.on('mouseleave', CAPA_FOTOS, () => {
      mapa.getCanvas().style.cursor = debugRef.current.activo ? 'crosshair' : ''
    })

    /**
     * Toque en el mapa. Va DESPUÉS de los de las fotos (mismo orden de
     * registro = mismo orden de disparo), que levantan `fotoTocadaRef`.
     *
     * - Modo prueba: coloca al jugador donde se toca. Es el recurso que
     *   siempre está disponible cuando no hay GPS.
     * - Si no: un toque sobre el nodo actual (o dentro de su radio de
     *   entrada) avisa a `onNodeTap`. Se mide en píxeles con `project`, sin
     *   `queryRenderedFeatures` (no vale en algunos móviles con relieve).
     */
    mapa.on('click', (evento) => {
      if (fotoTocadaRef.current) {
        fotoTocadaRef.current = false
        return
      }
      const { activo, alPosicionar, alNodo } = debugRef.current
      if (activo) {
        alPosicionar?.({ lat: evento.lngLat.lat, lon: evento.lngLat.lng })
        return
      }
      const etapa = etapaActualRef.current
      if (!alNodo || !etapa || etapa.lat == null || etapa.lon == null) return
      if (String(etapa.kind || '') === 'mapa_mudo') return
      const punto = mapa.project([etapa.lon, etapa.lat])
      const metrosPorPixel =
        (156543.03392 * Math.cos((etapa.lat * Math.PI) / 180)) / Math.pow(2, mapa.getZoom())
      const radio = typeof etapa.radius === 'number' && etapa.radius > 0 ? etapa.radius : 30
      const umbral = Math.max(36, radio / metrosPorPixel)
      if (Math.hypot(evento.point.x - punto.x, evento.point.y - punto.y) <= umbral) alNodo()
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
      // Las lecturas de diagnóstico de la capa 3D (gl.readPixels) sólo se
      // encienden aquí: cada una hace esperar a la GPU y no hacen falta para jugar.
      capaNodosRef.current?.activarDiagnostico(true)
      // El estilo también: en una pestaña que no pinta, MapLibre nunca
      // monta el estilo (espera un fotograma). Con esto se puede forzar
      // desde fuera y medir las capas de datos aunque nadie mire.
      ventana.__sagaEstilo = estiloDelMapa
      ;(window as unknown as { __sagaNodos3D?: () => unknown }).__sagaNodos3D = () => capaNodosRef.current?.estadisticas()
      ;(window as unknown as { __sagaCapa3D?: () => unknown }).__sagaCapa3D = () => capaNodosRef.current?.interno()
      ;(window as unknown as { __sagaAvatares?: () => unknown }).__sagaAvatares = () => avataresRef.current
    }

    return () => {
      pulsoVivo = false
      dejarDeVigilarCobertura()
      dejarDeVigilarMovil()
      document.removeEventListener('visibilitychange', alVolver)
      window.clearInterval(relojRumbo)
      window.removeEventListener('online', alVolverLaRedCaras)
      mapa.off('touchstart', alPulsar)
      mapa.off('mousedown', alPulsar)
      celebracionRef.current.cancelar()
      window.clearInterval(esperarPintado)
      mapa.off('rotate', alGirar)
      mapa.off('zoomend', alZoom)
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
      popupOtrosRef.current?.remove()
      popupOtrosRef.current = null
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
      if (!fuente) return
      const coleccion = datos as GeoJSON.FeatureCollection
      const json = JSON.stringify(coleccion)
      const previo = aplicadoRef.current.get(id)
      // Lo mismo otra vez (el efecto se rehace al refrescar la misión): no se toca.
      if (previo && previo.fuente === fuente && previo.json === json) {
        previo.datos = coleccion
        return
      }
      aplicadoRef.current.set(id, { fuente, datos: coleccion, json })
      fuente.setData(coleccion)
    },
    // `versionEstilo` no se usa dentro, pero al cambiar obliga a repintar
    // tras un rescate del estilo, que es justo lo que hace falta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [versionEstilo]
  )

  /**
   * Dibuja a todos en su posición DE AHORA (la interpolada entre fixes) y
   * dice si alguno sigue deslizándose. `pintarFuente` no toca el mapa si los
   * datos no han cambiado, así que llamarla de más sale gratis.
   */
  const dibujarMovil = useCallback((): boolean => {
    const ahora = performance.now()
    const yo = yoRef.current
    const posYo = yo.posicion(ahora)
    if (!posYo) {
      pintarFuente(FUENTE_JUGADOR, COLECCION_VACIA)
    } else {
      const rumbo = yo.rumboSuave(ahora)
      const yoEnTresD = enTresDRef.current.has(CLAVE_YO)
      // Tu foto de perfil en el retrato: en la vista 2D y también en la 3D cuando el zoom lejano te pasa a retrato.
      const miFoto = urlDeFotoValida(miFotoRef.current) ? miFotoRef.current : null
      pintarFuente(FUENTE_JUGADOR, {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            // En 3D el símbolo es un hueco transparente (sigue siendo tocable): el cuerpo lo pinta la capa three.js,
            // con su aro de equipo EN el suelo; ni el aro de símbolo (que flotaba a 3 m, a la cintura) ni el aura.
            properties: yoEnTresD
              ? { aura: 'ninguna', icono: ICONO_HUECO_3D }
              : {
                  aura: auraRef.current,
                  // Tu foto (2D, o 3D lejos); sin ella, la cara de tu personaje.
                  icono: miFoto
                    ? idDeRetratoConFoto(miFoto, miAspectoRef.current.mx, miColorRef.current)
                    : idDeRetrato(miAspectoRef.current.mx, miColorRef.current),
                  // Vista 2D y quieto: la punta del pin ya marca el sitio y el aro del pin el equipo; el suelo
                  // sólo aparece si hay rumbo que enseñar (su flecha) o si el mapa está inclinado.
                  ...(tresDRef.current || rumbo !== null
                    ? { suelo: `pjs-${miColorRef.current.slice(1)}-${rumbo === null ? 0 : 1}`, rumbo: rumbo === null ? 0 : Math.round(rumbo) }
                    : {}),
                },
            geometry: { type: 'Point', coordinates: [posYo.lon, posYo.lat] },
          },
        ],
      })
    }
    let moviendose = yo.enMovimiento(ahora)
    const features = basesOtrosRef.current.map((base) => {
      const d = deslizadoresOtrosRef.current.get(base.clave)
      const pos = d?.posicion(ahora) ?? { lat: base.lat, lon: base.lon }
      if (d?.enMovimiento(ahora)) moviendose = true
      const propiedades: Record<string, unknown> = { ...base.props }
      const enTresD = Boolean(base.aspecto) && enTresDRef.current.has(base.clave)
      if (enTresD) {
        // En 3D el cuerpo está en su sitio real: el hueco tocable también (sin abrirlo en corro).
        propiedades.icono = ICONO_HUECO_3D
        propiedades.hueco = 0
      } else if (base.foto && base.mx) {
        // Retrato (vista 2D, o 3D con el zoom lejano): cada uno con SU foto de perfil.
        propiedades.icono = idDeRetratoConFoto(base.foto, base.mx, base.color ?? '#3b82f6')
      }
      // El aro del equipo de quien va en 3D lo pinta la capa three.js, tumbado EN el suelo: el símbolo flotaba a 3 m.
      if (base.color && !enTresD) {
        const rumbo = d?.rumboSuave(ahora) ?? null
        // Igual que el tuyo: en 2D y quieto, sin suelo (el pin ya lleva el aro del equipo).
        if (tresDRef.current || rumbo !== null) {
          propiedades.suelo = `pjs-${base.color.slice(1)}-${rumbo === null ? 0 : 1}`
          propiedades.rumbo = rumbo === null ? 0 : Math.round(rumbo)
        }
      }
      return {
        type: 'Feature' as const,
        properties: propiedades,
        geometry: { type: 'Point' as const, coordinates: [pos.lon, pos.lat] },
      }
    })
    pintarFuente(FUENTE_OTROS, { type: 'FeatureCollection', features })
    return moviendose
  }, [pintarFuente])

  /**
   * El bucle del deslizamiento: a ~15 dibujos por segundo y SÓLO mientras
   * alguien se está moviendo. Quieto, no hay bucle ni `setData`. Sólo toca
   * fuentes de símbolos (no se dibujan sobre el terreno), nunca una
   * `setPaintProperty`, y se para con la pestaña oculta o con algo tapando el
   * mapa (ver hooks/useCubreElMapa.ts); al destapar se reanuda.
   */
  const arrancarBucle = useCallback(() => {
    if (bucleActivoRef.current) return
    bucleActivoRef.current = true
    let ultimo = 0
    const paso = (t: number) => {
      if (!mapaRef.current || document.visibilityState !== 'visible' || mapaCubierto()) {
        bucleActivoRef.current = false
        return
      }
      if (t - ultimo >= intervaloDeDibujoMs(mapaRef.current.getZoom())) {
        ultimo = t
        if (!dibujarMovil()) {
          bucleActivoRef.current = false
          return
        }
      }
      window.requestAnimationFrame(paso)
    }
    window.requestAnimationFrame(paso)
  }, [dibujarMovil])
  movilRef.current = { dibujar: dibujarMovil, arrancar: arrancarBucle }

  /**
   * Los avatares 3D: un complemento de la capa three.js de los nodos. Se carga
   * aparte (y sus modelos salen de la caché del móvil, nunca de la red): si algo
   * falla, el mapa sigue con los retratos redondos.
   */
  useEffect(() => {
    const capaNodos = capaNodosRef.current
    if (!capaNodos || sinWebGL) return undefined
    let cancelado = false
    let quitar: (() => void) | null = null
    capaNodos.dibujarNodos(false)
    const lista: JugadorAvatar[] = []
    void import('../avatares3d/mixamo/capaAvatares')
      .then((m) => {
        if (cancelado) return
        const comp = m.crearComplementoDeAvatares({
          proveedor: () => {
            lista.length = 0
            const ahora = performance.now()
            const yo = yoRef.current
            const pos = yo.posicion(ahora)
            if (pos) {
              lista.push({ clave: CLAVE_YO, lat: pos.lat, lon: pos.lon, rumbo: yo.rumbo(ahora), aspecto: miAspectoRef.current, esYo: true, color: miColorRef.current })
            }
            for (const base of basesOtrosRef.current) {
              if (!base.aspecto) continue
              const d = deslizadoresOtrosRef.current.get(base.clave)
              const p = d?.posicion(ahora) ?? { lat: base.lat, lon: base.lon }
              lista.push({ clave: base.clave, lat: p.lat, lon: p.lon, rumbo: d?.rumbo(ahora) ?? null, aspecto: base.aspecto, esYo: false, color: base.color ?? '#3b82f6' })
            }
            return lista
          },
          alCambiar: (tresD) => {
            enTresDRef.current = tresD
            // Quien pasa a 3D deja de pintar su retrato (queda el hueco tocable), y al revés.
            movilRef.current?.dibujar()
          },
          pedirFotograma: () => capaNodos.repintar(),
        })
        avataresRef.current = comp
        const quitarComplemento = capaNodos.anadirComplemento(comp)
        // Un modelo que falló (sin red al arrancar, caché a medias) se reintenta al volver la red y cada minuto y medio.
        const reintentar = () => comp.reintentarCarga()
        window.addEventListener('online', reintentar)
        const temporizador = window.setInterval(reintentar, 90000)
        quitar = () => {
          window.removeEventListener('online', reintentar)
          window.clearInterval(temporizador)
          quitarComplemento()
        }
        aplicarCapaAvataresRef.current?.()
      })
      .catch(() => undefined)
    return () => {
      cancelado = true
      quitar?.()
      avataresRef.current = null
      enTresDRef.current = new Set()
    }
  }, [sinWebGL])

  // Reenviar al servidor el personaje que se eligió sin cobertura.
  useEffect(() => {
    if (!usuarioYo) return undefined
    void reintentarPendiente(usuarioYo)
    const alVolverLaRed = () => void reintentarPendiente(usuarioYo)
    window.addEventListener('online', alVolverLaRed)
    return () => window.removeEventListener('online', alVolverLaRed)
  }, [usuarioYo])

  // El selector vive en PlayerApp (antes de la carga y desde Herramientas): aquí sólo se
  // recibe lo elegido para verlo al instante, sin esperar al siguiente fix del servidor.
  useEffect(() => {
    const alElegir = (ev: Event) => {
      const detalle = (ev as CustomEvent<unknown>).detail
      const config = normalizarAvatar(detalle)
      if (config) setElegido(config)
    }
    window.addEventListener(EVENTO_PERSONAJE_ELEGIDO, alElegir)
    return () => window.removeEventListener(EVENTO_PERSONAJE_ELEGIDO, alElegir)
  }, [])

  // Un gesto de tu avatar 3D (el menú que sale al tocarte).
  useEffect(() => {
    const alGesto = (ev: Event) => {
      const clip = (ev as CustomEvent<unknown>).detail
      if (typeof clip === 'string' && clip.startsWith('ge__')) avataresRef.current?.gesto(CLAVE_YO, clip)
    }
    window.addEventListener(EVENTO_GESTO, alGesto)
    return () => window.removeEventListener(EVENTO_GESTO, alGesto)
  }, [])

  // El personaje cambió: se redibuja sin esperar al siguiente fix.
  useEffect(() => {
    dibujarMovil()
  }, [miAspecto.mx, dibujarMovil])

  // Tu posición: te deslizas de un fix al siguiente y caminas hacia donde miras.
  useEffect(() => {
    const color = getPlayerColor(selfProfile || {})
    miColorRef.current = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#3b82f6'
    miFotoRef.current = getPlayerAvatarUrl(selfProfile || {}) || null
    auraRef.current = debugSimulation ? 'debug' : gpsState === 'ready' || gpsState === 'stale' ? 'gps' : 'ninguna'
    const mapa = mapaRef.current

    if (!playerPosition) {
      yoRef.current = new Deslizador()
      dibujarMovil()
      return
    }
    yoRef.current.poner({ lat: playerPosition.lat, lon: playerPosition.lon }, performance.now(), gpsAccuracyRef.current)
    dibujarMovil()
    arrancarBucle()

    // Cuánto del tramo en juego llevas andado (se pinta distinto de lo que queda).
    const tramo = tramoActualRef.current
    if (tramo.length > 1) {
      const clave = String(nivelRef.current)
      const minimo = progresoRutaPrevio.current.clave === clave ? progresoRutaPrevio.current.m : 0
      const nuevo = progresoAndado(tramo, playerPosition, minimo)
      if (nuevo !== progresoRutaPrevio.current.m || progresoRutaPrevio.current.clave !== clave) {
        progresoRutaPrevio.current = { clave, m: nuevo }
        setProgresoRuta({ clave, m: nuevo })
      }
    }

    /**
     * Seguirme, sin tirones.
     *
     * Cada aviso del GPS lanzaba una animación de 600 ms, y como los avisos
     * llegan cada pocos segundos -a veces con el anterior sin terminar-, el
     * mapa iba a sacudidas. Ahora: no se sigue mientras el jugador tiene
     * el mapa en la mano, no se sigue por menos de tres metros, y la
     * animación es más larga que el intervalo entre avisos, así que una
     * enlaza con la siguiente en vez de cortarla. Dura lo mismo que el
     * deslizamiento del muñeco (el ritmo de los fixes, lineal): cámara y muñeco van a la vez.
     * Durante la celebración de un nodo no se sigue (la cámara vuela al
     * siguiente nodo y se queda un momento enseñándolo).
     */
    if (followPlayerRef.current && mapa && !gestoRef.current && performance.now() >= retenerSeguimientoRef.current) {
      const anterior = ultimoSeguimientoRef.current
      // Un encuadre «centrar en mí» pendiente (el modo prueba lo pide al
      // colocarte) va a mover el mapa en este mismo fotograma: seguir además
      // lanzaba dos animaciones seguidas, y la segunda pisaba a la primera.
      const encuadrePendiente =
        focusRequestRef.current?.target === 'player' && ultimoEncuadreRef.current !== focusRequestRef.current.token
      if (encuadrePendiente) {
        ultimoSeguimientoRef.current = { lat: playerPosition.lat, lon: playerPosition.lon }
      } else if (!anterior || metrosEntre(anterior, playerPosition) >= 3) {
        ultimoSeguimientoRef.current = { lat: playerPosition.lat, lon: playerPosition.lon }
        calentadoRef.current?.cancelar(true)
        mapa.easeTo({
          center: [playerPosition.lon, playerPosition.lat],
          // Lo mismo que dura el deslizamiento del muñeco (el ritmo de los fixes): cámara y muñeco, a la vez.
          duration: yoRef.current.duracionMs(),
          easing: (x) => x,
          essential: true,
        })
      }
    }
  }, [
    playerPosition?.lat,
    playerPosition?.lon,
    selfProfile?.color,
    selfProfile?.display_name,
    selfProfile?.avatar_ref,
    selfProfile?.avatar_url,
    gpsState,
    debugSimulation,
    dibujarMovil,
    arrancarBucle,
  ])

  // Fuera del trazado la guía sale de ti sin más: sin el aro del GPS/modo
  // prueba alrededor (tu marcador ya lo dice, y el aro quedaba en el suelo,
  // separado del avatar, como un segundo círculo).
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    try {
      if (mapa.getLayer(CAPA_AURA)) {
        mapa.setLayoutProperty(CAPA_AURA, 'visibility', fueraDeTrazado !== null ? 'none' : 'visible')
      }
    } catch {
      // Sin estilo todavía: se aplica en cuanto vuelva a cambiar algo.
    }
  }, [fueraDeTrazado, versionEstilo])

  // Cursor en cruz en modo prueba: se ve que tocar mueve al jugador.
  useEffect(() => {
    const mapa = mapaRef.current
    if (mapa) mapa.getCanvas().style.cursor = debugSimulation ? 'crosshair' : ''
  }, [debugSimulation])

  /**
   * El resto del grupo: símbolos de una capa del mapa (ver CAPA_OTROS). Cada
   * jugador va en su posición real; los solapados, con un hueco en pantalla.
   * Cada uno es su personaje (en la vista 2D, su foto de perfil), con el
   * aro de su color en el suelo, y se desliza de un fix al siguiente.
   */
  useEffect(() => {
    miPosicionRef.current = playerPosition ? { lat: playerPosition.lat, lon: playerPosition.lon } : null
    totalNodosRef.current = missionStages?.length || 0
    const ahora = performance.now()
    const elementos = planDeJugadores(otherPlayers || [], zoomActual, miPosicionRef.current)
    elementosOtrosRef.current = elementos
    const vivos = new Set<string>()
    basesOtrosRef.current = elementos.map((el, idx) => {
      vivos.add(el.clave)
      let d = deslizadoresOtrosRef.current.get(el.clave)
      if (!d) {
        d = new Deslizador()
        deslizadoresOtrosRef.current.set(el.clave, d)
      }
      d.poner({ lat: el.lat, lon: el.lon }, ahora)
      const grupo = el.tipo === 'grupo'
      const j = el.jugadores[0]
      const colorCrudo = grupo ? null : getPlayerColor(j)
      const color = grupo ? null : colorCrudo && /^#[0-9a-f]{6}$/i.test(colorCrudo) ? colorCrudo.toLowerCase() : '#3b82f6'
      return {
        clave: el.clave,
        lat: el.lat,
        lon: el.lon,
        color,
        aspecto: grupo || el.presencia === 'offline' ? null : aspectoDe(j),
        mx: grupo ? null : aspectoDe(j).mx,
        foto: grupo ? null : urlDeFotoValida(getPlayerAvatarUrl(j)) ? getPlayerAvatarUrl(j) : null,
        props: {
          idx,
          icono: grupo ? `otros-grupo-${el.jugadores.length}` : idDeRetrato(aspectoDe(j).mx, color ?? '#3b82f6'),
          hueco: el.hueco,
          // Tú siempre encima (otra capa); entre ellos, los conectados encima.
          orden: (grupo ? 3 : 0) + ordenDePresencia(el.presencia),
          // Sólo quien está SIN conexión se apaga; el que se vio hace poco se ve sólido, como el que está en línea.
          opacidad: el.presencia === 'offline' ? 0.7 : 1,
        },
      }
    })
    for (const clave of [...deslizadoresOtrosRef.current.keys()]) {
      if (!vivos.has(clave)) deslizadoresOtrosRef.current.delete(clave)
    }
    dibujarMovil()
    arrancarBucle()
  }, [otherPlayers, zoomActual, playerPosition, missionStages?.length, dibujarMovil, arrancarBucle])

  /**
   * La celebración al completar un nodo (ver avatares/celebracion.ts).
   *
   * Pasa EXACTAMENTE de un nivel al siguiente con el mapa pintado: onda,
   * brillo, chispas e insignia sobre el nodo hecho (1 s) y, después, la cámara
   * vuela a enseñarte el siguiente nodo (1,3 s). Mapa mudo: nunca se vuela a un
   * nodo de posición secreta, y si el nodo hecho era de mapa mudo el festejo se
   * hace sobre TI, no sobre unas coordenadas que podrían no ser las reales.
   * Con «reducir movimiento» sólo hay un destello quieto y sin vuelo. Tocar el
   * mapa la corta en seco; si hay algo tapando el mapa, espera a que lo destapen.
   */
  const empezarCelebracion = useCallback(() => {
    const pendiente = pendienteCelebrarRef.current
    const mapa = mapaRef.current
    if (!pendiente || !mapa) return
    if (performance.now() - pendiente.desde > CADUCA_ESPERANDO_MS) {
      pendienteCelebrarRef.current = null
      return
    }
    if (mapaCubierto()) return
    pendienteCelebrarRef.current = null
    const { plan } = pendiente
    const hecho = (Array.isArray(missionStages) ? missionStages : [])[plan.nodoHecho]
    const secreto = String((hecho as { kind?: string } | undefined)?.kind || '').toLowerCase() === 'mapa_mudo'
    const donde =
      !secreto && typeof hecho?.lat === 'number' && typeof hecho?.lon === 'number'
        ? { lat: hecho.lat as number, lon: hecho.lon as number }
        : miPosicionRef.current
    if (!donde) return
    celebracionEnRef.current = donde
    celebracionRef.current.iniciar(plan, performance.now())
    // Tu avatar 3D (si está a la vista) también lo festeja, con un gesto alegre.
    avataresRef.current?.festejar(CLAVE_YO)
    retenerSeguimientoRef.current = plan.conVuelo ? performance.now() + 1000 + DURACION_VUELO_MS + 1500 : 0

    const volar = () => {
      const siguiente = (Array.isArray(missionStages) ? missionStages : [])[nivelRef.current]
      if (
        !siguiente ||
        typeof siguiente.lat !== 'number' ||
        typeof siguiente.lon !== 'number' ||
        String((siguiente as { kind?: string }).kind || '').toLowerCase() === 'mapa_mudo'
      ) {
        return
      }
      const limites = new maplibregl.LngLatBounds()
      limites.extend([siguiente.lon, siguiente.lat])
      if (miPosicionRef.current) limites.extend([miPosicionRef.current.lon, miPosicionRef.current.lat])
      mapa.fitBounds(limites, {
        padding: { top: 150, bottom: 240, left: 60, right: 60 },
        maxZoom: 17.5,
        duration: DURACION_VUELO_MS,
        bearing: mapa.getBearing(),
        pitch: mapa.getPitch(),
      })
    }

    const limpiar = () => pintarFuente(FUENTE_CELEBRACION, COLECCION_VACIA)
    let ultimo = 0
    const paso = (t: number) => {
      const c = celebracionRef.current
      const ahora = performance.now()
      const { fase, cambio } = c.avanzar(ahora)
      if (fase === 'inactiva') {
        limpiar()
        return
      }
      if (mapaCubierto()) {
        // Algo tapó el mapa a medias: nadie la ve, se da por terminada.
        c.cancelar()
        limpiar()
        return
      }
      if (cambio && fase === 'vuelo') volar()
      if (t - ultimo >= 50) {
        ultimo = t
        if (fase === 'festejo') {
          const x = c.progresoFestejo(ahora)
          const centro = celebracionEnRef.current as Punto
          const features: GeoJSON.Feature[] = []
          const punto = (props: Record<string, unknown>, lat = centro.lat, lon = centro.lon): GeoJSON.Feature => ({
            type: 'Feature',
            properties: props,
            geometry: { type: 'Point', coordinates: [lon, lat] },
          })
          const b = curvaBrillo(x)
          features.push(punto({ tipo: 'brillo', s: b.escala, o: b.opacidad }))
          const r = curvaRebote(x)
          features.push(punto({ tipo: 'insignia', s: plan.reducido ? 1 : r.escala, o: r.opacidad }))
          if (!plan.reducido) {
            for (const [i, retraso] of [0, 0.22].entries()) {
              const o = curvaOnda(x, retraso)
              features.push(punto({ tipo: 'onda', s: o.escala, o: o.opacidad, i }))
            }
            // Las chispas salen en píxeles de pantalla; aquí, a metros con el zoom de ahora.
            const mpp = metrosPorPixel(mapa.getZoom(), centro.lat)
            const grados = 1 / 111320
            for (const ch of curvaChispas(x)) {
              features.push(
                punto(
                  { tipo: 'chispa', s: ch.escala, o: ch.opacidad },
                  centro.lat - ch.dy * mpp * grados,
                  centro.lon + (ch.dx * mpp * grados) / Math.cos((centro.lat * Math.PI) / 180)
                )
              )
            }
          }
          pintarFuente(FUENTE_CELEBRACION, { type: 'FeatureCollection', features })
        } else {
          limpiar()
        }
      }
      window.requestAnimationFrame(paso)
    }
    window.requestAnimationFrame(paso)
  }, [missionStages, pintarFuente])
  celebrarRef.current = empezarCelebracion
  cortarCelebracionRef.current = () => {
    if (!celebracionRef.current.cancelar()) return
    retenerSeguimientoRef.current = 0
    pintarFuente(FUENTE_CELEBRACION, COLECCION_VACIA)
    mapaRef.current?.stop()
  }

  useEffect(() => {
    if (!mapaListo) return
    const previo = nivelPrevioRef.current
    nivelPrevioRef.current = currentLevel
    const siguiente = (Array.isArray(missionStages) ? missionStages : [])[currentLevel]
    const plan = decidirCelebracion({
      previo,
      actual: currentLevel,
      totalNodos: missionStages?.length || 0,
      reducido: prefiereMenosMovimiento(typeof window !== 'undefined' ? window.matchMedia?.bind(window) : undefined),
      siguienteEsMapaMudo: String((siguiente as { kind?: string } | undefined)?.kind || '').toLowerCase() === 'mapa_mudo',
      mapaListo,
    })
    if (!plan) return
    pendienteCelebrarRef.current = { plan, desde: performance.now() }
    empezarCelebracion()
    // Sólo al cambiar de nivel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, mapaListo])

  // 2D / 3D: modelos en 3D, chinchetas planas en 2D.
  useEffect(() => {
    aplicarModoRef.current?.()
    // En retrato cada uno se ve con su foto (2D y 3D lejos); en 3D cerca, con su personaje: los iconos se eligen al dibujar.
    movilRef.current?.dibujar()
  }, [tresD])

  // Las fotos de perfil, ya (de la caché del móvil): así el mapa 2D no sale primero con las caras de los personajes.
  useEffect(() => {
    precargarFotos([miFotoRef.current, ...basesOtrosRef.current.map((b) => b.foto)])
  }, [otherPlayers, selfProfile?.avatar_ref, selfProfile?.avatar_url])

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
    // Mapa mudo: sin línea guía hacia el nodo mientras esté oculto -llevaría
    // recto justo al centro del círculo difuso, que es exactamente la pista
    // que este juego no quiere dar-. Vuelve sola en cuanto kind pasa a
    // 'checkpoint' (nodo completado).
    const esMapaMudo = String(currentStage?.kind || '') === 'mapa_mudo'
    if (!playerPosition || currentStage?.lat == null || currentStage?.lon == null || esMapaMudo) {
      pintarFuente(FUENTE_GUIA, COLECCION_VACIA)
      setFueraDeTrazado(null)
      return
    }
    const nodo = { lat: currentStage.lat as number, lon: currentStage.lon as number }
    const track = cerrarTramo(leerTrackDelNodo(currentStage), null, currentStage)
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
      if (!guiaLeidaRef.current) {
        guiaLeidaRef.current = true
        rutaCaminosRef.current = rutaCaminosRef.current ?? leerGuiaGuardada()
      }
      const previa = rutaCaminosRef.current
      const mismaMeta = previa !== null && previa.hastaClave === claveObjetivo
      const desdePrevia = previa !== null && mismaMeta ? metrosEntre(previa.desde, playerPosition) : Infinity
      if (previa && desdePrevia < 15) {
        porCaminos = previa.coords
      } else {
        // Mientras se calcula la buena, la de antes si sale de cerca (hasta
        // 150 m; p. ej. la guardada de la última vez en casa): aparece al
        // instante y se cambia en cuanto llega la nueva.
        if (previa && desdePrevia < 150 && previa.coords.length > 0) porCaminos = previa.coords
        else esperandoCaminos = true
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
            if (coords && coords.length > 0) guardarGuia(rutaCaminosRef.current)
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
    calentadoRef.current?.cancelar(true)

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
  //
  // Mapa mudo: mientras el kind del nodo en juego siga siendo 'mapa_mudo'
  // (el servidor no lo cambia a 'checkpoint' hasta completarlo), lat/lon/
  // radius YA vienen difuminados desde el servidor -no hay nada que
  // difuminar aquí-, y este es el único sitio del mapa donde se pinta esa
  // zona: un círculo relleno y de borde suave, sin pin encima (ver el
  // filtro `mapaMudo` de CAPA_NODO_ENTRADA/CAPA_NODOS_SUELO más abajo).
  useEffect(() => {
    const mapa = mapaRef.current
    const esMapaMudo = String(currentStage?.kind || '') === 'mapa_mudo'

    const aplicarVisibilidad = (): boolean => {
      if (!mapa || !mapa.getLayer(CAPA_RADIO_RELLENO) || !mapa.getLayer(CAPA_RADIO_BORDE)) return false
      mapa.setLayoutProperty(CAPA_RADIO_RELLENO, 'visibility', esMapaMudo ? 'visible' : 'none')
      mapa.setLayoutProperty(CAPA_RADIO_BORDE, 'visibility', esMapaMudo ? 'visible' : 'none')
      if (esMapaMudo) {
        // Borde suave y difuso a propósito: nada que se lea como "aquí
        // exactamente", solo "por esta zona".
        mapa.setPaintProperty(CAPA_RADIO_BORDE, 'line-color', '#ffffff')
        mapa.setPaintProperty(CAPA_RADIO_BORDE, 'line-opacity', 0.5)
        mapa.setPaintProperty(CAPA_RADIO_BORDE, 'line-width', 2)
      }
      return true
    }
    // Si el estilo aún no ha montado las capas (los datos llegan antes),
    // el círculo del mapa mudo se quedaba oculto para siempre: se reintenta
    // en cada `styledata` hasta que se pueda aplicar.
    let reintento: (() => void) | null = null
    if (mapa && !aplicarVisibilidad()) {
      reintento = () => {
        if (aplicarVisibilidad() && reintento) mapa.off('styledata', reintento)
      }
      mapa.on('styledata', reintento)
    }
    const limpiarReintento = () => {
      if (mapa && reintento) mapa.off('styledata', reintento)
    }

    if (currentStage?.lat == null || currentStage?.lon == null) {
      pintarFuente(FUENTE_RADIO, COLECCION_VACIA)
      return limpiarReintento
    }

    const radio = typeof currentStage.radius === 'number' && currentStage.radius > 0
      ? currentStage.radius
      : 30

    pintarFuente(
      FUENTE_RADIO,
      circuloGeoJSON({ lat: currentStage.lat, lon: currentStage.lon }, radio)
    )
    return limpiarReintento
  }, [currentStage?.lat, currentStage?.lon, currentStage?.radius, currentStage?.kind, pintarFuente])

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
          iconoSuelo: `suelo-${estado(indice)}-${tipoDelNodo(nodo)}`,
          iconoEntrada: `entrada-${tipoDelNodo(nodo)}`,
          // Mapa mudo: nunca pin ni aro de entrada -ver el filtro de
          // CAPA_NODO_ENTRADA/CAPA_NODOS_SUELO-, solo el círculo difuso.
          mapaMudo: String((nodo as { kind?: string }).kind || '').toLowerCase() === 'mapa_mudo',
          entradaK:
            (typeof nodo.radius === 'number' && nodo.radius > 0 ? nodo.radius : 30) /
            (METROS_POR_PX_Z0 * Math.cos(((nodo.lat as number) * Math.PI) / 180) * RADIO_ENTRADA_PX),
          estado: estado(indice),
          orden: indice === currentLevel ? 1000 : indice,
        },
        geometry: { type: 'Point' as const, coordinates: [nodo.lon as number, nodo.lat as number] },
      })),
    })
    nodosParaHornearRef.current = nodos.map((nodo, indice) => ({
      clave: `${indice + 1}-${estado(indice)}-${tipoDelNodo(nodo)}`,
      lon: nodo.lon as number,
      lat: nodo.lat as number,
    }))

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
      // Mapa mudo: sin disco de suelo bajo el nodo mientras está oculto -es
      // justo el bulto que delataría "aquí, exacto" bajo el círculo difuso-.
      features: nodos
        .map((nodo, indice) => ({ nodo, indice }))
        .filter(({ nodo }) => String((nodo as { kind?: string }).kind || '').toLowerCase() !== 'mapa_mudo')
        .map(({ nodo, indice }) => ({
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

    // `playerPosition` solo decide si procede encuadrar al entrar; no debe
    // rehacer los marcadores en cada paso que das.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionStages, currentLevel, currentStage?.lat, currentStage?.lon, pintarFuente])

  /**
   * Trazado REAL, el que guarda administración en cada nodo
   * (`route_track`): sigue caminos de verdad.
   *
   * Aquí hubo una línea recta de nodo a nodo y se quitó porque mentía
   * -cruzaba el monte por donde no se puede andar-. Esto no: es el
   * mismo trazado que dibuja el motor de Leaflet, leído del mismo sitio.
   *
   * Cada tramo es el trazado que LLEGA a su nodo, así que hereda el estado
   * de ese nodo: andado, en juego o pendiente. El tramo en juego se parte en
   * tu posición: lo andado (`andado`, verde) y lo que queda (`actual`, azul,
   * con flechas y pulso). Va aparte del efecto de los nodos para que andar
   * no rehaga marcadores ni imágenes: sólo cambia cuando avanzas ~8 m.
   */
  useEffect(() => {
    const nodos = (Array.isArray(missionStages) ? missionStages : []).filter(
      (nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number'
    )
    const estado = (indice: number) =>
      indice < currentLevel ? 'hecho' : indice === currentLevel ? 'actual' : 'pendiente'
    const tramos = nodos
      .map((nodo, indice) => ({
        track: cerrarTramo(leerTrackDelNodo(nodo), indice > 0 ? nodos[indice - 1] : null, nodo),
        estado: estado(indice),
      }))
      .filter((tramo) => tramo.track.length > 1)
    tramoActualRef.current = tramos.find((tramo) => tramo.estado === 'actual')?.track ?? []

    const hechos = progresoRuta.clave === String(currentLevel) ? progresoRuta.m : 0
    const linea = (estadoTramo: string, track: Punto[]) => ({
      type: 'Feature' as const,
      properties: { estado: estadoTramo },
      geometry: { type: 'LineString' as const, coordinates: track.map((punto) => [punto.lon, punto.lat]) },
    })
    const features = tramos.flatMap((tramo) => {
      if (tramo.estado !== 'actual' || hechos <= 0) return [linea(tramo.estado, tramo.track)]
      const { andado, resto } = cortarTrazado(tramo.track, hechos)
      return [
        ...(andado.length > 1 ? [linea('andado', andado)] : []),
        ...(resto.length > 1 ? [linea('actual', resto)] : []),
      ]
    })
    pintarFuente(FUENTE_RUTA, features.length > 0 ? { type: 'FeatureCollection', features } : COLECCION_VACIA)
  }, [missionStages, currentLevel, progresoRuta, pintarFuente])

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

    /**
     * Por sitio: las que están a 30 m de un nodo van con ese nodo y se
     * reparten bajo él; las demás se juntan si están a menos de 20 m.
     */
    const nodos = (Array.isArray(missionStages) ? missionStages : [])
      .filter((nodo) => typeof nodo.lat === 'number' && typeof nodo.lon === 'number')
      .map((nodo) => ({ lat: nodo.lat as number, lon: nodo.lon as number }))
    type GrupoDeFotos = { lat: number; lon: number; nodo: number; fotos: FieldProof[] }
    const grupos: GrupoDeFotos[] = []
    for (const foto of fotos) {
      const punto = { lat: foto.lat as number, lon: foto.lon as number }
      let nodo = -1
      let mejor = 30
      nodos.forEach((candidato, indice) => {
        const metros = metrosEntre(candidato, punto)
        if (metros < mejor) {
          mejor = metros
          nodo = indice
        }
      })
      let grupo =
        nodo >= 0
          ? grupos.find((otro) => otro.nodo === nodo)
          : grupos.find((otro) => otro.nodo < 0 && metrosEntre(otro, punto) < 20)
      if (!grupo) {
        grupo = { ...(nodo >= 0 ? nodos[nodo] : punto), nodo, fotos: [] }
        grupos.push(grupo)
      }
      grupo.fotos.push(foto)
    }
    gruposFotosRef.current = grupos.map((grupo) => grupo.fotos)

    pintarFuente(FUENTE_FOTOS, {
      type: 'FeatureCollection',
      features: grupos.flatMap((grupo, indiceGrupo) => {
        if (grupo.nodo >= 0) {
          // Las de un nodo: un solo montón con la primera y cuántas hay.
          return [
            {
              type: 'Feature' as const,
              properties: {
                tipo: 'pila',
                icono: `pila-${grupo.fotos[0].id}-${grupo.fotos.length}`,
                id: grupo.fotos[0].id,
                grupo: indiceGrupo,
              },
              geometry: { type: 'Point' as const, coordinates: [grupo.lon, grupo.lat] },
            },
          ]
        }
        const vistas = grupo.fotos.slice(0, MAX_FOTOS_GRUPO)
        return vistas.map((foto, indice) => ({
          type: 'Feature' as const,
          properties: {
            tipo: 'foto',
            icono: `foto-${foto.id}`,
            id: foto.id,
            grupo: indiceGrupo,
            hueco: `${grupo.nodo >= 0 ? 1 : 0}-${vistas.length}-${indice}`,
            orden: indice,
          },
          geometry: { type: 'Point' as const, coordinates: [grupo.lon, grupo.lat] },
        }))
      }),
    })
  }, [fieldProofs, onOpenFieldProofs, pintarFuente, missionStages])


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
      {sinWebGL ? (
        <div
          role="alert"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: '28%',
            margin: '0 auto',
            maxWidth: 360,
            padding: '14px 16px',
            borderRadius: 16,
            background: 'rgba(var(--theme-ink), .88)',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,.35)',
            font: '700 14px/1.35 system-ui, sans-serif',
            textAlign: 'center',
            zIndex: 5,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Mapa 3D no disponible</div>
          <div>
            Este dispositivo no puede mostrar el mapa (WebGL no disponible). Este dispositivo non pode amosar o mapa.
          </div>
          <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>
            Puedes seguir jugando: usa la brújula, la lista de nodos y el QR. / Podes seguir xogando: usa a brúxula, a lista de nodos e o QR.
          </div>
          {debugSimulation && onDebugSetPosition && currentStage?.lat != null && currentStage?.lon != null ? (
            <button
              type="button"
              onClick={() =>
                onDebugSetPosition({ lat: currentStage.lat as number, lon: currentStage.lon as number })
              }
              style={{
                marginTop: 10,
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,.5)',
                background: 'rgba(255,255,255,.14)',
                color: '#ffffff',
                font: '800 13px system-ui, sans-serif',
                cursor: 'pointer',
              }}
            >
              Modo prueba: colocarme en el nodo
            </button>
          ) : null}
        </div>
      ) : null}
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
