/**
 * Fuentes, capas, iconos y expresiones de tamaño del mapa WebGL (sacado tal cual de MapSurfaceGL.tsx).
 * Sólo datos: el orden de las capas y quién las añade siguen en MapSurfaceGL.
 */
import type * as maplibregl from 'maplibre-gl'
import { calidadInicial, entornoDelMovil } from '../../avatares3d/mixamo/lodAvatares'

export const FUENTE_TESELAS = 'saga-raster'
export const CAPA_TESELAS = 'saga-raster-capa'
/**
 * 20/11 (QA: «planos blancos en los bordes al alejar de z17 a z14»): no eran casas ni relieve (salían igual sin casas y
 * sin terreno) sino el hueco de las teselas de satélite que aún no han llegado: sin capa de fondo, el lienzo vacío se
 * veía blanco. Con este fondo (el verde oscuro medio de la foto de la zona) el hueco pasa casi desapercibido hasta que
 * llega la tesela. Una sola pasada plana: no cuesta nada.
 */
export const CAPA_FONDO = 'saga-fondo-capa'
export const COLOR_FONDO_SIN_TESELA = '#3b4632' // no-tema: verde medio de la foto satélite, no de la piel de la app
export const FUENTE_RELIEVE = 'saga-relieve'
export const CAPA_SOMBRAS = 'saga-sombras'
export const FUENTE_RADIO = 'saga-radio'
export const CAPA_RADIO_RELLENO = 'saga-radio-relleno'
export const CAPA_RADIO_BORDE = 'saga-radio-borde'
export const FUENTE_RUTA = 'saga-ruta'
export const CAPA_RUTA = 'saga-ruta-linea'
export const CAPA_RUTA_BORDE = 'saga-ruta-borde'
export const FUENTE_NODOS_VOLUMEN = 'saga-nodos-volumen'
export const FUENTE_RELIEVE_SOMBRAS = 'saga-relieve-sombras'
export const FUENTE_EDIFICIOS = 'saga-edificios'
export const CAPA_EDIFICIOS = 'saga-edificios-capa'
/**
 * Calidad del móvil para el MAPA BASE, con la misma regla que los avatares
 * (`calidadInicial`): memoria y núcleos. Se decide una vez al cargar.
 */
export const CALIDAD_DEL_MAPA = (() => {
  try {
    return calidadInicial(entornoDelMovil())
  } catch {
    return 'media' as const
  }
})()
/**
 * En calidad baja, sin casas: miles de volúmenes son justo lo que un móvil flojo no necesita. Si el medidor de
 * fotogramas de los avatares baja a «baja» jugando, las casas se apagan también (ver `latir`).
 */
// 5.55 las apagó buscando el fondo borroso del iPhone; 5.56.3 demostró que la causa era el proxy de teselas
// (404 lejos de la ruta), no las casas. 5.57 las vuelve a encender. Sólo existen dentro de la zona de la misión
// (+1 km, `mapa3d.py`): fuera de ella, como en casa del dueño, no hay ninguna que pintar.
export const EDIFICIOS_EN_EL_MAPA = CALIDAD_DEL_MAPA !== 'baja'
/**
 * Las propiedades que anima `latir` (pulso, halo, moneda, guía) van SIN la
 * transición de 300 ms que MapLibre pone por defecto. Con ella, cada uno de los
 * diez cambios por segundo dejaba al mapa animando 300 ms: se repintaba (y con
 * él el terreno entero) a todo lo que daba la pantalla, ~30 veces por segundo con
 * la cámara quieta, medido. Sin ella, un repintado por cambio. El latido se ve
 * igual: ya va a pasos de 100 ms sobre una senoide.
 */
