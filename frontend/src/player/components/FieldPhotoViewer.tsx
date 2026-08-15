import { useEffect, useState, type CSSProperties } from 'react'
import type { FieldProof } from '../../types/player'

type FieldPhotoViewerProps = {
  proofs: FieldProof[]
  viewerUser: string
  open: boolean
  onClose: () => void
  onDelete: (proofId: string) => void
}

export function FieldPhotoViewer({
  proofs,
  viewerUser,
  open,
  onClose,
  onDelete,
}: FieldPhotoViewerProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (open) setIndex(0)
  }, [open, proofs.length])

  if (!open || proofs.length === 0) return null

  const safeIndex = Math.max(0, Math.min(index, proofs.length - 1))
  const proof = proofs[safeIndex]
  const canDelete = proof.user === viewerUser
  const imageUrl = proof.image_url || proof.thumbnail_url || ''

  function close() {
    setIndex(0)
    onClose()
  }

  function deleteCurrent() {
    onDelete(proof.id)
    if (proofs.length <= 1) close()
  }

  function downloadPhoto() {
    try {
      const a = document.createElement('a')
      a.href = imageUrl
      a.download = `foto_campo_${proof.id || 'photo'}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.error('Error downloading photo', e)
    }
  }

  return (
    <div style={overlay} onClick={close}>
      <section
        style={sheet}
        onClick={(event) => event.stopPropagation()}
        aria-label="Fotos de campo"
      >
        <div style={header}>
          <div>
            <strong style={title}>Fotos de campo</strong>
            <span style={counter}>
              {safeIndex + 1}/{proofs.length}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={downloadButton}
              onClick={downloadPhoto}
              title="Descargar esta foto"
              aria-label="Descargar esta foto"
            >
              📥
            </button>
            <button type="button" style={closeButton} onClick={close} aria-label="Cerrar">
              ×
            </button>
          </div>
        </div>

        <div style={imageFrame}>
          <img src={imageUrl} alt="" style={image} />
        </div>

        <div style={meta}>
          <strong>{proof.display_name || proof.user || 'Jugador'}</strong>
          {proof.stage_title ? <small>{proof.stage_title}</small> : null}
          {proof.note ? <p>{proof.note}</p> : null}
        </div>

        {proofs.length > 1 ? (
          <div style={nav}>
            <button
              type="button"
              style={navButton}
              disabled={safeIndex === 0}
              onClick={() => setIndex((v) => Math.max(0, v - 1))}
            >
              ← Anterior
            </button>
            <button
              type="button"
              style={navButton}
              disabled={safeIndex >= proofs.length - 1}
              onClick={() => setIndex((v) => Math.min(proofs.length - 1, v + 1))}
            >
              Siguiente →
            </button>
          </div>
        ) : null}

        {canDelete ? (
          <button type="button" style={deleteButton} onClick={deleteCurrent}>
            Eliminar foto
          </button>
        ) : null}
      </section>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 7600,
  display: 'grid',
  alignItems: 'center',
  padding: '16px 12px',
  background: 'rgba(2,6,23,.75)',
  backdropFilter: 'var(--theme-blur)',
  WebkitBackdropFilter: 'var(--theme-blur)',
}

const sheet: CSSProperties = {
  width: 'min(100%, 540px)',
  margin: '0 auto',
  maxHeight: '92vh',
  padding: 16,
  borderRadius: 'var(--theme-radius-panel)',
  background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
  color: '#f8fafc',
  display: 'grid',
  gap: 12,
  border: '1px solid rgba(56, 189, 248, 0.25)',
  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(14, 165, 233, 0.15)',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const title: CSSProperties = {
  display: 'block',
  fontSize: 19,
  fontWeight: 950,
  letterSpacing: '-0.03em',
}

const counter: CSSProperties = {
  display: 'inline-flex',
  marginTop: 4,
  minHeight: 21,
  padding: '0 8px',
  alignItems: 'center',
  borderRadius: 'var(--theme-radius-pill)',
  background: 'rgba(255,255,255,.12)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 950,
}

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#e2e8f0',
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 700,
}

const imageFrame: CSSProperties = {
  width: '100%',
  height: 'min(62vh, 560px)',
  minHeight: 260,
  borderRadius: 'var(--theme-radius-panel)',
  overflow: 'hidden',
  background: '#020617',
  display: 'grid',
  placeItems: 'center',
  border: '1px solid rgba(255,255,255,.08)',
}

const image: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
}

const meta: CSSProperties = {
  display: 'grid',
  gap: 4,
  fontSize: 13,
  color: '#e2e8f0',
}

const nav: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const navButton: CSSProperties = {
  minHeight: 38,
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.08)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 900,
}

const deleteButton: CSSProperties = {
  minHeight: 42,
  borderRadius: 'var(--theme-radius-card)',
  border: '1px solid rgba(248,113,113,.24)',
  background: 'rgba(127,29,29,.32)',
  color: '#fecaca',
  fontSize: 13,
  fontWeight: 950,
}

const downloadButton: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 'var(--theme-radius-pill)',
  border: '1px solid rgba(74,222,128,.30)',
  background: 'rgba(34,197,94,.16)',
  color: '#4ade80',
  display: 'grid',
  placeItems: 'center',
  fontSize: 16,
  cursor: 'pointer',
}
