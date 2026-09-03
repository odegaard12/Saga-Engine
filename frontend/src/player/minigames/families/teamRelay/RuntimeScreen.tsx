import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMinigame } from '../../core/resolver'
import { usePlayerStore } from '../../../store/usePlayerStore'
import { getDistanceMeters } from '../../../utils/geo'

export interface TeamRelayRuntimeScreenProps {
  resolved: ResolvedMinigame
  stage: PlayerStage
  helperText: string
  submitting: boolean
  onWin: () => Promise<void>
}

/**
 * Relevo de Equipo: hacen falta dos o más juntos en el mismo punto.
 *
 * Antes leía `useTeamStore.ts` -un intento con Yjs que sólo persistía en el
 * propio móvil (`IndexeddbPersistence`), sin ningún transporte entre
 * dispositivos-: cada jugador sólo veía sus propios cambios, así que
 * `activeMembersCount` nunca pasaba de cero por vías legítimas. El catálogo
 * lo daba por "listo" y no lo estaba.
 *
 * Ahora lee del store compartido -`teamProfiles`, lo que ya trae el latido
 * cada pocos segundos con la posición de todo el grupo- y calcula la
 * distancia real al nodo con la misma fórmula que usa el mapa. Nada nuevo
 * que pedir: mismo camino, misma tolerancia a cobertura mala, que ya está
 * hecho y probado.
 */
export function TeamRelayRuntimeScreen({
  resolved,
  stage,
  helperText,
  submitting,
  onWin,
}: TeamRelayRuntimeScreenProps) {
  const [holding, setHolding] = useState(false)
  const teamProfiles = usePlayerStore((s) => s.teamProfiles)

  const cercanos = useMemo(() => {
    if (stage.lat == null || stage.lon == null) return []

    const radio = Number(stage.radius) > 0 ? Number(stage.radius) : 50

    return teamProfiles
      .filter((p) => !p.is_self)
      // "live" es un latido de menos de 3 minutos (HEARTBEAT_STALE_SECONDS
      // en el servidor): más viejo que eso no dice dónde está AHORA.
      .filter((p) => p.presence === 'live')
      .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
      .map((p) => ({
        ...p,
        distancia: getDistanceMeters(
          { lat: stage.lat, lon: stage.lon },
          { lat: p.lat as number, lon: p.lon as number }
        ),
      }))
      .filter((p) => p.distancia <= radio)
      .sort((a, b) => a.distancia - b.distancia)
  }, [teamProfiles, stage.lat, stage.lon, stage.radius])

  // Cuántos compañeros hacen falta lo decide quien monta la misión
  // (config.required_members, editable en el admin) -no un mínimo fijo del
  // motor-. 2 es el valor por defecto de siempre, para las misiones
  // guardadas antes de que este campo existiera. team_relay es un game_id
  // dentro de la familia signal_hunt, no una familia propia -de ahí el
  // cast, igual que hace FamilyRuntimeHost con game_id.
  const requiredMembersConfig = Number(
    (resolved.config as { required_members?: number }).required_members
  )
  const requiredMembers = requiredMembersConfig > 0 ? requiredMembersConfig : 2
  const activeMembersCount = cercanos.length
  const isReady = activeMembersCount >= requiredMembers

  const handleHoldStart = () => {
    if (isReady && !submitting) {
      setHolding(true)
    }
  }

  const handleHoldEnd = () => {
    setHolding(false)
  }

  // Mantener pulsado 1,5 s confirma que es a propósito, no un toque al pasar
  // el móvil a un compañero.
  useEffect(() => {
    let timeout: number
    if (holding) {
      timeout = window.setTimeout(() => {
        void onWin()
      }, 1500)
    }
    return () => window.clearTimeout(timeout)
  }, [holding, onWin])

  return (
    <section className="saga-glass-panel" style={container}>
      <div style={title}>Relevo de Equipo</div>
      <p style={description}>
        {helperText ||
          (isReady
            ? `${cercanos.map((p) => p.display_name || p.user).join(', ')} está${cercanos.length === 1 ? '' : 'n'} aquí contigo.`
            : 'Esperando a que llegue alguien más del equipo a este punto...')}
      </p>

      <div style={statusBox}>
        <div style={statusText}>Compañeros aquí:</div>
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
  background: 'rgba(var(--theme-ink), 0.6)',
  borderRadius: 'var(--theme-radius-panel, 16px)',
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
  borderRadius: 'var(--theme-radius-card, 12px)',
  width: '100%',
  marginBottom: 24,
}

const statusText: CSSProperties = {
  color: 'rgb(var(--theme-line-soft))',
  fontSize: 14,
}

const statusCount: CSSProperties = {
  color: 'rgb(var(--theme-info))',
  fontSize: 18,
  fontWeight: 'bold',
}

const holdButtonReady: CSSProperties = {
  width: '100%',
  padding: 16,
  borderRadius: 'var(--theme-radius-pill, 12px)',
  background: 'linear-gradient(180deg,rgba(var(--theme-info), .92),rgba(var(--theme-info-deep), .92))',
  color: '#fff',
  fontWeight: 'bold',
  fontSize: 16,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.2s',
}

const holdButtonDisabled: CSSProperties = {
  ...holdButtonReady,
  background: 'rgb(var(--theme-sheen-b))',
  color: 'rgb(var(--theme-line))',
  cursor: 'not-allowed',
}
