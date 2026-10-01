import { useEffect, useRef } from 'react'

/**
 * Cerrar una hoja arrastrandola hacia abajo, siguiendo el dedo.
 *
 * Todo el arrastre va por DOM directo (`transform` del elemento y `opacity` del
 * fondo), sin pasar por React: a 60 eventos por segundo un `setState` repinta
 * la hoja entera y en un movil de hace tres anos se nota como tirones.
 * Solo se toca `transform` y `opacity`.
 *
 * Por que es un gancho de eventos nativos y no `onTouchMove` de React:
 *   - React registra `touchmove` como pasivo: no deja llamar a
 *     `preventDefault`, y sin eso el navegador hace scroll a la vez que la
 *     hoja baja (las dos cosas a la vez era el "se despegaba a medias").
 *   - Asi la hoja solo se arrastra cuando el contenido esta arriba del todo
 *     (`scrollTop` 0) y el dedo baja; en cualquier otro caso el gesto es un
 *     scroll normal y no se toca.
 *
 * Al soltar: si bajo lo suficiente (o el gesto fue un latigazo) se llama a
 * `onClose` y la hoja termina de salir con su propia transicion; si no,
 * vuelve a su sitio con la misma curva con la que entro.
 */

const UMBRAL_INICIO_PX = 8
const UMBRAL_CIERRE_PX = 110
const FRACCION_CIERRE = 0.28
const VELOCIDAD_CIERRE_PX_MS = 0.55

export const TRANSICION_HOJA_ENTRA = 'transform var(--saga-motion-entra) var(--saga-curva-entra)'
export const TRANSICION_HOJA_SALE = 'transform var(--saga-motion-sale) var(--saga-curva-sale)'
export const TRANSICION_FONDO_ENTRA = 'opacity var(--saga-dur-media) var(--saga-curva-entra)'
export const TRANSICION_FONDO_SALE = 'opacity var(--saga-motion-sale) var(--saga-curva-sale)'

/** Sube por los padres: si alguno tiene scroll vertical por recorrer, el gesto es suyo. */
function contenidoPorEncima(desde: EventTarget | null, hasta: HTMLElement): boolean {
  let el = desde instanceof HTMLElement ? desde : null
  while (el && el !== hasta.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) {
      const { overflowY } = window.getComputedStyle(el)
      if (overflowY === 'auto' || overflowY === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

interface Opciones {
  hoja: HTMLElement | null
  fondo: HTMLElement | null
  activo: boolean
  abierta: boolean
  onClose: () => void
}

export function useArrastrarParaCerrar({ hoja, fondo, activo, abierta, onClose }: Opciones) {
  // Siempre lo ultimo, sin volver a registrar los oyentes en cada render.
  const cerrarRef = useRef(onClose)
  const abiertaRef = useRef(abierta)
  useEffect(() => {
    cerrarRef.current = onClose
    abiertaRef.current = abierta
  })

  useEffect(() => {
    if (!hoja || !activo) return undefined
    const laHoja: HTMLElement = hoja

    let candidato = false
    let arrastrando = false
    let x0 = 0
    let y0 = 0
    let base = 0
    let desplazamiento = 0
    let alto = 1
    let muestras: Array<{ t: number; y: number }> = []

    function alEmpezar(e: TouchEvent) {
      arrastrando = false
      candidato = e.touches.length === 1 && !contenidoPorEncima(e.target, laHoja)
      if (!candidato) return
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      muestras = [{ t: e.timeStamp, y: y0 }]
    }

    function alMover(e: TouchEvent) {
      if (!candidato || e.touches.length !== 1) return
      const t = e.touches[0]
      const dy = t.clientY - y0
      const dx = t.clientX - x0

      if (!arrastrando) {
        if (dy < -UMBRAL_INICIO_PX || Math.abs(dx) > UMBRAL_INICIO_PX * 2) {
          // Va hacia arriba o de lado: es scroll o un gesto del contenido.
          candidato = false
          return
        }
        if (dy < UMBRAL_INICIO_PX || dy < Math.abs(dx) * 1.5) return
        // Empieza: desde aqui la hoja sigue al dedo 1:1 (el punto donde se
        // toco la pantalla, no el del umbral: asi el dedo no se "despega").
        arrastrando = true
        base = y0
        alto = Math.max(1, laHoja.offsetHeight)
        laHoja.style.transition = 'none'
        laHoja.style.willChange = 'transform'
        if (fondo) {
          fondo.style.transition = 'none'
          fondo.style.willChange = 'opacity'
        }
      }

      if (e.cancelable) e.preventDefault()
      desplazamiento = Math.max(0, t.clientY - base)
      laHoja.style.transform = `translate3d(0, ${desplazamiento}px, 0)`
      if (fondo) fondo.style.opacity = String(Math.max(0, 1 - desplazamiento / (alto * 1.1)))
      muestras.push({ t: e.timeStamp, y: t.clientY })
      if (muestras.length > 6) muestras.shift()
    }

    function volverAlSitio() {
      laHoja.style.transition = TRANSICION_HOJA_ENTRA
      laHoja.style.transform = 'translate3d(0, 0, 0)'
      if (fondo) {
        fondo.style.transition = TRANSICION_FONDO_ENTRA
        fondo.style.opacity = '1'
      }
      // `will-change` solo mientras se mueve: se suelta al asentarse.
      window.setTimeout(() => {
        laHoja.style.willChange = ''
        if (fondo) fondo.style.willChange = ''
      }, 400)
    }

    function alTerminar() {
      candidato = false
      if (!arrastrando) return
      arrastrando = false

      const ultima = muestras[muestras.length - 1]
      const vieja = muestras.find((m) => ultima && ultima.t - m.t <= 120) ?? muestras[0]
      const velocidad = ultima && vieja && ultima.t > vieja.t ? (ultima.y - vieja.y) / (ultima.t - vieja.t) : 0
      const cierra =
        desplazamiento > Math.min(UMBRAL_CIERRE_PX, alto * FRACCION_CIERRE) ||
        velocidad > VELOCIDAD_CIERRE_PX_MS

      if (!cierra) {
        volverAlSitio()
        return
      }

      // Que termine de salir desde donde esta: mismas fichas de tiempo que al
      // cerrar con la X. React reescribe `transform` a 100% al cerrarse.
      laHoja.style.transition = TRANSICION_HOJA_SALE
      if (fondo) fondo.style.transition = TRANSICION_FONDO_SALE
      cerrarRef.current()
      // Si quien la abre no la cierra (por ejemplo, un envio en marcha), no se
      // queda a medio camino.
      window.setTimeout(() => {
        if (abiertaRef.current) volverAlSitio()
      }, 160)
    }

    laHoja.addEventListener('touchstart', alEmpezar, { passive: true })
    laHoja.addEventListener('touchmove', alMover, { passive: false })
    laHoja.addEventListener('touchend', alTerminar, { passive: true })
    laHoja.addEventListener('touchcancel', alTerminar, { passive: true })
    return () => {
      laHoja.removeEventListener('touchstart', alEmpezar)
      laHoja.removeEventListener('touchmove', alMover)
      laHoja.removeEventListener('touchend', alTerminar)
      laHoja.removeEventListener('touchcancel', alTerminar)
    }
  }, [hoja, fondo, activo])
}
