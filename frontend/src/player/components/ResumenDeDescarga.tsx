import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  comprobarConLimite,
  megas,
  todoDescargado,
  type ComprobacionFinal,
} from '../offline/comprobacionFinal'
import { horaDelServidorAhora, leerMuestraDeReloj } from '../offline/relojDelServidor'
import { formatearFalta, parseLaunchAt } from './MissionLockScreen'

const TEXTOS = {
  es: {
    comprobando: 'Comprobando lo descargado…',
    todo: 'Todo descargado ✓',
    faltan: 'Falta por bajar',
    mapa: 'mapa',
    app: 'app',
    mision: 'misión',
    empieza: 'Empieza en',
  },
  gl: {
    comprobando: 'Comprobando o descargado…',
    todo: 'Todo descargado ✓',
    faltan: 'Falta por baixar',
    mapa: 'mapa',
    app: 'app',
    mision: 'misión',
    empieza: 'Empeza en',
  },
}

export type ResumenDeDescarga = {
  /** «Todo descargado ✓ · 136 MB», «Falta por bajar: mapa 12» o «Comprobando lo descargado…». */
  texto: string
  estado: 'comprobando' | 'completo' | 'incompleto'
  /** «Empieza en 12:03» si la misión tiene hora de inicio y aún no ha llegado. */
  cuentaAtras: string | null
}

/**
 * 31/10: al acabar la carga, la prueba de que está TODO en el móvil (mirando la caché, ver comprobacionFinal.ts):
 * «Todo descargado ✓ · N MB» o qué falta, y la cuenta atrás si la misión tiene hora de inicio.
 *
 * 7/11 (Óscar): ya no es una pastilla suelta bajo la barra («sobra, tendría que estar en la barra»): es un hook y
 * PantallaDeCarga lo pinta en la línea de la propia barra. `user` null = aún no toca (no se comprueba nada).
 */
export function useResumenDeDescarga(user: string | null): ResumenDeDescarga | null {
  const { locale } = useI18n()
  const tx = TEXTOS[locale]
  // undefined = comprobando; null = no contestó a tiempo (no se enseña nada).
  const [c, setC] = useState<ComprobacionFinal | null | undefined>(undefined)
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!user) return undefined
    let vivo = true
    setC(undefined)
    void comprobarConLimite(user).then((r) => vivo && setC(r))
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [user])

  if (!user || c === null) return null
  const inicio = c ? parseLaunchAt(c.inicio) : null
  const falta = inicio === null ? 0 : inicio - horaDelServidorAhora(leerMuestraDeReloj(), ahora).ms
  const faltan = c
    ? [
        c.teselasQueFaltan ? `${tx.mapa} ${c.teselasQueFaltan}` : '',
        c.paquetesQueFaltan ? `${tx.app} ${c.paquetesQueFaltan}` : '',
        c.hayMision ? '' : tx.mision,
      ].filter(Boolean)
    : []
  return {
    texto: !c
      ? tx.comprobando
      : todoDescargado(c)
        ? [tx.todo, megas(c.bytes)].filter(Boolean).join(' · ')
        : `${tx.faltan}: ${faltan.join(', ')}`,
    estado: !c ? 'comprobando' : todoDescargado(c) ? 'completo' : 'incompleto',
    cuentaAtras: falta > 0 ? `${tx.empieza} ${formatearFalta(falta)}` : null,
  }
}
