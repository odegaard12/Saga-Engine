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

function MapSurface({ currentStage }: { currentStage: PlayerStage | null }) {
  return (
    <section style={mapCard}>
      <div style={mapTopRow}>
        <div>
          <div style={mapLabel}>MAP SURFACE</div>
          <div style={mapTitle}>{currentStage?.title || 'Awaiting node'}</div>
        </div>

        <div style={mapBadge}>Leaflet next</div>
      </div>

      <div style={mapViewport}>
        <div style={mapCenterCard}>
          <div style={mapCenterTitle}>Player map foundation</div>
          <div style={mapCenterCopy}>
            This container is ready to be replaced by live map rendering,
            player position, GPS state, and debug simulation.
          </div>
        </div>
      </div>

      <div style={mapFooter}>
        <span style={mapFooterItem}>
          {typeof currentStage?.lat === 'number'
            ? `Lat ${currentStage.lat.toFixed(5)}`
            : 'Lat ---'}
        </span>
        <span style={mapFooterItem}>
          {typeof currentStage?.lon === 'number'
            ? `Lon ${currentStage.lon.toFixed(5)}`
            : 'Lon ---'}
        </span>
        <span style={mapFooterItem}>
          {typeof currentStage?.radius === 'number'
            ? `Radius ${currentStage.radius} m`
            : 'Radius ---'}
        </span>
      </div>
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

const mapCard: React.CSSProperties = {
  borderRadius: 24,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,.88), rgba(247,250,246,.94))',
  boxShadow: '0 18px 40px rgba(15,23,42,.08)',
  padding: 14,
}

const mapTopRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 12,
}

const mapLabel: React.CSSProperties = {
  color: '#047857',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

const mapTitle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.05,
  marginTop: 6,
}

const mapBadge: React.CSSProperties = {
  minHeight: 34,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid rgba(59,130,246,.14)',
  background: 'rgba(219,234,254,.88)',
  color: '#1e3a8a',
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const mapViewport: React.CSSProperties = {
  minHeight: 320,
  borderRadius: 20,
  border: '1px solid rgba(15,23,42,.06)',
  background: 'linear-gradient(180deg, rgba(231,239,228,.96), rgba(222,233,217,.96))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
}

const mapCenterCard: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  borderRadius: 18,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(255,255,255,.78)',
  backdropFilter: 'blur(6px)',
  padding: 16,
  textAlign: 'center',
}

const mapCenterTitle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: 18,
  fontWeight: 800,
}

const mapCenterCopy: React.CSSProperties = {
  color: '#475569',
  fontSize: 14,
  lineHeight: 1.5,
  marginTop: 8,
}

const mapFooter: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 12,
}

const mapFooterItem: React.CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.96)',
  color: '#334155',
  fontSize: 11,
  fontWeight: 700,
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
