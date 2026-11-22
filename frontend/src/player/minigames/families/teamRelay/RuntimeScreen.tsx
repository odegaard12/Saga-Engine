import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PlayerStage } from '../../../../types/player'
import type { ResolvedMinigame } from '../../core/resolver'
import { usePlayerStore } from '../../../store/usePlayerStore'
import { getDistanceMeters } from '../../../utils/geo'
import { useTextos } from '../../core/useTextos'
import { miembrosNecesarios, miembrosPresentes, relevoListo } from './presencia'
import { useSinRetoEnPantalla } from '../../../hooks/useSinRetoEnPantalla'
import { usePrefiereMenosMovimiento } from '../../../ui/movimiento'

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

    return (
      teamProfiles
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
    )
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
  // Revisión 19/10: mientras se espera al equipo no hay reto en pantalla;
  // salir a avisar a los demás no es trampa.
  useSinRetoEnPantalla(!isReady)

  const handleHoldStart = () => {
    if (isReady && !submitting) {
      setHolding(true)
    }
  }

  const handleHoldEnd = () => {
    setHolding(false)
  }

  // Sin red no llegan las posiciones del grupo: decirlo, en vez de «esperando» para siempre (revisión 19/10).
  const [sinRed, setSinRed] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  )
  useEffect(() => {
    const cambiar = () => setSinRed(navigator.onLine === false)
    window.addEventListener('online', cambiar)
    window.addEventListener('offline', cambiar)
    return () => {
      window.removeEventListener('online', cambiar)
      window.removeEventListener('offline', cambiar)
    }
  }, [])

  // Si el compañero se va mientras se mantiene pulsado, se suelta: antes el relevo valía igual.
  useEffect(() => {
    if (!isReady) setHolding(false)
  }, [isReady])

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
      }, DURACION_MS)
    }
    return () => window.clearTimeout(timeout)
  }, [holding])

  // 22/11: el botón se va llenando mientras se mantiene (escala en X, 1,5 s, lineal) y se vacía de golpe al soltar.
  // Con «reducir movimiento» no se anima: se enciende a saltos, un tercio cada medio segundo.
  const reducido = usePrefiereMenosMovimiento()
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    setPaso(0)
    if (!holding || !reducido) return undefined
    const id = window.setInterval(() => setPaso((p) => Math.min(PASOS, p + 1)), DURACION_MS / PASOS)
    return () => window.clearInterval(id)
  }, [holding, reducido])
  const relleno: CSSProperties = reducido
    ? { ...rellenoBase, transform: `scaleX(${paso / PASOS})`, transition: 'none' }
    : {
        ...rellenoBase,
        transform: `scaleX(${holding ? 1 : 0})`,
        transition: holding ? `transform ${DURACION_MS}ms linear` : 'none',
      }

  return (
    <section className="saga-glass-panel" style={container}>
      <h2 style={title}>{t.titulo}</h2>
      <p style={description}>
        {sinRed && !isReady
          ? t.sinRed
          : helperText ||
            (isReady
              ? t.juntos(cercanos.map((p) => p.display_name || p.user).join(', '), cercanos.length)
              : t.esperando)}
      </p>

      {/* 22/11: un sitio por jugador que hace falta; se llena (verde) con cada uno que está en el punto. */}
      <div style={statusBox}>
        <div style={statusText}>{t.companerosAqui.replace(/:\s*$/, '')}</div>
        <div style={plazas} aria-hidden="true">
          {Array.from({ length: requiredMembers }, (_, i) => (
            <span key={i} style={i < activeMembersCount ? plazaLlena : plaza}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="8" r="3.6" />
                <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
              </svg>
            </span>
          ))}
        </div>
        <div style={statusCount}>
          {activeMembersCount} / {requiredMembers}
        </div>
      </div>

      <button
        style={isReady ? holdButtonReady : holdButtonDisabled}
        onPointerDown={handleHoldStart}
        onPointerUp={handleHoldEnd}
        onPointerLeave={handleHoldEnd}
        onPointerCancel={handleHoldEnd}
        // 22/11: mantener pulsado en iOS sacaba el menú de copiar/seleccionar y soltaba el botón antes de 1,5 s.
        onContextMenu={(e) => e.preventDefault()}
        disabled={!isReady || submitting}
      >
        <span data-relevo-relleno="" aria-hidden="true" style={relleno} />
        <span style={{ position: 'relative' }}>
          {submitting
            ? t.registrando
            : isReady
              ? holding
                ? t.mantenPresionado
                : t.validar
              : t.esperandoEquipo}
        </span>
      </button>
    </section>
  )
}

// 22/11: en la piel de los demás juegos (título a la izquierda, tarjeta de pizarra, botón azul de 56 px).
const container: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: '4px 0 0',
  color: 'var(--mg-text)',
}

const title: CSSProperties = {
  margin: 0,
}

const description: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.4,
  color: 'var(--mg-text-2)',
}

const statusBox: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 10,
  padding: '14px 12px',
  borderRadius: 16,
  background: 'var(--saga-pizarra-tarjeta)',
  border: '1px solid var(--saga-pizarra-raya)',
}

const statusText: CSSProperties = {
  color: 'var(--mg-text-2)',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const plazas: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 10,
}

const plaza: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 52,
  height: 52,
  borderRadius: '50%',
  border: '2px dashed color-mix(in srgb, var(--mg-text) 40%, transparent)',
  color: 'var(--mg-text-2)',
}

const plazaLlena: CSSProperties = {
  ...plaza,
  border: '2px solid var(--mg-good)',
  background: 'var(--mg-good-fondo)',
  color: 'var(--mg-good)',
}

const statusCount: CSSProperties = {
  color: 'var(--mg-text)',
  fontSize: 20,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
}

const DURACION_MS = 1500
const PASOS = 3

const rellenoBase: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(var(--a-texto-rgb, 255, 255, 255), 0.28)', // un velo claro sobre el color del botón
  transformOrigin: 'left center',
  pointerEvents: 'none',
}

const holdButtonReady: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  minHeight: 56,
  padding: 14,
  borderRadius: 14,
  background: 'var(--theme-primary)',
  color: 'var(--mg-on-primary)',
  font: 'inherit',
  fontWeight: 800,
  fontSize: 16,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.2s',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  touchAction: 'none',
}

const holdButtonDisabled: CSSProperties = {
  ...holdButtonReady,
  background: 'color-mix(in srgb, var(--theme-text) 10%, var(--theme-card))',
  color: 'var(--mg-text-2)',
  border: '1px dashed color-mix(in srgb, var(--theme-text) 45%, transparent)',
  cursor: 'not-allowed',
}
