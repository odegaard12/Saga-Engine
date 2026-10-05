/**
 * Que la pantalla vuelva a su sitio al cerrar el teclado (iPhone).
 *
 * Lo que hace Safari en iOS (comprobado por otros, ver CHANGELOG 5.49 y las fuentes del informe):
 *  - Al enfocar un campo, el teclado NO encoge la ventana de diseño: desplaza el VISUAL viewport
 *    (`visualViewport.offsetTop` > 0) y a veces la página (`scrollY` > 0) para enseñar el campo.
 *  - Al cerrarlo, en iOS 26 el visual viewport puede quedarse corrido o ~24 px más bajo que la ventana
 *    (WebKit 297779, foros de Apple 800125/800154). Lo `position: fixed` se queda descolocado y abajo
 *    asoma el fondo de `html`: la «franja» bajo el disparador.
 *  - En la PWA (pantalla de inicio) la ventana entera (`innerHeight`, `100dvh`) puede encoger con el
 *    primer teclado y no volver hasta forzar un nuevo cálculo de la maquetación.
 *  - Quitar del DOM un campo con el foco NO lanza `focusout` (regla «focus fixup» del HTML; WebKit y
 *    Firefox no avisan): nadie se enteraba de que el teclado se iba.
 *
 * Por eso esto no se fía de ningún momento concreto: cuando el teclado se va (sale el foco, el campo
 * desaparece o lo pide quien cierra) abre una VENTANA DE VIGILANCIA de hasta 2,5 s que, en cada
 * fotograma y en cada `resize`/`scroll` del visual viewport, devuelve la página a (0, 0) y comprueba si
 * la vista ya es la normal (altura completa, sin desplazamiento). Si no vuelve sola, la «sana» una vez
 * (fuerza otra maquetación de `#root` y un empujón de scroll de 1 px). Mientras tanto, si el visual
 * viewport sigue corrido SIN teclado, la raíz de la app se ajusta a lo que se ve de verdad con dos
 * variables CSS (`--saga-vista-top`, `--saga-vista-bottom`, ver `.saga-raiz-movil` en mobile-shell.css).
 * Con el teclado abierto no se toca nada: iOS necesita ese desplazamiento para enseñar el campo.
 */

export type MedidaVisualCompleta =
  | {
      height: number
      offsetTop: number
      pageTop?: number
    }
  | null
  | undefined

/** Un campo donde se escribe (el teclado sale con él). */
export function esCampoDeTexto(el: Element | null | undefined): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return ![
      'button',
      'submit',
      'checkbox',
      'radio',
      'range',
      'file',
      'color',
      'image',
      'reset',
    ].includes(el.type)
  }
  return false
}

/** Margen por debajo del cual la diferencia entre ventana y área visible no es un teclado (barras del navegador). */
export const ALTO_MINIMO_DE_TECLADO_PX = 160

/** ¿El área visible es claramente menor que la ventana? En iOS y Android la ventana no encoge con el teclado: el visual viewport sí. */
export function tecladoAbierto(medida: MedidaVisualCompleta, alturaVentana: number): boolean {
  if (!medida || !Number.isFinite(medida.height) || !Number.isFinite(alturaVentana)) return false
  return alturaVentana - medida.height > ALTO_MINIMO_DE_TECLADO_PX
}

/** ¿Está la pantalla fuera de su sitio? (página desplazada o visual viewport corrido hacia abajo). */
export function estaDesplazada(
  medida: MedidaVisualCompleta,
  scrollX: number,
  scrollY: number
): boolean {
  const corrida = medida ? Math.max(medida.offsetTop || 0, medida.pageTop || 0) : 0
  return scrollY > 1 || scrollX > 1 || corrida > 1
}

/** Qué hacer ahora: reponer sólo si no se está escribiendo, no hay teclado y la pantalla está corrida. */
export function hayQueReponer(args: {
  escribiendo: boolean
  medida: MedidaVisualCompleta
  alturaVentana: number
  scrollX: number
  scrollY: number
}): boolean {
  if (args.escribiendo) return false
  if (tecladoAbierto(args.medida, args.alturaVentana)) return false
  return estaDesplazada(args.medida, args.scrollX, args.scrollY)
}

/** Lo que hace falta medir para saber si la vista ya está como antes del teclado. */
export type EstadoDeVista = {
  medida: MedidaVisualCompleta
  alturaVentana: number
  /** La mayor `innerHeight` vista sin teclado en esta orientación (la PWA puede encoger y no volver). */
  alturaBase: number
  scrollX: number
  scrollY: number
}

/** ¿La vista está en su sitio? Sin teclado, sin desplazamiento, el área visible entera y la ventana sin encoger. */
export function vistaNormal(e: EstadoDeVista): boolean {
  if (tecladoAbierto(e.medida, e.alturaVentana)) return false
  if (estaDesplazada(e.medida, e.scrollX, e.scrollY)) return false
  if (e.medida && Number.isFinite(e.medida.height) && e.medida.height < e.alturaVentana - 2)
    return false
  if (Number.isFinite(e.alturaBase) && e.alturaVentana < e.alturaBase - 4) return false
  return true
}

