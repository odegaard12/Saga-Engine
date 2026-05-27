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

  return (
    <div style={overlay} onClick={close}>
      <section style={sheet} onClick={(event) => event.stopPropagation()} aria-label="Fotos de campo">
        <div style={header}>
          <div>
            <strong style={title}>Fotos de campo</strong>
            <span style={counter}>{safeIndex + 1}/{proofs.length}</span>
          </div>

          <button type="button" style={closeButton} onClick={close} aria-label="Cerrar">
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
            <button type="button" style={navButton} disabled={safeIndex === 0} onClick={() => setIndex((v) => Math.max(0, v - 1))}>
              ← Anterior
            </button>
            <button type="button" style={navButton} disabled={safeIndex >= proofs.length - 1} onClick={() => setIndex((v) => Math.min(proofs.length - 1, v + 1))}>
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
  alignItems: 'end',
  background: 'rgba(2,6,23,.22)',
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
}

const sheet: CSSProperties = {
  width: 'min(100%, 520px)',
  margin: '0 auto',
  padding: 14,
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
  borderRadius: '24px 24px 0 0',
  border: '1px solid rgba(15,23,42,.08)',
  background: 'rgba(248,250,252,.98)',
  boxShadow: '0 -18px 48px rgba(15,23,42,.22)',
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
  borderRadius: 999,
  background: '#0f172a',
  color: '#fff',
  fontSize: 11,
  fontWeight: 950,
}

const closeButton: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: '1px solid rgba(15,23,42,.10)',
  background: 'rgba(15,23,42,.06)',
  color: '#334155',
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 700,
}

const imageFrame: CSSProperties = {
  width: '100%',
  height: 'min(46vh, 340px)',
  minHeight: 220,
  borderRadius: 20,
  overflow: 'hidden',
  background: '#020617',
  display: 'grid',
  placeItems: 'center',
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

const deleteButton: CSSProperties = {
  minHeight: 42,
  borderRadius: 16,
  border: '1px solid rgba(220,38,38,.20)',
  background: 'rgba(254,226,226,.92)',
  color: '#991b1b',
  fontSize: 13,
  fontWeight: 950,
}
