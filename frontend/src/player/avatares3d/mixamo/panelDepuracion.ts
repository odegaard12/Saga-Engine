import { cargarPersonaje } from './cargador'
import type { ComplementoDeAvatares } from './capaAvatares'
import { textoDeDiagnostico, TEXTO_DE_MOTIVO, type FilaDeDiagnostico, type ResumenDeDiagnostico } from './diagnosticoMapa'

/**
 * El panel de `?depurar-mapa`: una tabla pequeña en una esquina con lo que decide el mapa de cada jugador (3D o
 * retrato y por qué) y un botón «Copiar» para pegarlo desde el móvil. Todo el texto con `textContent`
 * (los nombres los escribe el jugador). Sólo se instala con el parámetro en la dirección.
 */

export type LecturaDelPanel = { filas: FilaDeDiagnostico[]; resumen: ResumenDeDiagnostico }

export function hayDepuracionDeMapa(buscar: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  try {
    return new URLSearchParams(buscar).has('depurar-mapa')
  } catch {
    return false
  }
}

function el<K extends keyof HTMLElementTagNameMap>(etiqueta: K, css: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(etiqueta)
  e.style.cssText = css
  if (texto !== undefined) e.textContent = texto
  return e
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Sin permiso del portapapeles (http, iOS): se selecciona el texto en un área para copiarlo a mano.
    const area = el('textarea', 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0', texto)
    document.body.appendChild(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

export function instalarPanelDeDepuracion(opciones: {
  leer: () => LecturaDelPanel
  bajarModelos?: () => Promise<string>
}): () => void {
  const caja = el(
    'div',
    'position:fixed;left:4px;top:calc(env(safe-area-inset-top,0px) + 120px);z-index:2147483000;max-width:min(92vw,420px);' +
      'background:rgba(0,0,0,.82);color:#e5e7eb;font:10px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:6px 8px;' +
      'border-radius:8px;pointer-events:auto'
  )
  caja.setAttribute('data-saga-depurar-mapa', '')
  const cabecera = el('div', 'color:#7dd3fc;margin-bottom:3px;white-space:pre-wrap')
  const cuerpo = el('div', 'white-space:pre-wrap;word-break:break-word')
  const botones = el('div', 'display:flex;gap:6px;margin-top:5px')
  const estilo = 'font:600 11px system-ui;padding:6px 10px;border-radius:6px;border:0;background:var(--theme-primary, currentColor);color:var(--theme-ink-deep, #000);min-height:32px'
  const botonCopiar = el('button', estilo, 'Copiar')
  botonCopiar.type = 'button'
  const aviso = el('div', 'margin-top:3px;color:#fde68a')
  botones.appendChild(botonCopiar)
  let ultimo = ''
  botonCopiar.addEventListener('click', async () => {
    aviso.textContent = (await copiar(ultimo)) ? 'Copiado.' : 'No se pudo copiar: selecciona el texto a mano.'
  })
  if (opciones.bajarModelos) {
    const baja = el('button', estilo.replace('var(--theme-primary, currentColor)', 'var(--theme-pin, currentColor)'), 'Bajar modelos')
    baja.type = 'button'
    baja.addEventListener('click', async () => {
      aviso.textContent = 'Bajando modelos que faltan…'
      try {
        aviso.textContent = await opciones.bajarModelos!()
      } catch (e) {
        aviso.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    })
    botones.appendChild(baja)
  }
  caja.append(cabecera, cuerpo, botones, aviso)

  const pintar = () => {
    const { filas, resumen } = opciones.leer()
    ultimo = textoDeDiagnostico(filas, resumen)
    const [cab, ...resto] = ultimo.split('\n')
    cabecera.textContent = cab
    cuerpo.textContent = resto.join('\n') || '(sin otros jugadores en el mapa)'
  }
  pintar()
  const id = window.setInterval(pintar, 1000)
  document.body.appendChild(caja)
  return () => {
    window.clearInterval(id)
    caja.remove()
  }
}

export { TEXTO_DE_MOTIVO }

/**
 * El botón «Bajar modelos»: lo pulsa una persona con el panel a la vista, y es lo ÚNICO que pide modelos a la red
 * fuera de la pantalla de carga y la tienda (el mapa normal sólo lee la caché del móvil).
 */
export async function bajarModelosQueFaltan(comp: ComplementoDeAvatares | null): Promise<string> {
  if (!comp) return 'La capa de avatares aún no está lista'
  const faltan = comp.modelosQueFaltan()
  const fallos: string[] = []
  for (const mx of faltan) {
    try {
      await cargarPersonaje(mx, { permitirRed: true })
    } catch (e) {
      fallos.push(`${mx}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await comp.alTerminarDeBajarModelos()
  return fallos.length ? `Fallaron: ${fallos.join('; ')}` : `Modelos pedidos: ${faltan.length}`
}
