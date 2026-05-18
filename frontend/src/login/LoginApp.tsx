import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchPublicConfig } from '../shared/api'
import type { PlayerProfile, PublicConfig } from '../types/player'
import LoginBackground from './LoginBackground'
import BrandHero from './BrandHero'
import ProfileCard from './ProfileCard'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: PublicConfig }

function normalizeProfiles(config: PublicConfig): PlayerProfile[] {
  if (Array.isArray(config.player_profiles) && config.player_profiles.length > 0) {
    return config.player_profiles
  }
  return (config.players || []).map((player) => ({
    id: player, display_name: player,
    mode: 'solo' as const, members: [player], status: 'active',
  }))
}

function looksPlaceholder(v?: string) {
  const t = String(v || '').trim()
  return !t || t.toUpperCase().startsWith('PUT ')
}

function resolveCopy(config: PublicConfig) {
  return {
    title:    !looksPlaceholder(config.site_name)   ? config.site_name!   : 'SAGA',
    subtitle: !looksPlaceholder(config.story_title) ? config.story_title! : '',
    body:     !looksPlaceholder(config.story_text)  ? config.story_text!  : 'Elige jugador para continuar.',
  }
}

export default function LoginApp() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchPublicConfig()
      .then(config => { if (!cancelled) setState({ status: 'ready', config }) })
      .catch(err   => { if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Error' }) })
    return () => { cancelled = true }
  }, [])

  const profiles = useMemo(() => {
    if (state.status !== 'ready') return []
    return normalizeProfiles(state.config)
  }, [state])

  function handleEnter(id: string) {
    setLoadingId(id)
    setTimeout(() => {
      window.location.href = `/player/${encodeURIComponent(id)}`
    }, 320)
  }

  const copy = state.status === 'ready'
    ? resolveCopy(state.config)
    : { title: 'SAGA', subtitle: '', body: '' }

  return (
    <main style={page}>
      <LoginBackground />
      <div style={shell}>
        {state.status === 'error' ? (
          <div style={errorBox}>
            <span style={errorIcon}>⚠</span>
            <p style={errorMsg}>{state.message}</p>
          </div>
        ) : (
          <>
            <BrandHero
              title={copy.title}
              subtitle={copy.subtitle}
              body={state.status === 'loading' ? '···' : copy.body}
              onAdminClick={() => { window.location.href = '/admin' }}
            />
            {state.status === 'ready' && (
              <section style={list}>
                {profiles.map((p, i) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    index={i}
                    onEnter={handleEnter}
                    isLoading={loadingId === p.id}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

const page: CSSProperties = {
  minHeight: '100dvh', position: 'relative',
  background: 'linear-gradient(160deg, var(--saga-bg) 0%, #0a1a14 50%, var(--saga-bg) 100%)',
  overflowX: 'hidden',
}
const shell: CSSProperties = {
  position: 'relative', zIndex: 1,
  width: 'min(100%, 400px)', margin: '0 auto',
  padding: 'max(var(--safe-top),var(--s8)) var(--s4) max(var(--safe-bottom),var(--s8))',
  display: 'grid', gap: 'var(--s3)',
}
const list: CSSProperties = { display: 'grid', gap: 'var(--s2)' }
const errorBox: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 'var(--s3)', padding: 'var(--s8)',
  background: 'var(--saga-danger-dim)', border: '1px solid var(--saga-danger)',
  borderRadius: 'var(--r-lg)', textAlign: 'center',
}
const errorIcon: CSSProperties = { fontSize: 32 }
const errorMsg: CSSProperties = { color: 'var(--saga-text)', fontSize: 14 }
