import { useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { fijarVersionDelMapa3d, tiempoMaximoDelLote, TESELAS_POR_LOTE, urlsDeLotesDelPlan } from '../../player/offline/mapTileCache'
import type { PlayerStage } from '../../types/player'
import { httpErrorFrom } from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'

/** Lo acordado con infraestructura: como mucho 2 peticiones a la vez. */
const A_LA_VEZ = 2

type InfoPrecalentar = {
  libre_mb: number | null
  libre_minimo_mb: number
  poco_disco: boolean
  dem_webp_mb: number
  dem_webp_tope_mb: number
  mapa3d_version: string
  relieve_version?: string
  teselas_version?: string
  stages: PlayerStage[]
}

type Progreso = {
  hechos: number
  total: number
  bytes: number
  estados: Record<string, number>
  incompletos: number
  errores: number
  ultimoError: string
}

/** 17:30-18:35 en Madrid (VIKINGO y el post de las 18:00). El servidor lo vuelve a mirar. */
export function enVedaDePrecalentar(fecha = new Date()): boolean {
  const partes = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value)
  const minutos = valor('hour') * 60 + valor('minute')
  return minutos >= 17 * 60 + 30 && minutos < 18 * 60 + 35
}

const rellenar = (texto: string, valores: Record<string, string | number>) =>
  texto.replace(/\{(\w+)\}/g, (_, clave: string) => String(valores[clave] ?? ''))

/**
 * 22/11: «Precalentar mapa para la partida». Pide los MISMOS lotes GET que un móvil sin nada guardado
 * (`urlsDeLotesDelPlan`, la misma función con la que el móvil arma sus URL), con URL relativas: van por el dominio
 * público, como las de los jugadores, y Cloudflare guarda cada lote por su URL.
 *
 * `cache: 'no-store'`: el cuerpo no se queda en la caché del navegador del panel (~100 MB) y cada vuelta llega de
 * verdad a Cloudflare, así que el `cf-cache-status` que se cuenta es el suyo. El navegador añade entonces
 * `Cache-Control: no-cache` a la petición; Cloudflare no hace caso de la cabecera de la petición para servir de su
 * caché, y aunque se lo hiciese, la respuesta se guarda igual (no es `no-store`) y los móviles —que piden sin ella—
 * la encuentran. Si la segunda vuelta sigue dando todo MISS, es la regla de Cloudflare, no esto.
 * Sin credenciales: el GET del lote no pide la clave de misión (main.API_SIN_CLAVE_GET_PREFIJO) y, sin la cookie del
 * panel, el servidor aplica el filtro de zona de un móvil (`es_panel` falso): el lote sale igual que el suyo.
 * Completo o no lo dice `X-Saga-Lote` (el Cache-Control del lote completo es `no-store` para el navegador).
 */
