/**
 * Modo `?depurar-vista`: un recuadro con las medidas de la ventana para mandarlas desde un iPhone de verdad.
 *
 * Lo que falla con el teclado sólo pasa en iOS, y en el escritorio no se puede reproducir. Con este modo el
 * jugador abre la app con `?depurar-vista` en la dirección, repite el fallo y pulsa «Copiar»: se lleva al
 * portapapeles las medidas actuales y el registro (con hora) de cada foco, cambio de ventana y reposición.
 *
 * NUNCA sale sin el parámetro. El parámetro se recuerda en la pestaña (`sessionStorage`) para que no se pierda
 * cuando la app reescribe la dirección; `?depurar-vista=0` lo apaga. No guarda nada fuera del dispositivo.
 */

export const PARAMETRO_DEPURAR_VISTA = 'depurar-vista'
const CLAVE = 'saga:depurar-vista'
/** Entradas como mucho en el registro (las más antiguas se van). */
export const MAX_REGISTRO = 400

/** ¿Está pedido el modo? Sólo con el parámetro en la dirección, o si ya se pidió en esta pestaña. */
export function depuracionPedida(busqueda: string, recordado: string | null): boolean {
  const p = new URLSearchParams(busqueda || '')
  if (p.has(PARAMETRO_DEPURAR_VISTA)) {
    const v = (p.get(PARAMETRO_DEPURAR_VISTA) || '').trim().toLowerCase()
    return !['0', 'no', 'false', 'off'].includes(v)
  }
  return recordado === '1'
}

/** Lee la dirección y la pestaña; recuerda o borra el permiso según el parámetro. */
export function depuracionActiva(): boolean {
  if (typeof window === 'undefined') return false
  let recordado: string | null = null
  try {
    recordado = window.sessionStorage.getItem(CLAVE)
  } catch {
    recordado = null
  }
  const activa = depuracionPedida(window.location.search, recordado)
  try {
    if (new URLSearchParams(window.location.search).has(PARAMETRO_DEPURAR_VISTA)) {
      if (activa) window.sessionStorage.setItem(CLAVE, '1')
      else window.sessionStorage.removeItem(CLAVE)
    }
  } catch {
    /* sin sessionStorage: vale sólo mientras siga el parámetro */
  }
  return activa
}

export type MedidasDeVista = {
  innerHeight: number
  innerWidth: number
  outerHeight: number
  clientHeight: number
  vvHeight: number | null
  vvOffsetTop: number | null
  vvPageTop: number | null
  scrollY: number
  raizTop: number | null
  raizAlto: number | null
  safeTop: number
  safeBottom: number
  modo: 'standalone' | 'navegador'
  teclado: string
  foco: string
}

function px(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function redondo(n: number | undefined | null): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null
}

/** Lo que se ve ahora mismo (en el navegador). `sonda` es un elemento con padding = safe-area insets. */
export function medirVista(sonda: HTMLElement | null): MedidasDeVista {
  const vv = window.visualViewport
  const raiz = document.querySelector('[data-saga-raiz]') as HTMLElement | null
  const caja = raiz?.getBoundingClientRect()
  const estilo = sonda ? getComputedStyle(sonda) : null
  const standalone =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  const activo = document.activeElement
  const html = document.documentElement
  return {
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    outerHeight: window.outerHeight,
    clientHeight: html.clientHeight,
    vvHeight: redondo(vv?.height),
    vvOffsetTop: redondo(vv?.offsetTop),
    vvPageTop: redondo(vv?.pageTop),
    scrollY: redondo(window.scrollY) ?? 0,
    raizTop: redondo(caja?.top),
    raizAlto: redondo(caja?.height),
    safeTop: estilo ? px(estilo.paddingTop) : 0,
    safeBottom: estilo ? px(estilo.paddingBottom) : 0,
    modo: standalone ? 'standalone' : 'navegador',
    teclado: html.dataset.teclado || '-',
    foco: activo && activo !== document.body ? activo.tagName.toLowerCase() : '-',
  }
}

/** Una línea corta con las medidas (para el registro y el recuadro). */
export function lineaDeMedidas(m: MedidasDeVista): string {
  return (
    `in ${m.innerWidth}x${m.innerHeight} out ${m.outerHeight} cli ${m.clientHeight} ` +
    `vv ${m.vvHeight ?? '-'}@${m.vvOffsetTop ?? '-'} pt ${m.vvPageTop ?? '-'} sy ${m.scrollY} ` +
    `raiz ${m.raizTop ?? '-'}+${m.raizAlto ?? '-'} safe ${m.safeTop}/${m.safeBottom} ` +
    `tec ${m.teclado} foco ${m.foco}`
  )
}

export type EntradaDeRegistro = { t: string; evento: string; medidas: string }

/** El registro vive en el módulo: sobrevive a que la pantalla cambie y el recuadro se vuelva a montar. */
const registro: EntradaDeRegistro[] = []

export function anotar(evento: string, medidas: string, ahora = new Date()): EntradaDeRegistro {
  const hh = String(ahora.getHours()).padStart(2, '0')
  const mm = String(ahora.getMinutes()).padStart(2, '0')
  const ss = String(ahora.getSeconds()).padStart(2, '0')
  const ms = String(ahora.getMilliseconds()).padStart(3, '0')
  const entrada = { t: `${hh}:${mm}:${ss}.${ms}`, evento, medidas }
  registro.push(entrada)
  if (registro.length > MAX_REGISTRO) registro.splice(0, registro.length - MAX_REGISTRO)
  return entrada
}

export function leerRegistro(): readonly EntradaDeRegistro[] {
  return registro
}

export function vaciarRegistro(): void {
  registro.length = 0
}

/** El texto que se copia: cabecera con el userAgent y las medidas, y el registro entero. */
export function textoParaCopiar(m: MedidasDeVista, userAgent: string, version: string): string {
  const cabecera = [
    `SAGA depurar-vista ${version}`,
    `ua: ${userAgent}`,
    `modo: ${m.modo}`,
    `ahora: ${lineaDeMedidas(m)}`,
    '---',
  ]
  return [...cabecera, ...registro.map((e) => `${e.t} ${e.evento} | ${e.medidas}`)].join('\n')
}
