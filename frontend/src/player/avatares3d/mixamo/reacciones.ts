/**
 * Mensajes rápidos y bocadillos encima del muñeco (5.59).
 *
 * El menú de tocarte tiene una fila de gestos y otra de frases cortas. Lo que haces lo ves al momento sobre tu
 * muñeco y viaja a los demás por `/api/reaccion` → tabla del equipo del latido (les llega en ≤ 30 s). Sólo
 * claves de este catálogo (espejo de `MENSAJES_RAPIDOS` en backend/app/runtime/live_positions.py): nada de texto
 * libre, que entre los jugadores hay menores. Cada móvil pinta la frase en SU idioma.
 */

export type IdMensaje = 'hola' | 'vamos' | 'espera' | 'aqui' | 'ayuda' | 'bien' | 'vale' | 'descanso'

export const MENSAJES_RAPIDOS: readonly { id: IdMensaje; icono: string; es: string; gl: string; en: string }[] = [
  { id: 'hola', icono: '👋', es: '¡Hola!', gl: 'Ola!', en: 'Hi!' },
  { id: 'vamos', icono: '🚀', es: '¡Vamos!', gl: 'Imos!', en: "Let's go!" },
  { id: 'espera', icono: '✋', es: '¡Espérame!', gl: 'Agárdame!', en: 'Wait for me!' },
  { id: 'aqui', icono: '📍', es: '¡Estoy aquí!', gl: 'Estou aquí!', en: "I'm here!" },
  { id: 'ayuda', icono: '🆘', es: '¿Me ayudas?', gl: 'Axúdasme?', en: 'Help me?' },
  { id: 'bien', icono: '🎉', es: '¡Bien hecho!', gl: 'Ben feito!', en: 'Well done!' },
  { id: 'vale', icono: '👍', es: 'Vale', gl: 'Vale', en: 'OK' },
  { id: 'descanso', icono: '☕', es: 'Paro un momento', gl: 'Paro un intre', en: 'Short break' },
]

/** Lanzado al hacer TÚ un mensaje: el mapa lo pinta sobre tu muñeco al momento (detalle: la clave). */
export const EVENTO_MENSAJE = 'saga:mensaje-rapido'
/** Cuánto se ve un bocadillo. */
export const DURACION_BOCADILLO_MS = 5000

export function textoDeMensaje(id: string, locale: string): string | null {
  const m = MENSAJES_RAPIDOS.find((x) => x.id === id)
  if (!m) return null
  const texto = locale === 'gl' ? m.gl : locale === 'en' ? m.en : m.es
  return `${m.icono} ${texto}`
}

type Punto = { x: number; y: number }

/**
 * Los bocadillos del mapa: un div por jugador dentro del contenedor del mapa, colocado en cada fotograma sobre su
 * cabeza (`posicion` da px CSS del contenedor, o null si no está a la vista). Sin React: se mueven a 60 Hz.
 */
export function crearBocadillos(contenedor: HTMLElement, posicion: (clave: string) => Punto | null) {
  const activos = new Map<string, { el: HTMLDivElement; hasta: number }>()
  let raf = 0

  function colocar() {
    raf = 0
    const ahora = performance.now()
    for (const [clave, b] of activos) {
      if (ahora > b.hasta) {
        activos.delete(clave)
        const el = b.el
        el.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' })
        window.setTimeout(() => el.remove(), 240)
        continue
      }
      const p = posicion(clave)
      if (!p) {
        b.el.style.visibility = 'hidden'
        continue
      }
      b.el.style.visibility = 'visible'
      b.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`
    }
    if (activos.size) raf = window.requestAnimationFrame(colocar)
  }

  return {
    mostrar(clave: string, texto: string, ms = DURACION_BOCADILLO_MS) {
      let b = activos.get(clave)
      if (!b) {
        const el = document.createElement('div')
        el.className = 'saga-bocadillo'
        el.setAttribute('role', 'status')
        el.style.cssText =
          'position:absolute;left:0;top:0;z-index:6;pointer-events:none;max-width:190px;padding:7px 12px 8px;' +
          // no-tema: el bocadillo es blanco con letra oscura en todos los temas (se lee sobre la foto aérea).
          'border-radius:16px;background:#ffffff;color:#0f172a;font:800 14px/1.2 system-ui,sans-serif;' + // no-tema
          'text-align:center;white-space:normal;box-shadow:0 6px 18px rgba(0,0,0,.35);visibility:hidden;will-change:transform'
        const cola = document.createElement('i')
        cola.style.cssText =
          'position:absolute;left:50%;bottom:-6px;width:12px;height:12px;margin-left:-6px;background:#ffffff;' +
          'transform:rotate(45deg);border-radius:2px'
        el.appendChild(document.createElement('span'))
        el.appendChild(cola)
        contenedor.appendChild(el)
        b = { el, hasta: 0 }
        activos.set(clave, b)
      }
      ;(b.el.firstChild as HTMLSpanElement).textContent = texto
      b.hasta = performance.now() + ms
      b.el.animate?.(
        [
          { opacity: 0, scale: '0.6' },
          { opacity: 1, scale: '1' },
        ],
        { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.3)' }
      )
      if (!raf) raf = window.requestAnimationFrame(colocar)
    },
    quitarTodos() {
      if (raf) window.cancelAnimationFrame(raf)
      raf = 0
      for (const b of activos.values()) b.el.remove()
      activos.clear()
    },
  }
}
