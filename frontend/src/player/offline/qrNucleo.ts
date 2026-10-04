/**
 * El núcleo del lector de QR: sólo cuentas sobre píxeles, sin DOM, sin red y
 * sin imports.
 *
 * Vive aparte para poder usarlo en tres sitios con el MISMO código:
 *   - el worker del escáner (`lectorQr.worker.ts`), que es donde corre en el móvil;
 *   - el hilo principal, si el navegador no deja crear el worker;
 *   - el banco de medida (`scripts/medir-lectura-qr.mjs`), que lo importa desde
 *     Node tal cual (Node quita los tipos) y mide la tasa de lectura en casos
 *     difíciles. Por eso no importa nada: jsQR se le pasa como parámetro.
 *
 * Qué hace que no hacía el lector anterior, y por qué (cifras en el CHANGELOG
 * y en el banco):
 *   - Recorte completo además del 85 %: con la pegatina cerca, el código
 *     llenaba el cuadro y el recorte le comía la zona de silencio.
 *   - Estirar el contraste por percentiles: jsQR da por blanco todo bloque
 *     con menos de 24 niveles de diferencia, que es justo lo que llega con
 *     poca luz o con la pegatina gastada.
 *   - Umbral local (Bradley): con un reflejo encima o media pegatina a la
 *     sombra, un solo umbral para toda la imagen no sirve.
 *   - Imagen reducida a la mitad: con la foto movida o con mucho ruido,
 *     promediar píxeles limpia más que cualquier filtro.
 *   - Recorte central ampliado: una pegatina pequeña en el encuadre.
 *   - Invertida, al final y sola: casi nunca hace falta y cuesta otra pasada.
 *
 * Cada estrategia es UNA pasada de jsQR. En el bucle de la cámara se hace una
 * por fotograma, rotando, para que ningún fotograma tarde más que una lectura;
 * con la foto se prueban todas.
 */

export type OpcionesJsQr = {
  inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst'
}

export type FuncionJsQr = (
  datos: Uint8ClampedArray,
  ancho: number,
  alto: number,
  opciones?: OpcionesJsQr
) => { data: string } | null

/** Una imagen en grises: un byte por píxel. */
export type Gris = { px: Uint8Array; ancho: number; alto: number }

export const ESTRATEGIAS = [
  'suavizada',
  'tal_cual',
  'otsu',
  'centro',
  'completa',
  'umbral_local',
  'contraste',
  'reducida',
  'enfocada',
  'cerrada',
  'invertida',
] as const

export type Estrategia = (typeof ESTRATEGIAS)[number]

/**
 * El orden del bucle continuo: la pasada que lee en el caso corriente se
 * repite cada pocas vueltas; el resto se reparte. Ocho pasadas ≈ un segundo.
 */
export const ROTACION_DEL_BUCLE: readonly Estrategia[] = [
  'suavizada',
  'tal_cual',
  'otsu',
  'centro',
  'completa',
  'umbral_local',
  'suavizada',
  'contraste',
  'cerrada',
  'reducida',
  'enfocada',
  'invertida',
]

/**
 * Lado máximo con el que trabaja jsQR. Medido en el banco: a 612 px una
 * pasada cuesta ~95 ms en un portátil (y tres o cuatro veces más en un móvil
 * justo); a 480, ~38 ms, y lee lo mismo. Una pegatina al 10 % del encuadre
 * aún sale a ~3,5 px por módulo, que jsQR lee.
 */
export const LADO_DE_TRABAJO = 480

/**
 * La pasada «tal cual» va a resolución completa (hasta 640): con la pegatina
 * a 40 cm un módulo mide 2-3 px, y reducir o suavizar lo borra.
 */
export const LADO_NATIVO = 640

export function aGris(rgba: Uint8ClampedArray | Uint8Array, ancho: number, alto: number): Gris {
  const px = new Uint8Array(ancho * alto)
  for (let i = 0, p = 0; p < px.length; i += 4, p += 1) {
    // Luminancia percibida, en enteros: el verde pesa más de lo que parece.
    px[p] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8
  }
  return { px, ancho, alto }
}

/** jsQR sólo come RGBA. */
export function aRgba(g: Gris): Uint8ClampedArray {
  const salida = new Uint8ClampedArray(g.px.length * 4)
  for (let p = 0, i = 0; p < g.px.length; p += 1, i += 4) {
    const v = g.px[p]
    salida[i] = v
    salida[i + 1] = v
    salida[i + 2] = v
    salida[i + 3] = 255
  }
  return salida
}

/**
 * Un cuadrado centrado de lado `fraccion` del lado corto, llevado a `lado`
 * píxeles. Reduce promediando (no salteando píxeles, que es lo que convierte
 * el ruido en módulos falsos) y amplía con interpolación bilineal.
 */
