import { useState, useEffect, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMinigame } from '../../core/resolver'
import { useTeamStore } from '../../../store/useTeamStore'

export interface TeamRelayRuntimeScreenProps {
  resolved: ResolvedMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

export function TeamRelayRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: TeamRelayRuntimeScreenProps) {
  const [holding, setHolding] = useState(false)
  const { memberPositions } = useTeamStore()

  // Calcula cuántos miembros hay cerca del nodo.
  // En un caso real calcularíamos la distancia GPS, por ahora asumiremos
  // que los miembros que han actualizado posición en los últimos 5 mins están activos.
  const activeMembersCount = Object.values(memberPositions).filter(
    (pos) => Date.now() - pos.timestamp < 5 * 60 * 1000
  ).length

  // Umbral configurable
  const requiredMembers = 2
  const isReady = activeMembersCount >= requiredMembers

  const handleHoldStart = () => {
    if (isReady && !submitting) {
      setHolding(true)
    }
  }

  const handleHoldEnd = () => {
    setHolding(false)
  }

  useEffect(() => {
    let timeout: number
    if (holding) {
      timeout = window.setTimeout(() => {
        onWin()
      }, 1500) // 1.5s manteniéndolo presionado
    }
    return () => window.clearTimeout(timeout)
  }, [holding, onWin])

  return (
    <section style={container}>
      <div style={title}>Relevo de Equipo</div>
      <p style={description}>
        {helperText || 'Esperando a que todos los miembros del equipo lleguen al punto...'}
      </p>

      <div style={statusBox}>
        <div style={statusText}>Miembros cercanos:</div>
        <div style={statusCount}>
          {activeMembersCount} / {requiredMembers}
        </div>
      </div>

      <button
        style={isReady ? holdButtonReady : holdButtonDisabled}
        onPointerDown={handleHoldStart}
        onPointerUp={handleHoldEnd}
        onPointerLeave={handleHoldEnd}
        disabled={!isReady || submitting}
      >
        {submitting
          ? 'Registrando...'
          : isReady
            ? holding
              ? 'Mantén presionado...'
              : 'Validar Relevo'
            : 'Esperando equipo'}
      </button>
    </section>
  )
}

const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: 24,
  background: 'rgba(15, 23, 42, 0.6)',
  borderRadius: 16,
  border: '1px solid rgba(255, 255, 255, 0.1)',
}

const title: CSSProperties = {
  fontSize: 22,
  fontWeight: 'bold',
  color: '#fff',
  marginBottom: 8,
}

const description: CSSProperties = {
  fontSize: 14,
  color: 'rgba(255, 255, 255, 0.7)',
  textAlign: 'center',
  marginBottom: 24,
}

const statusBox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'rgba(255, 255, 255, 0.05)',
  padding: '12px 24px',
  borderRadius: 12,
  width: '100%',
  marginBottom: 24,
}

const statusText: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
}

const statusCount: CSSProperties = {
  color: '#38bdf8',
  fontSize: 18,
  fontWeight: 'bold',
}

const holdButtonReady: CSSProperties = {
  width: '100%',
  padding: 16,
  borderRadius: 12,
  background: '#3b82f6',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: 16,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.2s',
}

const holdButtonDisabled: CSSProperties = {
  ...holdButtonReady,
  background: '#475569',
  color: '#94a3b8',
  cursor: 'not-allowed',
}
