import { useEffect, useMemo, useState } from 'react'
import { fetchPlayerGame } from '../shared/api'
import type { PlayerGamePayload, PlayerStage } from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'
import { MapSurface } from './components/MapSurface'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload }

function getUserFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('user') || 'PLAYER 1'
}

function getCurrentStage(payload: PlayerGamePayload): PlayerStage | null {
  if (payload.finished) return null
  return payload.current_stage || payload.stages?.[payload.level] || null
}

export default function PlayerApp() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const user = useMemo(() => getUserFromUrl(), [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setState({ status: 'loading' })
        const payload = await fetchPlayerGame(user)

        if (!cancelled) {
          setState({ status: 'ready', payload })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown load error'

        if (!cancelled) {
          setState({ status: 'error', message })
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [user])

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <ScreenFrame>
        <StatusCard
          title="Loading player app"
          body="Fetching player mission payload..."
        />
      </ScreenFrame>
    )
  }

  if (state.status === 'error') {
    return (
      <ScreenFrame>
        <StatusCard
          title="Player app error"
          body={state.message}
        />
      </ScreenFrame>
    )
  }

  if (state.status !== 'ready') {
    return (
      <ScreenFrame>
        <StatusCard
          title="Player app state"
          body="Unexpected player state."
        />
      </ScreenFrame>
    )
  }

  const payload = state.payload
  const currentStage = getCurrentStage(payload)

  return (
    <ScreenFrame>
      <div style={layout}>
        <div style={topStack}>
          <PlayerShell payload={payload} currentStage={currentStage} />
          <MapSurface currentStage={currentStage} />
        </div>

        <PlayerHud
          currentStage={currentStage}
          level={payload.level}
          finished={payload.finished}
        />
      </div>
    </ScreenFrame>
  )
}

function ScreenFrame({ children }: { children: React.ReactNode }) {
  return <main style={frame}>{children}</main>
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <section style={statusCard}>
      <div style={statusTitle}>{title}</div>
      <div style={statusBody}>{body}</div>
    </section>
  )
}

const frame: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #eef3ec 0%, #e8efe6 48%, #e2ebdf 100%)',
  padding: 12,
  fontFamily: 'system-ui, sans-serif',
  color: '#10231a',
}

const layout: React.CSSProperties = {
  width: '100%',
  maxWidth: 980,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const topStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}


const statusCard: React.CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.9)',
  boxShadow: '0 18px 40px rgba(15,23,42,.06)',
  padding: 20,
  maxWidth: 760,
  margin: '0 auto',
}

const statusTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#0f172a',
}

const statusBody: React.CSSProperties = {
  fontSize: 14,
  color: '#475569',
  marginTop: 8,
  lineHeight: 1.5,
}