export function recortar(g: Gris, fraccion: number, lado: number): Gris {
  const origen = Math.max(8, Math.floor(Math.min(g.ancho, g.alto) * Math.min(1, fraccion)))
  const x0 = Math.floor((g.ancho - origen) / 2)
  const y0 = Math.floor((g.alto - origen) / 2)
  const destino = Math.max(8, Math.round(lado))
  const px = new Uint8Array(destino * destino)
  const escala = origen / destino

  if (escala >= 1) {
    for (let y = 0; y < destino; y += 1) {
      const ya = y0 + Math.floor(y * escala)
      const yb = Math.max(ya + 1, y0 + Math.floor((y + 1) * escala))
      for (let x = 0; x < destino; x += 1) {
        const xa = x0 + Math.floor(x * escala)
        const xb = Math.max(xa + 1, x0 + Math.floor((x + 1) * escala))
        let suma = 0
        for (let yy = ya; yy < yb; yy += 1) {
          const fila = yy * g.ancho
          for (let xx = xa; xx < xb; xx += 1) suma += g.px[fila + xx]
        }
        px[y * destino + x] = suma / ((yb - ya) * (xb - xa))
      }
    }
  } else {
    for (let y = 0; y < destino; y += 1) {
      const fy = Math.min(origen - 1.001, Math.max(0, (y + 0.5) * escala - 0.5))
      const iy = Math.floor(fy)
      const dy = fy - iy
      for (let x = 0; x < destino; x += 1) {
        const fx = Math.min(origen - 1.001, Math.max(0, (x + 0.5) * escala - 0.5))
        const ix = Math.floor(fx)
        const dx = fx - ix
        const a = (y0 + iy) * g.ancho + x0 + ix
        const b = a + g.ancho
        const arriba = g.px[a] * (1 - dx) + g.px[a + 1] * dx
        const abajo = g.px[b] * (1 - dx) + g.px[b + 1] * dx
        px[y * destino + x] = arriba * (1 - dy) + abajo * dy
      }
    }
  }

  return { px, ancho: destino, alto: destino }
}

/** Lleva los percentiles 2 y 98 a negro y blanco. */
export function estirarContraste(g: Gris): Gris {
  const histograma = new Uint32Array(256)
  for (let i = 0; i < g.px.length; i += 1) histograma[g.px[i]] += 1
  const corte = g.px.length * 0.02
  let bajo = 0
  let acumulado = 0
  while (bajo < 255 && acumulado + histograma[bajo] < corte) acumulado += histograma[bajo++]
  let alto = 255
  acumulado = 0
  while (alto > 0 && acumulado + histograma[alto] < corte) acumulado += histograma[alto--]
  if (alto - bajo < 4) return g
  const px = new Uint8Array(g.px.length)
  const factor = 255 / (alto - bajo)
  for (let i = 0; i < g.px.length; i += 1) {
    const v = (g.px[i] - bajo) * factor
    px[i] = v < 0 ? 0 : v > 255 ? 255 : v
  }
  return { px, ancho: g.ancho, alto: g.alto }
}

function integral(g: Gris): Float64Array {
  const ancho = g.ancho + 1
  const tabla = new Float64Array(ancho * (g.alto + 1))
  for (let y = 0; y < g.alto; y += 1) {
    let fila = 0
    for (let x = 0; x < g.ancho; x += 1) {
      fila += g.px[y * g.ancho + x]
      tabla[(y + 1) * ancho + x + 1] = tabla[y * ancho + x + 1] + fila
    }
  }
  return tabla
}

/**
 * Umbral local de Bradley: negro lo que esté un `t` por debajo de la media de
 * su vecindario. Aguanta un reflejo o una sombra a medias, que con un umbral
 * global dejan media pegatina en blanco o en negro.
 */
export function umbralLocal(g: Gris, t = 0.15): Gris {
  const tabla = integral(g)
  const ancho = g.ancho + 1
  const radio = Math.max(4, Math.round(Math.min(g.ancho, g.alto) / 16))
  const px = new Uint8Array(g.px.length)
  for (let y = 0; y < g.alto; y += 1) {
    const y1 = Math.max(0, y - radio)
    const y2 = Math.min(g.alto, y + radio + 1)
    for (let x = 0; x < g.ancho; x += 1) {
      const x1 = Math.max(0, x - radio)
      const x2 = Math.min(g.ancho, x + radio + 1)
      const suma =
        tabla[y2 * ancho + x2] -
        tabla[y1 * ancho + x2] -
        tabla[y2 * ancho + x1] +
        tabla[y1 * ancho + x1]
      const media = suma / ((y2 - y1) * (x2 - x1))
      px[y * g.ancho + x] = g.px[y * g.ancho + x] < media * (1 - t) ? 0 : 255
    }
  }
  return { px, ancho: g.ancho, alto: g.alto }
}