export const VARIABLES_DE_VISTA = ['--saga-vista-top', '--saga-vista-bottom'] as const

/**
 * Cuánto hay que mover la raíz para que coincida con lo que se ve: sólo SIN teclado y sin escribir, y sólo si
 * el visual viewport no coincide con la ventana (el fallo de iOS 26). En el caso normal, vacío: vale `inset: 0`.
 */
export function compensacionDeVista(
  medida: MedidaVisualCompleta,
  alturaVentana: number,
  escribiendo: boolean
): Record<string, string> {
  if (escribiendo || !medida) return {}
  if (
    !Number.isFinite(medida.height) ||
    !Number.isFinite(medida.offsetTop) ||
    !Number.isFinite(alturaVentana)
  )
    return {}
  if (medida.height <= 0 || tecladoAbierto(medida, alturaVentana)) return {}
  const arriba = Math.max(0, Math.round(medida.offsetTop))
  const abajo = Math.round(alturaVentana - medida.offsetTop - medida.height)
  if (arriba <= 1 && Math.abs(abajo) <= 1) return {}
  // Un hueco de más de un teclado no es este fallo: mejor no tocar.
  if (arriba > ALTO_MINIMO_DE_TECLADO_PX || Math.abs(abajo) > ALTO_MINIMO_DE_TECLADO_PX) return {}
  // `abajo` puede ser negativo: si lo visible se pasa del final de la ventana, la raíz se alarga por debajo.
  return { '--saga-vista-top': `${arriba}px`, '--saga-vista-bottom': `${abajo}px` }
}

/** Cuánto dura como mucho la vigilancia tras cerrarse el teclado. */
export const VIGILANCIA_MS = 2500
/** Fotogramas seguidos «en su sitio» para dar la vista por repuesta. */
export const FOTOGRAMAS_ESTABLES = 3

/** Motivo de una reposición (lo enseña el modo `?depurar-vista`). */
export type MotivoDeReposicion =
  'salir-del-campo' | 'campo-quitado' | 'teclado-cerrado' | 'pedido' | 'volver' | 'inicio'

/** Aviso para el modo depuración (y quien quiera escuchar). */
export const EVENTO_VISTA = 'saga:vista'

function avisar(fase: string, motivo?: string) {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_VISTA, { detail: { fase, motivo } }))
  } catch {
    /* sin CustomEvent: nada que avisar */
  }
}

/** Lo que dispara la vigilancia (lo deja `instalarVistaTrasTeclado`); fuera de él no hace nada. */
let vigilarAhora: ((motivo: MotivoDeReposicion) => void) | null = null

/**
 * Pide reponer la pantalla tras cerrar algo que tenía un campo de texto (la cámara con su nota). Quita el foco del
 * campo ANTES de que desaparezca —en iOS quitar del DOM un campo enfocado no lanza `focusout`— y abre la vigilancia.
 */
export function reponerTrasTeclado(): void {
  if (typeof document !== 'undefined') {
    const activo = document.activeElement
    if (esCampoDeTexto(activo)) (activo as HTMLElement).blur()
  }
  vigilarAhora?.('pedido')
}

