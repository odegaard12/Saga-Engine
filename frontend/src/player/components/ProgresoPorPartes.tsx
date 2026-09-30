import type { CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  PARTES,
  porcentajeDeParte,
  type EstadoDeCarga,
  type MotivoDeParte,
  type ParteId,
  type ProgresoDeParte,
} from '../offline/motorDeCarga'

/**
 * Una barra por parte: App, Misión y Mapa.
 *
 * Es lo que se ve en la pantalla de carga cuando hay algo que bajar, y también
 * dentro de «Prepararse»: la misma comprobación, el mismo progreso. Cada fila
 * dice qué parte es, si está al día, si baja algo (y por qué) o si falló.
 */

const TEXTOS = {
  es: {
    partes: { app: 'App', mision: 'Misión', mapa: 'Mapa' } as Record<ParteId, string>,
    alDia: 'Al día',
    comprobando: 'Comprobando…',
    esperando: 'Esperando…',
    listo: 'Listo',
    fallo: 'No se pudo completar',
    sinEspacio: 'Sin espacio en el móvil',
    motivos: {
      primera_vez: 'Primera vez en este móvil',
      version_nueva: 'Hay una versión nueva',
      mision_cambiada: 'La misión ha cambiado',
      ruta_cambiada: 'La ruta ha cambiado',
      incompleto: 'Estaba incompleto',
    } as Record<MotivoDeParte, string>,
  },
  gl: {
    partes: { app: 'App', mision: 'Misión', mapa: 'Mapa' } as Record<ParteId, string>,
    alDia: 'Ao día',
    comprobando: 'Comprobando…',
    esperando: 'Agardando…',
    listo: 'Listo',
    fallo: 'Non se puido completar',
    sinEspacio: 'Sen espazo no móbil',
    motivos: {
      primera_vez: 'Primeira vez neste móbil',
      version_nueva: 'Hai unha versión nova',
      mision_cambiada: 'A misión cambiou',
      ruta_cambiada: 'A ruta cambiou',
      incompleto: 'Estaba incompleto',
    } as Record<MotivoDeParte, string>,
  },
}

type Textos = (typeof TEXTOS)['es']

function glifo(parte: ProgresoDeParte): { texto: string; color: string } {
  switch (parte.estado) {
    case 'al_dia':
    case 'listo':
      return { texto: '✓', color: 'rgb(var(--theme-done))' }
    case 'error':
      return { texto: '!', color: '#facc15' }
    case 'comprobando':
      return { texto: '…', color: 'var(--theme-primary)' }
    default:
      return { texto: '•', color: 'var(--theme-primary)' }
  }
}

/** La línea pequeña bajo la barra: qué pasa con esta parte. */
export function textoDeParte(parte: ProgresoDeParte, tx: Textos): string {
  switch (parte.estado) {
    case 'al_dia':
      return parte.detalle || tx.alDia
    case 'listo':
      return parte.detalle || tx.listo
    case 'error':
      return parte.error || tx.fallo
    case 'comprobando':
      return tx.comprobando
    case 'pendiente': {
      const motivo = parte.motivo ? tx.motivos[parte.motivo] : ''
      return [motivo, parte.detalle].filter(Boolean).join(' · ') || tx.esperando
    }
    default:
      return parte.detalle || tx.comprobando
  }
}

interface Props {
  partes: EstadoDeCarga
}

export function ProgresoPorPartes({ partes }: Props) {
  const { locale } = useI18n()
  const tx = locale === 'gl' ? TEXTOS.gl : TEXTOS.es

  return (
    <div style={lista} role="status" aria-live="polite" data-saga-anim="carga-partes">
      {PARTES.map((id) => {
        const parte = partes[id]
        const g = glifo(parte)
        const pct = porcentajeDeParte(parte)
        const enMarcha = parte.estado === 'descargando' || parte.estado === 'comprobando'
        const sinNumero = pct === null
        const hecha = parte.estado === 'al_dia' || parte.estado === 'listo'

        return (
          <div key={id} style={fila} data-saga-parte={id} data-estado={parte.estado}>
            <div style={cabecera}>
              <span style={{ ...glifoEstilo, color: g.color }}>{g.texto}</span>
              <span style={{ ...nombre, color: hecha ? 'rgb(var(--theme-line))' : '#f8fafc' }}>
                {tx.partes[id]}
              </span>
              {pct !== null && !hecha ? (
                // key={pct}: mismo motivo que en SplashScreen: sin ella el número
                // se quedaba clavado en el primer valor tras actualizarse.
                <span key={pct} style={numero}>
                  {pct}%
                </span>
              ) : null}
            </div>

            <div style={pista}>
              <div
                style={{
                  ...relleno,
                  width: hecha ? '100%' : sinNumero ? '38%' : `${pct}%`,
                  animation: sinNumero && enMarcha ? 'sagaCargaDesliza 1.4s infinite ease-in-out' : 'none',
                  background:
                    parte.estado === 'error'
                      ? '#facc15'
                      : 'linear-gradient(90deg, var(--theme-primary-hover), var(--theme-primary))',
                  opacity: sinNumero && !enMarcha && !hecha ? 0.25 : 1,
                }}
              />
            </div>

            <div style={{ ...detalleEstilo, color: parte.estado === 'error' ? '#fde68a' : undefined }}>
              {parte.sinEspacio ? tx.sinEspacio : textoDeParte(parte, tx)}
            </div>
          </div>
        )
      })}

      <style>
        {`
          @keyframes sagaCargaDesliza {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(320%); }
          }
        `}
      </style>
    </div>
  )
}

const lista: CSSProperties = {
  width: 'min(86vw, 300px)',
  display: 'grid',
  gap: 16,
}

const fila: CSSProperties = { display: 'grid', gap: 6 }

const cabecera: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }

const glifoEstilo: CSSProperties = { width: 18, textAlign: 'center', fontSize: 14, fontWeight: 900 }

const nombre: CSSProperties = { flex: 1, fontSize: 13, fontWeight: 700 }

const numero: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: 'rgb(var(--theme-line))',
  fontVariantNumeric: 'tabular-nums',
}

const pista: CSSProperties = {
  marginLeft: 28,
  height: 4,
  background: 'rgba(255,255,255,.09)',
  borderRadius: 'var(--theme-radius-pill)',
  overflow: 'hidden',
}

const relleno: CSSProperties = {
  height: '100%',
  borderRadius: 'var(--theme-radius-pill)',
  transition: 'width .35s cubic-bezier(.22,1,.36,1)',
  boxShadow: '0 0 14px var(--theme-glow)',
}

const detalleEstilo: CSSProperties = {
  marginLeft: 28,
  fontSize: 11.5,
  lineHeight: 1.4,
  color: 'rgba(var(--theme-line), .7)',
  fontWeight: 600,
}