/** Máscara de enfoque: resta una versión borrosa para recuperar bordes. */
export function enfocar(g: Gris, cantidad = 1.2): Gris {
  const tabla = integral(g)
  const ancho = g.ancho + 1
  const radio = 2
  const px = new Uint8Array(g.px.length)
  for (let y = 0; y < g.alto; y += 1) {
    const y1 = Math.max(0, y - radio)
    const y2 = Math.min(g.alto, y + radio + 1)
    for (let x = 0; x < g.ancho; x += 1) {
      const x1 = Math.max(0, x - radio)
      const x2 = Math.min(g.ancho, x + radio + 1)
      const suma =
        tabla[y2 * ancho + x2] -
        tabla[y1 * ancho + x2] -
        tabla[y2 * ancho + x1] +
        tabla[y1 * ancho + x1]
      const media = suma / ((y2 - y1) * (x2 - x1))
      const v = g.px[y * g.ancho + x] + (g.px[y * g.ancho + x] - media) * cantidad
      px[y * g.ancho + x] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
  return { px, ancho: g.ancho, alto: g.alto }
}

/** Media 3×3: quita el grano del sensor sin borrar módulos de 3 px o más. */
export function suavizar(g: Gris): Gris {
  const { ancho, alto } = g
  const px = new Uint8Array(g.px.length)
  for (let y = 0; y < alto; y += 1) {
    const ya = y > 0 ? y - 1 : y
    const yb = y < alto - 1 ? y + 1 : y
    for (let x = 0; x < ancho; x += 1) {
      const xa = x > 0 ? x - 1 : x
      const xb = x < ancho - 1 ? x + 1 : x
      px[y * ancho + x] =
        (g.px[ya * ancho + xa] + g.px[ya * ancho + x] + g.px[ya * ancho + xb] +
          g.px[y * ancho + xa] + g.px[y * ancho + x] + g.px[y * ancho + xb] +
          g.px[yb * ancho + xa] + g.px[yb * ancho + x] + g.px[yb * ancho + xb]) / 9
    }
  }
  return { px, ancho, alto }
}

/**
 * Umbral global de Otsu. jsQR binariza por bloques de 8 px y en las zonas
 * lisas convierte el grano del sensor en motas negras: le salen cientos de
 * candidatos a patrón de posición, tarda segundos y no lee. Con luz pareja,
 * un solo umbral bien elegido no tiene ese problema.
 */
export function otsu(g: Gris): Gris {
  const histograma = new Float64Array(256)
  for (let i = 0; i < g.px.length; i += 1) histograma[g.px[i]] += 1
  const total = g.px.length
  let sumaTotal = 0
  for (let v = 0; v < 256; v += 1) sumaTotal += v * histograma[v]
  let sumaFondo = 0
  let pesoFondo = 0
  let mejor = 0
  let umbral = 127
  for (let v = 0; v < 256; v += 1) {
    pesoFondo += histograma[v]
    if (!pesoFondo) continue
    const pesoFrente = total - pesoFondo
    if (!pesoFrente) break
    sumaFondo += v * histograma[v]
    const mediaFondo = sumaFondo / pesoFondo
    const mediaFrente = (sumaTotal - sumaFondo) / pesoFrente
    const entre = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2
    if (entre > mejor) {
      mejor = entre
      umbral = v
    }
  }
  const px = new Uint8Array(g.px.length)
  for (let i = 0; i < g.px.length; i += 1) px[i] = g.px[i] > umbral ? 255 : 0
  return { px, ancho: g.ancho, alto: g.alto }
}

export function invertir(g: Gris): Gris {
  const px = new Uint8Array(g.px.length)
  for (let i = 0; i < g.px.length; i += 1) px[i] = 255 - g.px[i]
  return { px, ancho: g.ancho, alto: g.alto }
}

/** La imagen que se le da a jsQR con cada estrategia. */
export function prepararEstrategia(g: Gris, estrategia: Estrategia): Gris {
  const ladoCorto = Math.min(g.ancho, g.alto)
  const normal = Math.min(LADO_DE_TRABAJO, Math.floor(ladoCorto * 0.85))
  const base = () => recortar(g, 0.85, normal)

  switch (estrategia) {
    case 'tal_cual':
      return recortar(g, 0.85, Math.min(LADO_NATIVO, Math.floor(ladoCorto * 0.85)))
    case 'suavizada':
      return suavizar(base())
    case 'otsu':
      // A resolución completa y sin suavizar: con la foto movida, el umbral
      // global a tamaño nativo es lo que más lee (suavizar emborrona más).
      return otsu(recortar(g, 0.85, Math.min(LADO_NATIVO, Math.floor(ladoCorto * 0.85))))
    case 'completa':
      // Con la pegatina cerca el código llena el cuadro: el recorte del 85 %
      // le comía la zona de silencio.
      // Sin suavizar y con umbral global: también es la que mejor aguanta la
      // foto algo movida (medido en el banco).
      return otsu(recortar(g, 1, Math.min(LADO_NATIVO, ladoCorto)))
    case 'umbral_local':
      return umbralLocal(suavizar(base()))
    case 'contraste':
      return suavizar(estirarContraste(base()))
    case 'reducida':
      return recortar(g, 1, Math.min(300, ladoCorto))
    case 'centro':
      // La mitad central a resolución completa: una pegatina pequeña en el
      // encuadre, sin perder píxeles por módulo al reducir.
      return recortar(g, 0.5, Math.min(LADO_NATIVO, Math.floor(ladoCorto * 0.5)))
    case 'enfocada':
      return enfocar(suavizar(base()))
    case 'cerrada':
      // El 70 % central a resolución completa: otro muestreo de la misma foto.
      // Con la foto movida, leer o no depende de dónde caen los píxeles, y un
      // recorte distinto es otra oportunidad (el lector de antes la tenía).
      return recortar(g, 0.7, Math.min(LADO_NATIVO, Math.floor(ladoCorto * 0.7)))
    case 'invertida':
      // jsQR 1.4 revienta con `onlyInvert` (lee una imagen que no calcula):
      // se invierte aquí y se le pide la lectura normal.
      return invertir(suavizar(base()))
  }
}

/** Una pasada de jsQR con una estrategia. */
export function leerConEstrategia(g: Gris, estrategia: Estrategia, jsQR: FuncionJsQr): string | null {
  const imagen = prepararEstrategia(g, estrategia)
  try {
    const resultado = jsQR(aRgba(imagen), imagen.ancho, imagen.alto, { inversionAttempts: 'dontInvert' })
    return resultado?.data ? resultado.data : null
  } catch {
    // jsQR tira excepciones con algunas imágenes degeneradas: eso es «no lee».
    return null
  }
}

export type ResultadoNucleo = { texto: string; estrategia: Estrategia } | null

/** Prueba una lista de estrategias por orden y para en la primera que lea. */
export function leerConEstrategias(
  g: Gris,
  estrategias: readonly Estrategia[],
  jsQR: FuncionJsQr
): ResultadoNucleo {
  for (const estrategia of estrategias) {
    const texto = leerConEstrategia(g, estrategia, jsQR)
    if (texto) return { texto, estrategia }
  }
  return null
}

/** Lo que se sabe de la imagen aunque no se lea: para decirle algo útil al jugador. */
export type MedidaDeLuz = {
  /** Brillo medio, 0-255. */
  media: number
  /** Percentil 95 menos percentil 5: cuánto se separan negro y blanco. */
  contraste: number
  /** Energía de bordes media: baja = foto movida o desenfocada. */
  nitidez: number
}

export function medirLuz(g: Gris): MedidaDeLuz {
  const paso = Math.max(1, Math.floor(Math.sqrt(g.px.length / 40000)))
  const histograma = new Uint32Array(256)
  let suma = 0
  let n = 0
  let bordes = 0
  let nb = 0
  for (let y = 0; y < g.alto - paso; y += paso) {
    for (let x = 0; x < g.ancho - paso; x += paso) {
      const v = g.px[y * g.ancho + x]
      histograma[v] += 1
      suma += v
      n += 1
      bordes +=
        Math.abs(v - g.px[y * g.ancho + x + paso]) + Math.abs(v - g.px[(y + paso) * g.ancho + x])
      nb += 2
    }
  }
  if (!n) return { media: 0, contraste: 0, nitidez: 0 }
  const percentil = (q: number) => {
    let acumulado = 0
    for (let v = 0; v < 256; v += 1) {
      acumulado += histograma[v]
      if (acumulado >= n * q) return v
    }
    return 255
  }
  return { media: suma / n, contraste: percentil(0.95) - percentil(0.05), nitidez: bordes / nb }
}

export type Consejo = 'mas_luz' | 'sin_mover' | 'acercate'

/**
 * Qué decirle al jugador cuando no lee. Umbrales medidos con el banco: por
 * debajo de ellos, la tasa de lectura cae en picado.
 */
export function consejoPara(medida: MedidaDeLuz): Consejo {
  if (medida.media < 55 || medida.contraste < 45) return 'mas_luz'
  if (medida.nitidez < 4) return 'sin_mover'
  return 'acercate'
}
