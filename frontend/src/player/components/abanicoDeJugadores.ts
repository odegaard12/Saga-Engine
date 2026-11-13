import * as maplibregl from 'maplibre-gl'
import { elementoDeRetrato } from '../avatares/retratoDeMapa'
import type { MxId } from '../avatares3d/mixamo/catalogo'

/**
 * 7/11 (Óscar eligió la C: «el mejor el abanico»): los jugadores que en 3D no tienen sitio cerca del suyo sin tapar un
 * nodo u otro jugador (`abanico` en `planDeJugadores`) no se pintan en el mapa: van en un abanico de fotos apiladas con
 * su aro, con «+N» si son más de tres, puesto en un hueco libre. Es la reserva: desde el 8/11 sólo sale si de verdad
 * no hay hueco en pantalla. Al tocarlo se abre como CARRUSEL (8/11: una tira de fotos que se desliza con el dedo, con
 * «N aquí»); tocar fuera de las fotos lo cierra. Es un marcador del mapa (DOM): no repinta nada.
 */

export type MiembroDeAbanico = { clave: string; mx: MxId; color: string; foto?: string }
export type Abanico = { id: string; lat: number; lon: number; miembros: MiembroDeAbanico[] }

const LADO_PILA = 40
const LADO_CORRO = 34

function texto(locale: string, n: number) {
  return {
    aqui: `${n} aquí`,
    etiqueta:
      locale === 'gl'
        ? `${n} ${n === 1 ? 'xogador' : 'xogadores'} aquí`
        : `${n} ${n === 1 ? 'jugador' : 'jugadores'} aquí`,
  }
}

function contenido(el: HTMLElement, a: Abanico, locale: string) {
  const n = a.miembros.length
  const t = texto(locale, n)
  el.setAttribute('aria-label', t.etiqueta)
  el.dataset.cuantos = String(n)
  if (n === 1) {
    el.classList.remove('abierto')
    el.setAttribute('aria-expanded', 'false')
  }
  const pila = document.createElement('span')
  pila.className = 'saga-abanico-pila'
  a.miembros.slice(0, 3).forEach((m, i, vis) => {
    const r = elementoDeRetrato(m.mx, m.color, LADO_PILA, m.foto)
    r.classList.add('saga-abanico-foto')
    const giro = vis.length === 1 ? 0 : (i - (vis.length - 1) / 2) * 14
    r.style.transform = `translateX(${(i - (vis.length - 1) / 2) * 15}px) rotate(${giro}deg)`
    r.style.zIndex = String(3 - i)
    pila.appendChild(r)
  })
  const hijos: HTMLElement[] = [pila]
  if (n > 3) {
    const mas = document.createElement('span')
    mas.className = 'saga-abanico-mas'
    mas.textContent = `+${n - 3}`
    hijos.push(mas)
  }
  // 8/11 (Óscar: «ahí debería ser carrusel»): abierto es una tira de fotos que se desliza con el dedo, no un corro.
  const corro = document.createElement('span')
  corro.className = 'saga-abanico-corro'
  const tira = document.createElement('span')
  tira.className = 'saga-abanico-tira'
  // El deslizamiento es de la tira, no del mapa; y tocar una foto no cierra el carrusel (11/11).
  for (const ev of ['pointerdown', 'touchstart', 'touchmove', 'wheel'] as const) {
    tira.addEventListener(ev, (e) => e.stopPropagation(), { passive: true })
  }
  tira.addEventListener('click', (e) => e.stopPropagation())
  a.miembros.forEach((m) => {
    const r = elementoDeRetrato(m.mx, m.color, LADO_CORRO, m.foto)
    r.classList.add('saga-abanico-foto')
    tira.appendChild(r)
  })
  const rotulo = document.createElement('span')
  rotulo.className = 'saga-abanico-rotulo'
  rotulo.textContent = t.aqui
  corro.append(tira, rotulo)
  hijos.push(corro)
  el.replaceChildren(...hijos)
}

/** Los abanicos puestos en el mapa: `poner` los crea, mueve o quita según el último plan. */
export function crearAbanicos() {
  const puestos = new Map<
    string,
    { marcador: maplibregl.Marker; el: HTMLElement; firma: string }
  >()
  return {
    poner(mapa: maplibregl.Map | null, abanicos: readonly Abanico[], locale: string) {
      const vivos = new Set<string>()
      if (mapa) {
        for (const a of abanicos) {
          vivos.add(a.id)
          const firma =
            locale + '|' + a.miembros.map((m) => `${m.clave}:${m.color}:${m.foto ?? ''}`).join(',')
          let p = puestos.get(a.id)
          if (!p) {
            // 11/11: un `div` con papel de botón y no un `<button>`: dentro va la tira del carrusel, que se desliza
            // (contenido interactivo dentro de un botón no vale, y un toque en una foto lo cerraba).
            const el = document.createElement('div')
            el.setAttribute('role', 'button')
            el.tabIndex = 0
            el.className = 'saga-abanico'
            el.setAttribute('aria-expanded', 'false')
            const alternar = (ev: Event) => {
              ev.stopPropagation()
              // Con uno solo no hay nada que abrir: su foto ya se ve entera.
              const abierto = !el.classList.contains('abierto') && el.dataset.cuantos !== '1'
              el.classList.toggle('abierto', abierto)
              el.setAttribute('aria-expanded', String(abierto))
            }
            el.addEventListener('click', alternar)
            el.addEventListener('keydown', (ev) => {
              if (ev.key !== 'Enter' && ev.key !== ' ') return
              ev.preventDefault()
              alternar(ev)
            })
            const marcador = new maplibregl.Marker({
              element: el,
              anchor: 'bottom',
              pitchAlignment: 'viewport',
              rotationAlignment: 'viewport',
            })
            p = { marcador, el, firma: '' }
            puestos.set(a.id, p)
            marcador.setLngLat([a.lon, a.lat]).addTo(mapa)
          } else p.marcador.setLngLat([a.lon, a.lat])
          if (p.firma !== firma) {
            contenido(p.el, a, locale)
            p.firma = firma
          }
        }
      }
      for (const [id, p] of puestos) {
        if (vivos.has(id)) continue
        p.marcador.remove()
        puestos.delete(id)
      }
    },
    quitar() {
      for (const p of puestos.values()) p.marcador.remove()
      puestos.clear()
    },
  }
}
