import { useEffect, useMemo, useState } from 'react'
import { fetchPlayerGame } from '../shared/api'
import type { PlayerGamePayload, PlayerStage } from '../types/player'
import { PlayerShell } from './components/PlayerShell'
import { PlayerHud } from './components/PlayerHud'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: PlayerGamePayload }

function getUserFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('user') || 'PLAYER 1'
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

  if (state.status === 'loading' || state.status === 'idle') {
    return <ScreenFrame><StatusCard title="Loading player app" body="Fetching player mission payload..." /></ScreenFrame>
  }

  if (state.status === 'error') {
    return <ScreenFrame><StatusCard title="Player app error" body={state.message} /></ScreenFrame>
  }

if (state.status !== 'ready') {
  return <div>Loading...</div>;
}

const { payload } = state;
  const currentStage: PlayerStage | null =
    payload.finished ? null : (payload.stages?.[payload.level] || null)

  return (
    <ScreenFrame>
      <PlayerShell payload={payload} currentStage={currentStage} />

      <div style={mapPlaceholder}>
        <div style={mapLabel}>MAP AREA</div>
        <div style={mapCopy}>
          Next step: replace this placeholder with live map integration and player position state.
        </div>
      </div>

      <PlayerHud
        currentStage={currentStage}
        level={payload.level}
        finished={payload.finished}
      />
    </ScreenFrame>
  )
}

function ScreenFrame({ children }: { children: React.ReactNode }) {
  return (
    <main style={frame}>
      {children}
    </main>
  )
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
  padding: 16,
  fontFamily: 'system-ui, sans-serif',
  color: '#10231a',
}

const mapPlaceholder: React.CSSProperties = {
  minHeight: 280,
  borderRadius: 24,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'linear-gradient(180deg, rgba(231,239,228,.96), rgba(222,233,217,.96))',
  boxShadow: '0 18px 40px rgba(15,23,42,.06)',
  padding: 18,
  marginBottom: 16,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
}

const mapLabel: React.CSSProperties = {
  color: '#047857',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

const mapCopy: React.CSSProperties = {
  color: '#334155',
  fontSize: 14,
  lineHeight: 1.5,
  maxWidth: 480,
}

const statusCard: React.CSSProperties = {
  borderRadius: 20,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.9)',
  boxShadow: '0 18px 40px rgba(15,23,42,.06)',
  padding: 20,
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
}