export const SIN_TRANSICION = { duration: 0, delay: 0 }
export const FUENTE_NODOS_ICONOS = 'saga-nodos-iconos'
export const FUENTE_FOTOS = 'saga-fotos'
export const CAPA_RUTA_PULSO = 'saga-ruta-pulso'
/** Cuánto late el pulso tras un cambio de nodo o un toque; después se queda quieto (ver `latir`). */
export const LATIDO_TRAS_CAMBIO_MS = 10_000
/** Dónde se queda el pulso en reposo (0 = el valle, 1 = la cresta): un instante normal, el nodo se sigue viendo. */
export const INTENSIDAD_EN_REPOSO = 0.75
export const FUENTE_JUGADOR = 'saga-jugador'
export const CAPA_JUGADOR = 'saga-jugador-capa'
export const CAPA_AURA = 'saga-jugador-aura'
/** Suelo de cada jugador (aro del equipo + flecha de rumbo), tumbado en el mapa. */
export const CAPA_SUELO_JUGADOR = 'saga-jugador-suelo'
export const CAPA_SUELO_OTROS = 'saga-otros-suelo'
/** Flechas de dirección sobre lo que queda del trazado (line-pattern, pegado al terreno). */
export const CAPA_RUTA_FLECHAS = 'saga-ruta-flechas'
export const ICONO_FLECHA_RUTA = 'ruta-flecha'
/** 5/11: las mismas flechas, más espaciadas: el trazado de lejos (z13-16) y la guía a trazos. */
export const CAPA_RUTA_FLECHAS_LEJOS = 'saga-ruta-flechas-lejos'
export const ICONO_FLECHA_LEJOS = 'ruta-flecha-lejos'
export const CAPA_GUIA_FLECHAS = 'saga-guia-flechas'
/** 5/11: el tramo de la guía que no va por ningún camino conocido (de ti a la red de caminos), punteado fino. */
export const CAPA_GUIA_SIN_CAMINO = 'saga-guia-sin-camino'
/** Desde cuántos metros del trazado se guía por la red de caminos (antes 120: la recta cruzaba casas y ríos). */
export const GUIA_POR_CAMINOS_DESDE_M = 60
/** Si la ruta por caminos empieza a más de esto de ti, ese primer tramo es «sin camino conocido». */
export const SIN_CAMINO_DESDE_M = 40
/** La celebración al completar un nodo: una fuente, cuatro capas. */
export const FUENTE_CELEBRACION = 'saga-celebracion'
export const CAPA_CELEB_ONDA = 'saga-celebracion-onda'
export const CAPA_CELEB_BRILLO = 'saga-celebracion-brillo'
export const CAPA_CELEB_CHISPAS = 'saga-celebracion-chispas'
export const CAPA_CELEB_INSIGNIA = 'saga-celebracion-insignia'
export const ICONO_CELEB_ONDA = 'celebra-onda'
export const ICONO_CELEB_BRILLO = 'celebra-brillo'
export const ICONO_CELEB_CHISPA = 'celebra-chispa'
export const ICONO_CELEB_INSIGNIA = 'celebra-insignia'
/** Los compañeros: símbolos del mapa, como los nodos y tú (ver CAPA_OTROS). */
export const FUENTE_OTROS = 'saga-otros'
/** 7/11: la línea fina de cada retrato apartado en corona a su sitio real (ver `lineasDeCorona`). */
export const FUENTE_OTROS_LINEAS = 'saga-otros-lineas'
export const CAPA_OTROS_LINEAS = 'saga-otros-lineas-capa'
export const CAPA_OTROS = 'saga-otros-capa'
export const FUENTE_GUIA = 'saga-guia'
export const CAPA_NODOS_TRES_D = 'saga-nodos-3d'
export const CAPA_GUIA = 'saga-guia-capa'
export const CAPA_FOTOS = 'saga-fotos-capa'
export const CAPA_NODOS_ICONOS = 'saga-nodos-iconos-capa'
export const CAPA_NODOS_HALO = 'saga-nodos-halo-capa'
/** La moneda de la poképarada, en su propia capa (flotaba con `latir`; quieta desde la revisión 19/10 de batería). */
export const CAPA_NODOS_MONEDA = 'saga-nodos-moneda-capa'
/** 20/11: la moneda de la vista 2D, en su propia capa (ver `aplicarModo`: el modo sólo cambia opacidades). */
export const CAPA_NODOS_MONEDAS_2D = 'saga-nodos-monedas2d-capa'
/**
 * La opacidad de reposo del resplandor del nodo en juego (late alrededor de ella, ver `latir`). 22/11: es EXACTAMENTE la
 * de `latir` en reposo; con 0,6 aquí y 0,65 allí, `aplicarModo` y `latir` se la quitaban el uno al otro por `styledata`
 * dos veces por segundo para siempre (mapa quieto repintando a ~6 fps).
 */
