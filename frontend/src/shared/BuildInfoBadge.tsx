import { useEffect, useState } from 'react'
import { fetchBuildInfo, type BuildInfoPayload } from './api'
import './build-info-badge.css'

type BuildInfoBadgeProps = {
  mode?: 'floating' | 'inline'
}

function shortCommit(commit?: string) {
  const clean = String(commit || '').trim()
  if (!clean || clean === 'unknown') return null
  return clean.slice(0, 7)
}

function formatDeployTime(builtAt?: string): string {
  const raw = String(builtAt || '').trim()
  if (!raw) return ''

  // Try to parse – built_at may be ISO8601 or a unix timestamp
  let date: Date | null = null
  const asNum = Number(raw)
  if (!isNaN(asNum) && asNum > 0) {
    // Unix seconds or milliseconds
    date = new Date(asNum > 1e10 ? asNum : asNum * 1000)
  } else {
    date = new Date(raw)
  }

  if (!date || isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  // Show relative time for very recent deploys
  if (diffMins < 2) return 'ahora mismo'
  if (diffMins < 60) return `hace ${diffMins}m`
  if (diffHours < 24) return `hoy ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
  if (diffDays === 1) return `ayer ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
  if (diffDays < 7) return `${date.toLocaleDateString('es-ES', { weekday: 'short' })} ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`

  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function BuildInfoBadge({ mode = 'floating' }: BuildInfoBadgeProps) {
  const [info, setInfo] = useState<BuildInfoPayload | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false

    function load() {
      fetchBuildInfo()
        .then((payload) => {
          if (!cancelled) setInfo(payload)
        })
        .catch(() => {
          if (!cancelled) {
            setInfo({
              status: 'error',
              version: 'dev',
              commit: 'unknown',
              built_at: '',
            })
          }
        })
    }

    load()
    // Refresh every 5 minutes to reflect new deploys
    const interval = window.setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Tick every minute to keep relative time fresh
  useEffect(() => {
    const t = window.setInterval(() => setTick((v) => v + 1), 60000)
    return () => clearInterval(t)
  }, [])

  if (!info) return null

  const commit = shortCommit(info.commit)
  const version = info.version && info.version !== 'dev' ? `v${info.version}` : null
  const deployTime = formatDeployTime(info.built_at)

  if (mode === 'inline') {
    return (
      <aside
        className="saga-build-info saga-build-info--inline"
        aria-label="Versión desplegada de SAGA Engine"
        data-tick={tick}
      >
        <span>🚀</span>
        {version ? <strong>{version}</strong> : <strong>dev</strong>}
        {commit ? <code style={{ fontSize: '0.65rem', color: 'rgba(186,230,253,0.8)', fontFamily: 'monospace' }}>{commit}</code> : null}
        {deployTime ? <em>· {deployTime}</em> : null}
      </aside>
    )
  }

  // floating mode (minimal)
  return (
    <aside
      className="saga-build-info saga-build-info--floating"
      aria-label="Versión desplegada de SAGA Engine"
      data-tick={tick}
    >
      <span>SAGA</span>
      {version ? <strong>{version}</strong> : null}
      {commit ? <strong>{commit}</strong> : null}
      {deployTime ? <small>{deployTime}</small> : null}
    </aside>
  )
}
