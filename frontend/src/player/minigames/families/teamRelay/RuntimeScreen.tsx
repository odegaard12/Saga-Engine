import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMinigame } from '../../core/resolver'
import { usePlayerStore } from '../../../store/usePlayerStore'
import { getDistanceMeters } from '../../../utils/geo'
import { useTextos } from '../../core/useTextos'
import { miembrosNecesarios, miembrosPresentes, relevoListo } from './presencia'

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
  const t = useTextos().teamRelay
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

  // Cuántos jugadores hacen falta lo decide quien monta la misión
  // (config.required_members, editable en el admin), CONTANDO a quien juega
  // (ver presencia.ts). team_relay es un game_id dentro de la familia
  // signal_hunt, no una familia propia -de ahí el cast, igual que hace
  // FamilyRuntimeHost con game_id.
  const requiredMembers = miembrosNecesarios(
    (resolved.config as { required_members?: number }).required_members
  )
  const activeMembersCount = miembrosPresentes(cercanos.length)
  const isReady = relevoListo(cercanos.length, requiredMembers)

  const handleHoldStart = () => {
    if (isReady && !submitting) {
      setHolding(true)
    }
  }

  const handleHoldEnd = () => {
    setHolding(false)
  }

  // `onWin` cambia de identidad en cada render de la hoja (que se repinta cuatro
  // veces por segundo por el reloj del nodo): si fuese dependencia del efecto, el
  // temporizador de abajo se reiniciaba a los 250 ms y el pulso nunca llegaba a
  // los 1,5 s. Se lee por ref.
  const onWinRef = useRef(onWin)
  onWinRef.current = onWin

  // Mantener pulsado 1,5 s confirma que es a propósito, no un toque al pasar
  // el móvil a un compañero.
  useEffect(() => {
    let timeout: number
    if (holding) {
      timeout = window.setTimeout(() => {
        void onWinRef.current()
      }, 1500)
    }
    return () => window.clearTimeout(timeout)
  }, [holding])

  return (
    <section className="saga-glass-panel" style={container}>
      <div style={title}>{t.titulo}</div>
      <p style={description}>
        {helperText ||
          (isReady
            ? t.juntos(cercanos.map((p) => p.display_name || p.user).join(', '), cercanos.length)
            : t.esperando)}
      </p>

      <div style={statusBox}>
        <div style={statusText}>{t.companerosAqui}</div>
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
          ? t.registrando
          : isReady
            ? holding
              ? t.mantenPresionado
              : t.validar
            : t.esperandoEquipo}
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
