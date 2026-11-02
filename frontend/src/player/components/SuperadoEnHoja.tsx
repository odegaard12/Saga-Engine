import type { CSSProperties } from 'react'

/**
 * «¡Superado!» dentro de la hoja del nodo (31/10, aprobado por Óscar). Sale en la envoltura común (InteractionSheet)
 * para TODOS los minijuegos, en cuanto el reto se gana, y se queda lo que dura FESTEJO_EN_HOJA_MS antes de volver al
 * mapa (donde sigue la celebración del nodo). Es sólo dibujo: el avance ya se ha enviado y los relojes no se tocan.
 *
 * Coherente con el mapa: el mismo sello ✓ verde que cae y golpea (efectosDelMapa.ts), un anillo dorado como el pulso
 * del nodo y confeti. Pizarra D1. Con «reducir movimiento», todo quieto y sin confeti. Tocarlo lo cierra antes.
 */
export const FESTEJO_EN_HOJA_MS = 1700

const ORO = '251, 191, 36'
const COLORES = [
  `rgb(${ORO})`,
  'rgb(var(--theme-done))',
  'var(--theme-primary)',
  'rgb(255, 226, 120)',
]

/** 14 piezas de confeti repartidas en abanico (fijas: el mismo dibujo siempre). */
const CONFETI = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2
  const r = 110 + (i % 3) * 26
  return {
    dx: Math.round(Math.cos(a) * r),
    dy: Math.round(Math.sin(a) * r * 0.75) + 40,
    giro: (i % 2 ? 1 : -1) * (160 + i * 23),
    color: COLORES[i % COLORES.length],
    retraso: (i % 4) * 30,
  }
})

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const ESTILOS = `
.saga-superado {
  position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; overflow: hidden;
  border-radius: inherit; cursor: pointer;
  background: linear-gradient(rgba(var(--theme-ink, 15, 23, 42), .55), rgba(var(--theme-ink, 15, 23, 42), .55)), var(--saga-pizarra);
  animation: saga-sup-velo 220ms ease-out both;
}
.saga-superado-centro { position: relative; display: grid; justify-items: center; gap: 10px; padding: 24px; text-align: center; }
.saga-superado-sello {
  position: relative; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center;
  background: rgb(var(--theme-done)); color: #fff; font: 900 52px/1 system-ui, sans-serif;
  box-shadow: inset 0 0 0 4px rgba(255,255,255,.4), 0 0 0 6px rgba(${ORO},.35), 0 10px 24px rgba(0,0,0,.35);
  animation: saga-sup-sello 700ms cubic-bezier(.3,.7,.2,1) both;
}
.saga-superado-anillo {
  position: absolute; left: 50%; top: 48px; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%;
  border: 4px solid rgb(${ORO}); box-shadow: 0 0 18px rgba(${ORO},.8); opacity: 0;
  animation: saga-sup-anillo 900ms cubic-bezier(.2,.7,.3,1) 160ms both;
}
.saga-superado-confeti {
  position: absolute; left: 50%; top: 48px; width: 7px; height: 11px; margin: -5px 0 0 -3px; border-radius: 2px; opacity: 0;
  animation: saga-sup-confeti 1100ms cubic-bezier(.15,.8,.3,1) both;
}
.saga-superado-titulo { color: #fff; font-size: 28px; font-weight: 800; letter-spacing: -.01em; animation: saga-sup-sube 360ms ease-out 260ms both; }
.saga-superado-dato { display: flex; gap: 8px; align-items: baseline; color: rgba(226,238,255,.78); font-size: 13px; font-weight: 700; animation: saga-sup-sube 360ms ease-out 360ms both; }
.saga-superado-dato strong { color: #fff; font-size: 18px; font-variant-numeric: tabular-nums; }
.saga-superado-estrella { padding: 2px 12px; border-radius: 999px; background: rgba(250, 204, 21, .18); border: 1px solid rgba(250, 204, 21, .55); color: #fde047; font-size: 15px; font-weight: 800; animation: saga-sup-sube 360ms ease-out 480ms both; }
.saga-superado-pena { color: rgb(${ORO}); font-size: 12px; font-weight: 800; animation: saga-sup-sube 360ms ease-out 420ms both; }
@keyframes saga-sup-velo { from { opacity: 0; } to { opacity: 1; } }
@keyframes saga-sup-sello {
  0% { opacity: 0; transform: scale(1.9); }
  40% { opacity: 1; transform: scale(.92); }
  60%, 100% { opacity: 1; transform: scale(1); }
}
@keyframes saga-sup-anillo { 0% { opacity: .95; transform: scale(.6); } 100% { opacity: 0; transform: scale(2.4); } }
@keyframes saga-sup-confeti {
  0% { opacity: 1; transform: translate(0, 0) rotate(0); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--giro)); }
}
@keyframes saga-sup-sube { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .saga-superado, .saga-superado-sello, .saga-superado-titulo, .saga-superado-dato, .saga-superado-pena, .saga-superado-estrella { animation: none; }
  .saga-superado-anillo, .saga-superado-confeti { display: none; }
}
`

export function SuperadoEnHoja({
  tiempoMs,
  penalizacionMs,
  estrellas = 0,
  alTocar,
}: {
  tiempoMs: number
  penalizacionMs: number
  /** Las estrellas que da este nodo (0 si el vestuario desbloqueable está apagado): «+1 ★», una sola vez, aquí. */
  estrellas?: number
  alTocar: () => void
}) {
  const pena = Math.round(penalizacionMs / 1000)
  return (
    <div
      className="saga-superado"
      role="status"
      aria-live="polite"
      data-saga-superado
      onClick={alTocar}
    >
      <style>{ESTILOS}</style>
      <div className="saga-superado-centro">
        <span className="saga-superado-anillo" aria-hidden="true" />
        {CONFETI.map((c, i) => (
          <span
            key={i}
            className="saga-superado-confeti"
            aria-hidden="true"
            style={
              {
                background: c.color,
                animationDelay: `${120 + c.retraso}ms`,
                '--dx': `${c.dx}px`,
                '--dy': `${c.dy}px`,
                '--giro': `${c.giro}deg`,
              } as CSSProperties
            }
          />
        ))}
        <span className="saga-superado-sello" aria-hidden="true">
          ✓
        </span>
        <span className="saga-superado-titulo">¡Superado!</span>
        <span className="saga-superado-dato">
          <span>Tiempo del nodo</span>
          <strong>{mmss(tiempoMs)}</strong>
        </span>
        {estrellas > 0 ? <span className="saga-superado-estrella">+{estrellas} ★</span> : null}
        {pena > 0 ? (
          <span className="saga-superado-pena">
            <span>Penalización</span> <span>+{pena} s</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