export default function PrecalentarMapa() {
  const { t } = useI18n()
  const [info, setInfo] = useState<InfoPrecalentar | null>(null)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const control = useRef<AbortController | null>(null)

  async function pedirLote(url: string, senal: AbortSignal) {
    const propio = new AbortController()
    const soltar = () => propio.abort()
    senal.addEventListener('abort', soltar)
    const reloj = window.setTimeout(soltar, 2 * tiempoMaximoDelLote(TESELAS_POR_LOTE))
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit', signal: propio.signal })
      const cuerpo = await res.arrayBuffer()
      return {
        status: res.status,
        cf: res.headers.get('cf-cache-status') || 'none',
        completo: res.headers.get('x-saga-lote') === 'completo',
        bytes: cuerpo.byteLength,
      }
    } finally {
      window.clearTimeout(reloj)
      senal.removeEventListener('abort', soltar)
    }
  }

  async function precalentar() {
    setAviso(null)
    if (enVedaDePrecalentar()) {
      setAviso(t('admin.settingsPanel.prewarmBlocked'))
      return
    }
    setEnCurso(true)
    const cancelar = new AbortController()
    control.current = cancelar
    try {
      const res = await fetch('/api/admin/mapa/precalentar', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (res.status === 409) {
        setAviso(t('admin.settingsPanel.prewarmBlocked'))
        return
      }
      if (!res.ok) throw await httpErrorFrom(res)
      const datos = (await res.json()) as InfoPrecalentar
      setInfo(datos)
      if (
        datos.poco_disco &&
        !window.confirm(
          rellenar(t('admin.settingsPanel.prewarmLowDisk'), {
            libre: datos.libre_mb ?? '?',
            minimo: datos.libre_minimo_mb,
            dem: datos.dem_webp_mb,
            tope: datos.dem_webp_tope_mb,
          })
        )
      )
        return

      // La versión del mapa 3D va en las URL del relieve y en la versión del lote: la misma que fija el móvil.
      // 22/11: también la del relieve y la de las teselas, que entran en las URL de los lotes (ver versionDeLotes).
      fijarVersionDelMapa3d(datos.mapa3d_version, { relieve: datos.relieve_version, teselas: datos.teselas_version })
      const urls = urlsDeLotesDelPlan(datos.stages || [])
      if (!urls.length) {
        setAviso(t('admin.settingsPanel.prewarmNoRoute'))
        return
      }

      const p: Progreso = { hechos: 0, total: urls.length, bytes: 0, estados: {}, incompletos: 0, errores: 0, ultimoError: '' }
      setProgreso({ ...p })
      let siguiente = 0
      const trabajador = async () => {
        while (siguiente < urls.length && !cancelar.signal.aborted) {
          const url = urls[siguiente]
          siguiente += 1
          // Un 429/5xx o un corte: una segunda vez tras una pausa; si no, se cuenta como fallo.
          for (let intento = 0; intento < 2 && !cancelar.signal.aborted; intento += 1) {
            try {
              const r = await pedirLote(url, cancelar.signal)
              if (r.status === 200) {
                p.bytes += r.bytes
                p.estados[r.cf] = (p.estados[r.cf] || 0) + 1
                if (!r.completo) p.incompletos += 1
                break
              }
              if (intento === 1) {
                p.errores += 1
                p.ultimoError = `HTTP ${r.status}`
              }
            } catch (fallo) {
              if (cancelar.signal.aborted) break
              if (intento === 1) {
                p.errores += 1
                p.ultimoError = describeAdminError(fallo)
              }
            }
            if (intento === 0) await new Promise((listo) => window.setTimeout(listo, 5000))
          }
          p.hechos += 1
          setProgreso({ ...p, estados: { ...p.estados } })
        }
      }
      await Promise.all(Array.from({ length: A_LA_VEZ }, () => trabajador()))
      setAviso(cancelar.signal.aborted ? t('admin.settingsPanel.prewarmCancelled') : t('admin.settingsPanel.prewarmDone'))
    } catch (fallo) {
      setAviso(rellenar(t('admin.settingsPanel.prewarmFailed'), { error: describeAdminError(fallo) }))
    } finally {
      control.current = null
      setEnCurso(false)
    }
  }

  const estados = progreso
    ? Object.entries(progreso.estados)
        .map(([clave, n]) => `${clave.toUpperCase()} ${n}`)
        .join(' · ') || '—'
    : ''

  return (
    <section className="admin-settings-section-modern">
      <div className="admin-settings-section-head">
        <strong style={{ color: 'var(--s-acento)' }}>{t('admin.settingsPanel.prewarmTitle')}</strong>
        <span>{t('admin.settingsPanel.prewarmHelp')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn-modern" disabled={enCurso} onClick={precalentar}>
            {t('admin.settingsPanel.prewarmStart')}
          </button>
          {enCurso ? (
            <button type="button" className="admin-btn-modern" onClick={() => control.current?.abort()}>
              {t('admin.settingsPanel.prewarmCancel')}
            </button>
          ) : null}
        </div>
        {info ? (
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {rellenar(t('admin.settingsPanel.prewarmDisk'), {
              libre: info.libre_mb ?? '?',
              dem: info.dem_webp_mb,
              tope: info.dem_webp_tope_mb,
            })}
          </span>
        ) : null}
        {progreso ? (
          <>
            <span style={{ fontSize: 12 }}>
              {rellenar(t('admin.settingsPanel.prewarmProgress'), {
                hechos: progreso.hechos,
                total: progreso.total,
                mb: (progreso.bytes / 1048576).toFixed(1),
              })}
            </span>
            <span style={{ fontSize: 12 }}>{rellenar(t('admin.settingsPanel.prewarmCache'), { estados })}</span>
            {progreso.incompletos ? (
              <span style={{ fontSize: 12, color: 'var(--s-aviso)' }}>
                {rellenar(t('admin.settingsPanel.prewarmIncomplete'), { n: progreso.incompletos })}
              </span>
            ) : null}
            {progreso.errores ? (
              <span style={{ fontSize: 12, color: 'var(--s-error)' }}>
                {rellenar(t('admin.settingsPanel.prewarmErrors'), { n: progreso.errores, ultimo: progreso.ultimoError })}
              </span>
            ) : null}
          </>
        ) : null}
        {aviso ? <span style={{ fontSize: 12 }}>{aviso}</span> : null}
      </div>
    </section>
  )
}