export const OPACIDAD_DEL_HALO = 0.2 + 0.6 * INTENSIDAD_EN_REPOSO
export const ICONO_HALO = 'halo-actual'
export const ICONO_HALO_3D = 'halo-actual-3d'
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
export const ALTURA_SIMBOLOS_M = 3
/**
 * Los jugadores (retrato, su aro y el tuyo) van MÁS bajos: con 3 m su aro flotaba a la vista sobre el suelo, lejos de
 * los pies de los que van en 3D (que pisan el terreno). Un metro sigue sacando el anclaje de la malla basta del
 * relieve y deja el aro pegado al suelo. Retrato y aro a la MISMA altura: la punta del retrato cae en su centro.
 */
export const ALTURA_JUGADORES_M = 1
/**
 * Los nodos, más pegados: a tres metros, con el mapa inclinado se veían
 * por encima de su sitio (la línea del camino acababa bajo el halo) y
 * "no asentados". Con el relieve de una sola resolución (ver la fuente de
 * elevación) la malla y la cota del nodo coinciden y dos metros bastan.
 */
export const ALTURA_NODOS_M = 2
/** El halo del suelo del nodo, tumbado en el mapa (sólo en 3D). */
export const CAPA_NODOS_SUELO = 'saga-nodos-suelo-capa'
/** El radio de entrada del nodo en juego, a su tamaño real en el mapa. */
export const CAPA_NODO_ENTRADA = 'saga-nodo-entrada-capa'
/** Radio de la imagen del radio de entrada, en píxeles CSS (ver `dibujarEntrada`). */
export const RADIO_ENTRADA_PX = 128
/**
 * Metros por píxel a zoom 0 en el ecuador, con el zoom de MapLibre
 * (mundo de 512 px): 40 075 016,686 / 512.
 */
export const METROS_POR_PX_Z0 = 78271.517
/**
 * Tamaño del radio de entrada: el REAL. `entradaK` (por nodo) = metros de
 * radio / (metros por píxel a zoom 0 × radio de la imagen), y el tamaño es
 * `entradaK · 2^zoom`: base 2 exacta entre dos paradas, así que crece y
 * mengua con el mapa, sin escalones, como un dibujo sobre el terreno.
 */
export const TAMANO_ENTRADA: maplibregl.ExpressionSpecification = [
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
export const SIN_ESCALON: maplibregl.ExpressionSpecification = ['number', ['get', 'escala'], 1]
// Base 1,15 entre 0,6 (z12) y 3,6 (z19,5): 1,12 en z14, 1,44 en z15, 1,81 en z16,
// 2,24 en z17 y 3,29 en z19; lo mismo que la curva de seis paradas de antes.
export const TAMANO_NODOS: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.15], ['zoom'],
  // 20/11 (Óscar: «el número es muy pequeño, al desampliar no se lee»): suelo legible a vista de región: moneda ~25 px y número
  // ~12 px (el icono de grupo, disco de 31 px con el número a 14 px). Misma curva en PARADAS_TAMANO_NODO (jugadoresEnMapa.ts).
  8, ['*', 0.7, SIN_ESCALON],
  12, ['*', 0.76, SIN_ESCALON],
  19.5, ['*', 3.6, SIN_ESCALON],
]
export const TAMANO_FOTOS: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  12, ['*', 0.5, SIN_ESCALON],
  19.5, ['*', 1.3, SIN_ESCALON],
]
// Retrato (círculo de 50 px a tamaño 1, sin punta desde el 11/11) y suelo del jugador: 0,8 en z12 (53 px), ~1,12 en z16 (74 px), ~1,42 en z18
// (94 px), ~1,64 en z19 (108 px) y 1,9 en z20 (125 px): la misma curva que el avatar 3D (`alturaEnPantallaPx`,
// 80/101/113/126 px), para que el paso 3D <-> retrato no pegue un salto de tamaño. 5.48: más grandes.
export const TAMANO_JUGADOR: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.25], ['zoom'],
  12, ['*', 0.8, SIN_ESCALON],
  20, ['*', 1.9, SIN_ESCALON],
]

