import { useEffect, useState } from 'react'
import { fetchBuildInfo, type BuildInfoPayload } from './api'
import './build-info-badge.css'

type BuildInfoBadgeProps = {
  mode?: 'floating' | 'inline'
}

function shortCommit(commit?: string) {
  const clean = String(commit || '').trim()
  if (!clean || clean === 'unknown') return 'unknown'
  return clean.slice(0, 7)
}

export function BuildInfoBadge({ mode = 'floating' }: BuildInfoBadgeProps) {
  const [info, setInfo] = useState<BuildInfoPayload | null>(null)

  useEffect(() => {
    let cancelled = false

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

    return () => {
      cancelled = true
    }
  }, [])

  if (!info) return null

  const commit = shortCommit(info.commit)
  const version = info.version && info.version !== 'dev' ? info.version : 'dev'
  const builtAt = String(info.built_at || '').trim()

  return (
    <aside
      className={`saga-build-info saga-build-info--${mode}`}
      aria-label="Versión desplegada de SAGA Engine"
    >
      <span>SAGA</span>
      <strong>{commit}</strong>
      <small>{version}</small>
      {mode === 'inline' && builtAt ? <em>{builtAt}</em> : null}
    </aside>
  )
}
