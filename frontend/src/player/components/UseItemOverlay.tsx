import { useEffect, useState } from 'react'
import ItemIconSvg from './ItemIconSvg'

/**
 * Paso de "usar el objeto" antes de abrir un nodo que lo exige.
 *
 * Antes, llevar la pieza encima simplemente hacía que el nodo se abriese: el
 * jugador forjaba el objeto y no volvía a saber de él. Aquí se usa de forma
 * explícita, con su animación, para que el gesto se vea.
 */

interface UseItemOverlayProps {
  open: boolean
  label: string
  itemId: string
  /** Se llama cuando termina la animación de uso. */
  onUsed: () => void
  onCancel: () => void
}

type Fase = 'listo' | 'usando' | 'hecho'

export function UseItemOverlay({ open, label, itemId, onUsed, onCancel }: UseItemOverlayProps) {
  const [fase, setFase] = useState<Fase>('listo')

  useEffect(() => {
    if (open) setFase('listo')
  }, [open, itemId])

  useEffect(() => {
    if (fase !== 'usando') return
    const aHecho = window.setTimeout(() => setFase('hecho'), 1500)
    return () => window.clearTimeout(aHecho)
  }, [fase])

  useEffect(() => {
    if (fase !== 'hecho') return
    const aFuera = window.setTimeout(onUsed, 900)
    return () => window.clearTimeout(aFuera)
  }, [fase, onUsed])

  if (!open) return null

  return (
    <div className="saga-use-overlay" role="dialog" aria-modal="true">
      <style>{estilos}</style>

      <div className="saga-use-card">
        <div className="saga-use-glow" aria-hidden="true" />

        <div className={`saga-use-stage saga-use-stage--${fase}`}>
          <div className={`saga-use-halo saga-use-halo--${fase}`} aria-hidden="true" />
          <div className={`saga-use-halo saga-use-halo--b saga-use-halo--${fase}`} aria-hidden="true" />

          {/* Rayos: sólo mientras encaja. */}
          <div className={`saga-use-rays saga-use-rays--${fase}`} aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} style={{ transform: `rotate(${i * 45}deg) translateY(-58px)` }} />
            ))}
          </div>

          <div className={`saga-use-item saga-use-item--${fase}`}>
            <ItemIconSvg itemId={itemId} size={72} />
          </div>
        </div>

        {fase === 'hecho' ? (
          <>
            <h2 className="saga-use-title">A porta cede</h2>
            <p className="saga-use-text">{label} encaixou no seu sitio.</p>
          </>
        ) : fase === 'usando' ? (
          <>
            <h2 className="saga-use-title">Encaixando…</h2>
            <p className="saga-use-text">Non o soltes.</p>
          </>
        ) : (
          <>
            <h2 className="saga-use-title">{label}</h2>
            <p className="saga-use-text">
              Lévalo encima. Este nodo non abre sen el: úsao para entrar.
            </p>

            <button type="button" className="saga-use-btn" onClick={() => setFase('usando')}>
              Usar {label}
            </button>
            <button type="button" className="saga-use-cancel" onClick={onCancel}>
              Agora non
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const estilos = `
.saga-use-overlay{
  position:fixed; inset:0; z-index:7000;
  display:flex; align-items:center; justify-content:center; padding:18px;
  background:radial-gradient(circle at center, rgba(251,191,36,.14), rgba(2,6,23,.96) 70%);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  animation:sagaUseFade .28s ease-out both;
}
.saga-use-card{
  position:relative; width:min(100%,360px); padding:26px 22px; text-align:center;
  display:grid; gap:12px; place-items:center;
  border:1px solid rgba(251,191,36,.28); border-radius:26px;
  background:linear-gradient(180deg, rgba(15,23,42,.97), rgba(2,6,23,.99));
  box-shadow:0 24px 60px rgba(0,0,0,.55);
}
/* Resplandor de fondo, para que la tarjeta no sea un rectángulo plano. */
.saga-use-glow{
  position:absolute; inset:-40% -20% auto; height:220px; pointer-events:none;
  background:radial-gradient(ellipse at 50% 0%, rgba(251,191,36,.20), transparent 68%);
}
.saga-use-stage{
  position:relative; display:grid; place-items:center;
  width:150px; height:150px; margin:2px auto 0;
}
.saga-use-halo{
  position:absolute; width:118px; height:118px; border-radius:999px;
  border:2px solid rgba(251,191,36,.35); opacity:0;
}
.saga-use-halo--usando{ animation:sagaUsePulse 1.6s ease-out infinite; }
.saga-use-halo--b.saga-use-halo--usando{ animation-delay:.55s; }
.saga-use-halo--hecho{ border-color:rgba(52,211,153,.55); opacity:1; }
.saga-use-halo--b.saga-use-halo--hecho{ opacity:0; }
.saga-use-rays{ position:absolute; inset:0; display:grid; place-items:center; opacity:0; }
.saga-use-rays--usando{ opacity:1; animation:sagaUseSpin 5s linear infinite; }
.saga-use-rays--hecho{ opacity:0; transition:opacity .3s ease; }
.saga-use-rays span{
  position:absolute; width:2px; height:16px; border-radius:2px;
  background:linear-gradient(180deg, rgba(251,191,36,.85), transparent);
}
.saga-use-item{
  position:relative; display:grid; place-items:center;
  width:106px; height:106px; border-radius:999px;
  background:radial-gradient(circle at 34% 28%, rgba(255,255,255,.16), rgba(251,191,36,.10) 46%, rgba(120,53,15,.22));
  border:1px solid rgba(251,191,36,.34);
  box-shadow:inset 0 2px 10px rgba(255,255,255,.10), 0 10px 26px rgba(217,119,6,.22);
}
.saga-use-item--usando{ animation:sagaUseShake .35s ease-in-out infinite; }
.saga-use-item--hecho{
  background:radial-gradient(circle at 34% 28%, rgba(255,255,255,.20), rgba(52,211,153,.16) 48%, rgba(6,78,59,.26));
  border-color:rgba(52,211,153,.55);
  box-shadow:inset 0 2px 10px rgba(255,255,255,.12), 0 12px 30px rgba(16,185,129,.28);
  animation:sagaUseSnap .5s cubic-bezier(.16,1,.3,1) both;
}
.saga-use-title{ margin:0; font-size:20px; font-weight:950; color:#fff; letter-spacing:-.02em; }
.saga-use-text{ margin:0; font-size:13px; line-height:1.45; color:rgba(226,232,240,.72); }
.saga-use-btn{
  width:100%; min-height:48px; margin-top:4px; border:none; border-radius:16px;
  background:linear-gradient(180deg,#fbbf24,#d97706); color:#1c1207;
  font-size:14px; font-weight:950; letter-spacing:.04em; text-transform:uppercase; cursor:pointer;
  box-shadow:0 10px 24px rgba(217,119,6,.32);
}
.saga-use-cancel{
  border:none; background:none; color:rgba(226,232,240,.55);
  font-size:12px; font-weight:800; cursor:pointer; padding:4px;
}
@keyframes sagaUseFade{ from{opacity:0} to{opacity:1} }
@keyframes sagaUsePulse{
  0%{ transform:scale(.82); opacity:.9 }
  100%{ transform:scale(1.55); opacity:0 }
}
@keyframes sagaUseSpin{ to{ transform:rotate(360deg) } }
@keyframes sagaUseShake{
  0%,100%{ transform:translate3d(0,0,0) rotate(0) }
  25%{ transform:translate3d(-3px,0,0) rotate(-4deg) }
  75%{ transform:translate3d(3px,0,0) rotate(4deg) }
}
@keyframes sagaUseSnap{
  0%{ transform:scale(.7) }
  60%{ transform:scale(1.12) }
  100%{ transform:scale(1) }
}
@media (prefers-reduced-motion: reduce){
  .saga-use-overlay,.saga-use-item--usando,.saga-use-item--hecho,.saga-use-halo--usando{ animation:none }
}
`
