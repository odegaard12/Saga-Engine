/**
 * Enterarse en segundos de lo que el organizador cambia desde el panel (24/11).
 *
 * El servidor lleva una revisión por jugador (backend/app/runtime/cambios_del_jugador.py) que viaja en cada latido
 * (`rev`) y en una escucha larga (`GET /api/jugador/cambios`) que sólo corre con la app a la vista. La escucha no
 * despierta la radio por su cuenta: el latido del jugador la suelta con un 204 y aquí se renueva en el acto. Sin red,
 * abortada o con la pantalla apagada se para, y la vuelve a armar el siguiente latido bueno (nada de reintentos a
 * ciegas en un valle sin cobertura). Lo que hace al cambiar lo decide quien la crea (`alCambiar`); aquí no se toca la
 * partida ni la cola, así que no puede aplicar nada dos veces.
 */

export type RespuestaDeCambios = { rev?: string; reintentar_s?: number }

export type EscuchaDeCambios = {
  /** Tras cada latido bueno, con su `rev`: avisa si cambió y (re)arma la escucha. */
  trasLatido: (rev: unknown) => void
  /** Pantalla apagada o pestaña oculta: se corta la que haya en vuelo. */
  parar: () => void
  /** Al desmontar. */
  cerrar: () => void
  /** Para las pruebas. */
  conocida: () => string | null
}

export function crearEscuchaDeCambios(op: {
  esperar: (desde: string, signal: AbortSignal) => Promise<RespuestaDeCambios>
  alCambiar: (rev: string, origen: 'escucha' | 'latido') => void
  puedeEscuchar: () => boolean
  /** Por encima de lo que sostiene el servidor (55 s): una respuesta que no llega no deja la escucha colgada. */
  corteMs?: number
  dormir?: (ms: number) => Promise<void>
}): EscuchaDeCambios {
  const corteMs = op.corteMs ?? 70_000
  const dormir = op.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let conocida: string | null = null
  let control: AbortController | null = null
  let corriendo = false
  let cerrada = false

  async function bucle() {
    corriendo = true
    try {
      while (!cerrada && conocida !== null && op.puedeEscuchar()) {
        const este = new AbortController()
        control = este
        const corte = setTimeout(() => este.abort(), corteMs)
        let r: RespuestaDeCambios | null
        try {
          r = await op.esperar(conocida, este.signal)
        } catch {
          r = null
        } finally {
          clearTimeout(corte)
          if (control === este) control = null
        }
        if (r === null || cerrada) return
        if (typeof r.rev === 'string' && r.rev !== conocida) {
          conocida = r.rev
          op.alCambiar(r.rev, 'escucha')
        } else if (r.reintentar_s) {
          await dormir(Math.min(60, Math.max(1, r.reintentar_s)) * 1000)
        }
      }
    } finally {
      corriendo = false
    }
  }

  return {
    trasLatido(rev) {
      if (typeof rev === 'string' && rev) {
        if (conocida !== null && rev !== conocida) {
          conocida = rev
          op.alCambiar(rev, 'latido')
        } else {
          conocida = rev
        }
      }
      if (!corriendo && !cerrada) void bucle()
    },
    parar() {
      control?.abort()
    },
    cerrar() {
      cerrada = true
      control?.abort()
    },
    conocida: () => conocida,
  }
}

/** Lo que el jugador VE de su partida: nodo, terminada, tiempo y mochila. Si no cambia, no hay aviso. */
export function huellaVisible(args: {
  nivel?: unknown
  terminada?: unknown
  tiempoMs?: unknown
  mochila?: { item_id?: unknown; quantity?: unknown; state?: unknown }[]
}): string {
  const mochila = (args.mochila || [])
    .map((o) => `${String(o?.item_id ?? '')}:${Number(o?.quantity) || 1}:${String(o?.state ?? '')}`)
    .sort()
    .join(',')
  return [Number(args.nivel) || 0, Boolean(args.terminada), Number(args.tiempoMs) || 0, mochila].join('|')
}

/** Freno del chip: una vez, y no otra antes de `FRENO_DEL_AVISO_MS` (varias pulsaciones seguidas = un aviso). */
export const FRENO_DEL_AVISO_MS = 30_000

export function debeAvisar(antes: string, despues: string, ultimoAvisoMs: number, ahoraMs: number): boolean {
  return antes !== despues && ahoraMs - ultimoAvisoMs >= FRENO_DEL_AVISO_MS
}

/** Lo escucha el chip de cobertura (components/ChipDeCobertura.tsx). */
export const EVENTO_AJUSTE_DEL_PANEL = 'saga:ajuste-del-panel'