/** Celebración: como los nodos, con `s` (dato del punto) como multiplicador. */
export const TAMANO_CELEBRACION: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.15], ['zoom'],
  12, ['*', 0.6, ['number', ['get', 's'], 1]],
  19.5, ['*', 3.6, ['number', ['get', 's'], 1]],
]
export const TAMANO_CHISPAS: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  12, ['*', 0.45, ['number', ['get', 's'], 1]],
  19.5, ['*', 0.95, ['number', ['get', 's'], 1]],
]

/**
 * Opacidad de lo que el mapa pinta de un jugador (retrato, aro de símbolo): 0 mientras su cuerpo va en 3D (estado
 * `tresD` de su punto, que pone la capa de avatares en el mismo fotograma en que enciende el cuerpo), y si no, la
 * de su presencia (0,7 sin conexión).
 * 24/11: `tresD` va de 0 a 1 (cuánto se ve su cuerpo en el fundido de `FUNDIDO_VISTA_MS`): el retrato, con lo que falta.
 */
export const VISTO_SIN_CUERPO = ['-', 1, ['number', ['feature-state', 'tresD'], 0]] as unknown as maplibregl.ExpressionSpecification
export const OPACIDAD_SIN_TRES_D = ['*', VISTO_SIN_CUERPO, ['number', ['get', 'opacidad'], 1]] as unknown as maplibregl.ExpressionSpecification

/** Las fotos de cada nodo, en un montón al lado de su base (ver `dibujarPila`). */
export const CAPA_FOTOS_PILA = 'saga-fotos-pila-capa'
/**
 * El montón crece con el nodo (la mitad que él): así queda pegado a su base a
 * cualquier zoom. A la derecha de la peana, de pie en el suelo.
 */
export const TAMANO_PILA: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.15], ['zoom'],
  12, ['*', 0.3, SIN_ESCALON],
  19.5, ['*', 1.8, SIN_ESCALON],
]
/** Desde qué zoom se reparten las fotos de un mismo sitio. */
export const ZOOM_FOTOS_REPARTIDAS = 18
/** Cuántas fotos de un mismo sitio se enseñan repartidas; el visor las tiene todas. */
export const MAX_FOTOS_GRUPO = 8
/**
 * Dónde va cada foto de un grupo, en píxeles a tamaño 1: en filas de
 * cuatro, en leve sonrisa. Junto a un nodo, por DEBAJO de su peana, para
 * no taparle el número; en campo abierto, alrededor del punto. Las fotos de
 * un nodo estaban todas en el mismo punto, apiladas y bajo el nodo: al
 * ampliar no se separaban y no había forma de tocar una.
 */
export function huecoDeFoto(enNodo: boolean, n: number, i: number): [number, number] {
  const fila = Math.floor(i / 4)
  const enFila = Math.min(4, n - fila * 4)
  const x = ((i % 4) - (enFila - 1) / 2) * 64
  const y = (enNodo ? 72 : n > 1 ? 34 : 0) + fila * 70 + Math.abs(x) * 0.2
  return [Math.round(x), Math.round(y)]
}
export const DESPLAZAMIENTO_FOTOS = ((): maplibregl.ExpressionSpecification => {
  // Tabla fija: una propiedad con un array dentro llega al estilo como texto.
  const casos: unknown[] = []
  for (const enNodo of [false, true]) {
    for (let n = 1; n <= MAX_FOTOS_GRUPO; n += 1) {
      for (let i = 0; i < n; i += 1) casos.push(`${enNodo ? 1 : 0}-${n}-${i}`, ['literal', huecoDeFoto(enNodo, n, i)])
    }
  }
  return ['match', ['get', 'hueco'], ...casos, ['literal', [0, 0]]] as unknown as maplibregl.ExpressionSpecification
})()
export const CAPA_NODOS_VOLUMEN = 'saga-nodos-volumen-capa'

