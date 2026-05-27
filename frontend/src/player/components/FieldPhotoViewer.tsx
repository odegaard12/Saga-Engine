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

  function previous() {
    setIndex((current) => Math.max(0, current - 1))
  }

  function next() {
    setIndex((current) => Math.min(proofs.length - 1, current + 1))
  }

  return (
    <div style={overlay} onClick={onClose}>
      <section style={sheet} onClick={(event) => event.stopPropagation()} aria-label="Fotos de campo">
        <div style={header}>
          <div>
            <strong style={title}>Fotos de campo</strong>
            <span style={counter}>{safeIndex + 1}/{proofs.length}</span>
          </div>

          <button type="button" style={closeButton} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
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
            <button type="button" style={navButton} disabled={safeIndex === 0} onClick={previous}>
              ← Anterior
            </button>
            <button type="button" style={navButton} disabled={safeIndex >= proofs.length - 1} onClick={next}>
              Siguiente →
            </button>
          </div>
        ) : null}

        <div style={actions}>
          {canDelete ? (
            <button
              type="button"
              style={deleteButton}
              onClick={() => onDelete(proof.id)}
            >
              Eliminar foto
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 7600,
  display: 'grid',
  alignItems: 'end',
  background: 'rgba(2,6,23,.34)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
}

const sheet: CSSProperties = {
  width: 'min(100%, 520px)',
  margin: '0 auto',
  padding: 14,
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
  borderRadius: '26px 26px 0 0',
  border: '1px solid rgba(255,255,255,.16)',
  background: 'linear-gradient(180deg, rgba(248,250,252,.98), rgba(241,245,249,.98))',
  boxShadow: '0 -20px 56px rgba(15,23,42,.28)',
  color: '#0f172a',
  display: 'grid',
  gap: 12,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const title: CSSProperties = {
  display: 'block',
  fontSize: 20,
  fontWeight: 950,
  letterSpacing: '-0.03em',
}

const counter: CSSProperties = {
  display: 'inline-flex',
  marginTop: 4,
  minHeight: 22,
  padding: '0 8px',
  alignItems: 'center',
  borderRadius: 999,
  background: '#0f172a',
  color: '#fff',
  fontSize: 11,
  fontWeight: 950,
}

const closeButton: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 999,
  border: '1px solid rgba(15,23,42,.10)',
  background: 'rgba(15,23,42,.06)',
  color: '#334155',
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 700,
}

const imageFrame: CSSProperties = {
  width: '100%',
  height: 'min(48vh, 360px)',
  minHeight: 220,
  borderRadius: 22,
  overflow: 'hidden',
  background: '#0f172a',
  display: 'grid',
  placeItems: 'center',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18)',
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
}

const nav: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const navButton: CSSProperties = {
  minHeight: 38,
  borderRadius: 14,
  border: '1px solid rgba(15,23,42,.10)',
  background: 'rgba(15,23,42,.06)',
  color: '#0f172a',
  fontSize: 12,
  fontWeight: 900,
}

const actions: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const deleteButton: CSSProperties = {
  minHeight: 42,
  borderRadius: 16,
  border: '1px solid rgba(220,38,38,.20)',
  background: 'rgba(254,226,226,.92)',
  color: '#991b1b',
  fontSize: 13,
  fontWeight: 950,
}
