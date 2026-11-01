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
import { pizarra, RADIO_PIZARRA } from './PlayerShell'

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
  en: {
    comprobando: 'Checking the download…',
    todo: 'Everything downloaded ✓',
    faltan: 'Still missing',
    mapa: 'map',
    app: 'app',
    mision: 'mission',
    empieza: 'Starts in',
  },
}

/**
 * 31/10: al acabar la carga, la prueba de que está TODO en el móvil (mirando la caché, ver comprobacionFinal.ts):
 * «Todo descargado ✓ · N MB» o qué falta, y la cuenta atrás si la misión tiene hora de inicio.
 */
export function ResumenDeDescarga({ user }: { user: string }) {
  const { locale } = useI18n()
  const tx = TEXTOS[locale === 'gl' || locale === 'en' ? locale : 'es']
  // undefined = comprobando; null = no contestó a tiempo (no se enseña nada).
  const [c, setC] = useState<ComprobacionFinal | null | undefined>(undefined)
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    let vivo = true
    void comprobarConLimite(user).then((r) => vivo && setC(r))
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [user])

  const inicio = c ? parseLaunchAt(c.inicio) : null
  if (c === null) return null
  const falta = inicio === null ? 0 : inicio - horaDelServidorAhora(leerMuestraDeReloj(), ahora).ms
  const faltan = c
    ? [
        c.teselasQueFaltan ? `${tx.mapa} ${c.teselasQueFaltan}` : '',
        c.paquetesQueFaltan ? `${tx.app} ${c.paquetesQueFaltan}` : '',
        c.hayMision ? '' : tx.mision,
      ].filter(Boolean)
    : []

  return (
    <div
      role="status"
      data-saga-resumen-descarga={
        c ? (todoDescargado(c) ? 'completo' : 'incompleto') : 'comprobando'
      }
      style={{
        ...pizarra,
        borderRadius: RADIO_PIZARRA,
        padding: '10px 14px',
        display: 'grid',
        gap: 4,
        justifyItems: 'center',
        color: '#f8fafc',
        font: '700 14px/1.35 system-ui, sans-serif',
        marginBottom: 10,
      }}
    >
      <span>
        {!c
          ? tx.comprobando
          : todoDescargado(c)
            ? [tx.todo, megas(c.bytes)].filter(Boolean).join(' · ')
            : `${tx.faltan}: ${faltan.join(', ')}`}
      </span>
      {falta > 0 ? (
        <span style={{ fontWeight: 600, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
          {tx.empieza} {formatearFalta(falta)}
        </span>
      ) : null}
    </div>
  )
}