/**
 * Los colores del trazado, la guía, el radio y los alfileres.
 *
 * El color dice si un nodo está hecho, si es el que toca o si falta: es
 * información, no decoración. 6/11: cada tema (Pizarra, Día, Solpor) afina
 * esa misma escala con sus tokens `--s-mapa-*` y `--s-nodo-pendiente`
 * (mobile-themes.css), sin cambiar su significado. Se leen al montar el mapa
 * y otra vez sólo si cambia el tema (ver `refrescarColoresDelMapa`). Los de
 * aquí son los de Pizarra, por si el CSS no está.
 */
export const COLORES_MAPA_PIZARRA = [
  ['--s-mapa-hecho', '#22c55e'],
  ['--s-mapa-actual', '#3b82f6'],
  ['--s-nodo-pendiente', '#ef4444'],
  ['--s-mapa-andado', '#16a34a'],
  ['--s-mapa-pendiente', '#f8fafc'],
  ['--s-mapa-contorno', '#0b1220'],
  ['--s-mapa-guia', '#3b82f6'],
  ['--s-mapa-radio', '#3b82f6'],
  ['--s-mapa-radio-borde', '#ffffff'],
] as const
export let [
  COLOR_NODO_HECHO,
  COLOR_NODO_ACTUAL,
  COLOR_NODO_PENDIENTE,
  COLOR_RUTA_ANDADA,
  COLOR_RUTA_PENDIENTE,
  COLOR_RUTA_CONTORNO,
  COLOR_GUIA,
  COLOR_RADIO,
  COLOR_RADIO_BORDE,
]: string[] = COLORES_MAPA_PIZARRA.map(([, color]) => color)

/** Relee los colores del tema puesto en el `body`. Devuelve si alguno cambió (para no repintar en balde). */
export function refrescarColoresDelMapa(): boolean {
  if (typeof document === 'undefined' || !document.body) return false
  const estilo = getComputedStyle(document.body)
  const nuevos = COLORES_MAPA_PIZARRA.map(([token, respaldo]) => estilo.getPropertyValue(token).trim() || respaldo)
  const antes = [
    COLOR_NODO_HECHO,
    COLOR_NODO_ACTUAL,
    COLOR_NODO_PENDIENTE,
    COLOR_RUTA_ANDADA,
    COLOR_RUTA_PENDIENTE,
    COLOR_RUTA_CONTORNO,
    COLOR_GUIA,
    COLOR_RADIO,
    COLOR_RADIO_BORDE,
  ]
  ;[
    COLOR_NODO_HECHO,
    COLOR_NODO_ACTUAL,
    COLOR_NODO_PENDIENTE,
    COLOR_RUTA_ANDADA,
    COLOR_RUTA_PENDIENTE,
    COLOR_RUTA_CONTORNO,
    COLOR_GUIA,
    COLOR_RADIO,
    COLOR_RADIO_BORDE,
  ] = nuevos
  return nuevos.some((color, i) => color !== antes[i])
}

/** El color de cada tramo de la ruta según el estado del nodo al que llega. */
export function colorDeLaRuta(): maplibregl.ExpressionSpecification {
  return [
    'match',
    ['get', 'estado'],
    'hecho',
    COLOR_NODO_HECHO,
    // Lo ya andado del tramo en juego: verde un punto más oscuro que lo hecho, para que se lea «por aquí ya pasaste».
    'andado',
    COLOR_RUTA_ANDADA,
    'actual',
    COLOR_NODO_ACTUAL,
    COLOR_RUTA_PENDIENTE,
  ]
}

export const PITCH_3D = 55
/** Tú en el mapa, para la capa de avatares 3D. */
export const CLAVE_YO = 'yo'
/**
 * Imagen transparente de lo que ocupa un avatar 3D de pie: el símbolo del mapa se
 * queda (toques, cursor, huecos) pero el cuerpo lo pinta la capa three.js.
 */
export const ICONO_HUECO_3D = 'pj-hueco-3d'