/** Instala los vigilantes. Devuelve la función que los quita. */
export function instalarVistaTrasTeclado(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  const vv = window.visualViewport ?? null
  const raiz = document.documentElement
  const pedirFotograma: (f: () => void) => number =
    typeof window.requestAnimationFrame === 'function'
      ? (f) => window.requestAnimationFrame(f)
      : (f) => window.setTimeout(f, 16)
  const soltarFotograma = (id: number) => {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id)
    window.clearTimeout(id)
  }

  let alturaBase = window.innerHeight
  let anchoBase = window.innerWidth
  let habiaTeclado = false
  let campo: HTMLElement | null = null
  let observador: MutationObserver | null = null
  let fotograma = 0
  let vigilarHasta = 0
  let estables = 0
  let sanada = false
  let motivoActual: MotivoDeReposicion = 'inicio'

  const escribiendo = () => {
    const activo = document.activeElement
    return esCampoDeTexto(activo) && (activo as HTMLElement).isConnected
  }

  const estado = (): EstadoDeVista => ({
    medida: vv,
    alturaVentana: window.innerHeight,
    alturaBase,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  })

  const compensar = () => {
    const v = compensacionDeVista(vv, window.innerHeight, escribiendo())
    for (const n of VARIABLES_DE_VISTA) {
      if (v[n]) raiz.style.setProperty(n, v[n])
      else raiz.style.removeProperty(n)
    }
  }

  const aCero = () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
    const desplazable = document.scrollingElement
    if (desplazable && desplazable.scrollTop !== 0) desplazable.scrollTop = 0
    if (document.body && document.body.scrollTop !== 0) document.body.scrollTop = 0
    if (raiz.scrollTop !== 0) raiz.scrollTop = 0
  }

  /** La receta de la PWA que encoge: otra maquetación de la raíz y un empujón de 1 px. */
  const sanar = () => {
    const app = document.getElementById('root')
    if (app) {
      const antes = app.style.display
      app.style.display = 'none'
      void app.offsetHeight
      app.style.display = antes
    }
    window.scrollTo(0, 1)
    window.scrollTo(0, 0)
    avisar('sanar', motivoActual)
  }

  const marcarTeclado = () => {
    const abierto = tecladoAbierto(vv, window.innerHeight)
    raiz.dataset.teclado = !escribiendo() ? '' : abierto ? 'abierto' : 'enfocado'
    return abierto
  }

  const terminar = (fase: string) => {
    if (fotograma) soltarFotograma(fotograma)
    fotograma = 0
    vigilarHasta = 0
    compensar()
    // Quien mide la pantalla (el mapa, la hoja de la tienda) la vuelve a medir.
    window.dispatchEvent(new Event('resize'))
    avisar(fase, motivoActual)
  }

  const paso = () => {
    fotograma = 0
    if (!vigilarHasta) return
    if (escribiendo()) {
      // Ha vuelto a escribir (otro campo): con teclado no se toca nada.
      vigilarHasta = 0
      avisar('cancelada', motivoActual)
      return
    }
    const abierto = marcarTeclado()
    if (!abierto) {
      aCero()
      compensar()
    }
    if (vistaNormal(estado())) {
      estables += 1
      if (estables >= FOTOGRAMAS_ESTABLES) {
        terminar('normal')
        return
      }
    } else {
      estables = 0
    }
    if (Date.now() >= vigilarHasta) {
      if (!sanada && !abierto) {
        sanada = true
        sanar()
      }
      terminar(vistaNormal(estado()) ? 'normal' : 'sin-volver')
      return
    }
    fotograma = pedirFotograma(paso)
  }

  const vigilar = (motivo: MotivoDeReposicion) => {
    motivoActual = motivo
    estables = 0
    sanada = false
    vigilarHasta = Date.now() + VIGILANCIA_MS
    avisar('vigilar', motivo)
    if (!fotograma) fotograma = pedirFotograma(paso)
  }
  vigilarAhora = vigilar

  const soltarObservador = () => {
    observador?.disconnect()
    observador = null
    campo = null
  }

  const alEntrarEnCampo = (event: Event) => {
    const el = event.target as Element | null
    if (!esCampoDeTexto(el)) return
    campo = el as HTMLElement
    vigilarHasta = 0
    marcarTeclado()
    compensar()
    // Si el campo desaparece con el foco no habrá `focusout`: se vigila el DOM mientras esté enfocado.
    if (!observador && typeof MutationObserver === 'function' && document.body) {
      observador = new MutationObserver(() => {
        if (campo && !campo.isConnected) {
          soltarObservador()
          vigilar('campo-quitado')
        }
      })
      observador.observe(document.body, { childList: true, subtree: true })
    }
  }

  const alSalirDelCampo = (event: Event) => {
    if (!esCampoDeTexto(event.target as Element | null)) return
    soltarObservador()
    vigilar('salir-del-campo')
  }

  const alCambiarVisual = () => {
    const abierto = marcarTeclado()
    // El teclado se acaba de ir (aunque nadie haya soltado el foco).
    if (habiaTeclado && !abierto && !vigilarHasta) vigilar('teclado-cerrado')
    habiaTeclado = abierto
    if (!abierto && !escribiendo() && window.innerHeight > alturaBase)
      alturaBase = window.innerHeight
    compensar()
  }

  const alGirar = () => {
    if (window.innerWidth !== anchoBase) {
      anchoBase = window.innerWidth
      alturaBase = window.innerHeight
    }
    if (!escribiendo() && window.innerHeight > alturaBase) alturaBase = window.innerHeight
  }

  const alVolver = () => {
    if (document.visibilityState === 'visible') vigilar('volver')
  }

  document.addEventListener('focusin', alEntrarEnCampo, true)
  document.addEventListener('focusout', alSalirDelCampo, true)
  vv?.addEventListener('resize', alCambiarVisual)
  vv?.addEventListener('scroll', alCambiarVisual)
  window.addEventListener('resize', alGirar)
  window.addEventListener('orientationchange', alVolver)
  window.addEventListener('pageshow', alVolver)
  document.addEventListener('visibilitychange', alVolver)
  marcarTeclado()
  compensar()

  return () => {
    vigilarAhora = null
    soltarObservador()
    document.removeEventListener('focusin', alEntrarEnCampo, true)
    document.removeEventListener('focusout', alSalirDelCampo, true)
    vv?.removeEventListener('resize', alCambiarVisual)
    vv?.removeEventListener('scroll', alCambiarVisual)
    window.removeEventListener('resize', alGirar)
    window.removeEventListener('orientationchange', alVolver)
    window.removeEventListener('pageshow', alVolver)
    document.removeEventListener('visibilitychange', alVolver)
    if (fotograma) soltarFotograma(fotograma)
    for (const n of VARIABLES_DE_VISTA) raiz.style.removeProperty(n)
    delete raiz.dataset.teclado
  }
}
