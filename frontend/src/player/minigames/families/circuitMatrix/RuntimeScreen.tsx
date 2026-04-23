import type { CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedCircuitMatrixMinigame } from '../../core/resolver'

interface Props {
  resolved: ResolvedCircuitMatrixMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

export function CircuitMatrixRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: Props) {
  const cfg = resolved.config

  return (
    <section style={wrap}>
      <div style={eyebrow}>CIRCUIT MATRIX</div>
      <div style={title}>{stage.title}</div>
      <div style={body}>
        Logic-family runtime mounted. This is the new fullscreen family shell where
        grid routing, switchboards, cryptex logic and sequence boards will live.
      </div>

      <div style={chipRow}>
        <span style={chip}>{cfg.objective?.replace(/_/g, ' ') || 'path restore'}</span>
        <span style={chip}>{`${cfg.grid_cols}×${cfg.grid_rows}`}</span>
        <span style={chip}>{`difficulty ${cfg.difficulty}`}</span>
      </div>

      <div style={panel}>
        <div style={panelLabel}>Runtime note</div>
        <div style={panelText}>
          {helperText || 'Family runtime active.'}
        </div>
      </div>

      <div style={actionRow}>
        <button
          type="button"
          style={primaryButton}
          disabled={submitting}
          onClick={() => void onWin()}
        >
          {submitting ? 'SUBMITTING…' : 'SIMULATE SUCCESS'}
        </button>
      </div>
    </section>
  )
}

const wrap: CSSProperties = {
  display: 'grid',
  gap: 12,
  borderRadius: 22,
  border: '1px solid rgba(255,255,255,.10)',
  background: 'rgba(255,255,255,.05)',
  padding: 14,
}

const eyebrow: CSSProperties = {
  color: '#86efac',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.16em',
}

const title: CSSProperties = {
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1.05,
}

const body: CSSProperties = {
  color: 'rgba(226,232,240,.84)',
  fontSize: 14,
  lineHeight: 1.5,
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const chip: CSSProperties = {
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  borderRadius: 999,
  background: 'rgba(59,130,246,.14)',
  border: '1px solid rgba(96,165,250,.22)',
  color: '#dbeafe',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const panel: CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: 12,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(15,23,42,.28)',
}

const panelLabel: CSSProperties = {
  color: 'rgba(255,255,255,.64)',
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

const panelText: CSSProperties = {
  color: '#f8fafc',
  fontSize: 13,
  lineHeight: 1.45,
}

const actionRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
}

const primaryButton: CSSProperties = {
  minHeight: 42,
  padding: '0 14px',
  borderRadius: 14,
  border: '1px solid rgba(34,197,94,.24)',
  background: 'linear-gradient(180deg, #22c55e, #16a34a)',
  color: '#ffffff',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}
