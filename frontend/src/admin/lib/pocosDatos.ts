import { useEffect, useState } from 'react'

/**
 * «Pocos datos» (24/11): sólo en ESTE móvil. Sin satélite (fondo liso con la ruta y los jugadores), sin fotos ni caras
 * (iniciales), sin desnivel ni nada de servicios de fuera, y el sondeo de la partida cada 45 s de base.
 *
 * Se enciende solo con el ahorro de datos del navegador o con 2G; lo que elija el organizador manda sobre eso.
 */
const CLAVE = 'saga:admin:pocos-datos'

type Conexion = { effectiveType?: string; saveData?: boolean }

/** Lo elegido en esta pestaña, por si el navegador no deja guardar (modo privado). */
let enMemoria: boolean | null = null

/** ¿Pide la red que se gaste poco? Ahorro de datos o 2G (Safari no lo dice: allí sólo a mano). */
export function redPidePocosDatos(c: Conexion | null | undefined): boolean {
  if (!c || typeof c !== 'object') return false
  return c.saveData === true || c.effectiveType === '2g' || c.effectiveType === 'slow-2g'
}

/** Lo que eligió el organizador o null si nunca tocó el interruptor. */
function elegido(): boolean | null {
  try {
    const v = globalThis.localStorage?.getItem(CLAVE)
    return v === '1' ? true : v === '0' ? false : enMemoria
  } catch {
    return enMemoria
  }
}

export function pocosDatosActivo(): boolean {
  const aMano = elegido()
  if (aMano !== null) return aMano
  const nav = (globalThis as { navigator?: { connection?: Conexion } }).navigator
  return redPidePocosDatos(nav?.connection)
}

/** ¿Está encendido sólo por la red (sin que nadie lo eligiera)? Para decirlo bajo el interruptor. */
export function pocosDatosPorLaRed(): boolean {
  return elegido() === null && pocosDatosActivo()
}

const oyentes = new Set<(activo: boolean) => void>()

export function fijarPocosDatos(activo: boolean) {
  enMemoria = activo
  try {
    globalThis.localStorage?.setItem(CLAVE, activo ? '1' : '0')
  } catch {
    // modo privado: vale para esta pestaña igual
  }
  oyentes.forEach((o) => o(activo))
}

export function usePocosDatos(): [boolean, (activo: boolean) => void] {
  const [activo, setActivo] = useState(pocosDatosActivo)
  useEffect(() => {
    oyentes.add(setActivo)
    return () => {
      oyentes.delete(setActivo)
    }
  }, [])
  return [activo, fijarPocosDatos]
}
