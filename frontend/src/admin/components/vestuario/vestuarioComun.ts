import type { EnsayoDesbloqueables, PiezaDelCatalogo, ReglaVestuario } from '../../lib/adminApi'

/** El nombre visible de una clave (`item:casco` → «Casco vikingo»). */
export function nombreDePieza(catalogo: PiezaDelCatalogo[], clave: string): string {
  return catalogo.find((p) => p.clave === clave)?.nombre || clave
}

/**
 * El resumen de un ensayo para enseñarlo ANTES de guardar (decisión del usuario:
 * una regla nueva se aplica a lo ya jugado, mostrando antes a quién).
 */
export function resumenDeEnsayo(
  ensayo: EnsayoDesbloqueables,
  catalogo: PiezaDelCatalogo[]
): string {
  const lineas: string[] = []
  const reciben = Object.entries(ensayo.concederia || {})
  if (reciben.length) {
    lineas.push('Recibirían ahora:')
    for (const [, dato] of reciben) {
      lineas.push(
        `  • ${dato.display_name}: ${dato.claves.map((c) => nombreDePieza(catalogo, c)).join(', ')}${dato.sospecha ? ' ⚠' : ''}`
      )
    }
  } else {
    lineas.push('Nadie recibiría nada todavía.')
  }
  if (ensayo.sustituciones?.length) {
    lineas.push('', 'Se les cambiaría el avatar (llevan piezas que pasan a ganarse):')
    for (const cambio of ensayo.sustituciones) {
      lineas.push(
        `  • ${cambio.jugador}: pierde ${cambio.quita.map((c) => nombreDePieza(catalogo, c)).join(', ')}${cambio.despues ? '' : ' (sin hueco libre: se queda como está)'}`
      )
    }
  }
  return lineas.join('\n')
}

/** Un id corto y estable para una regla nueva. */
export function idDeRegla(regla: Omit<ReglaVestuario, 'id'>, existentes: ReglaVestuario[]): string {
  const c = regla.cuando
  const base = (c.tipo + (c.nodo ? `-${c.nodo}` : c.n ? `-${c.n}` : c.km ? `-${c.km}` : ''))
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, 32)
  let id = base
  let i = 2
  while (existentes.some((r) => r.id === id)) id = `${base}-${i++}`.slice(0, 40)
  return id
}

/** La regla de vestuario de un nodo concreto (la que edita el cajón del nodo). */
export function reglaDelNodo(reglas: ReglaVestuario[], nodeId: string): ReglaVestuario | undefined {
  return reglas.find((r) => r.cuando.tipo === 'nodo' && String(r.cuando.nodo) === String(nodeId))
}
