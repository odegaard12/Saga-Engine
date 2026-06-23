import type { CSSProperties } from 'react'
import { tokens } from '../ui/tokens'

export type UiNoticeTone = 'info' | 'warn' | 'success'
export type UiNotice = {
  message: string
  tone: UiNoticeTone
} | null

export function ToastNotice({ notice }: { notice: UiNotice }) {
  if (!notice) return null

  return (
    <>
      <style>{toastAnimations}</style>
      <div
        style={{
          ...toastWrap,
          ...(notice.tone === 'success'
            ? toastSuccess
            : notice.tone === 'warn'
            ? toastWarn
            : toastInfo),
        }}
      >
        {notice.message}
      </div>
    </>
  )
}

const toastWrap: CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  maxWidth: 'min(92vw, 420px)',
  padding: '9px 14px',
  borderRadius: tokens.radius.pill,
  boxShadow: tokens.shadow.soft,
  fontSize: 12,
  lineHeight: 1.3,
  fontWeight: 800,
  textAlign: 'center',
  animation: 'sagaToastIn 180ms cubic-bezier(0.22, 1, 0.36, 1)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const toastInfo: CSSProperties = {
  border: `1px solid ${tokens.colors.infoLine}`,
  background: tokens.colors.infoSoft,
  color: tokens.colors.info,
}

const toastWarn: CSSProperties = {
  border: `1px solid ${tokens.colors.warnLine}`,
  background: tokens.colors.warnSoft,
  color: tokens.colors.warn,
}

const toastSuccess: CSSProperties = {
  border: `1px solid ${tokens.colors.brandLine}`,
  background: tokens.colors.brandSoft,
  color: tokens.colors.brand,
}

const toastAnimations = `
@keyframes sagaToastIn {
  from {
    opacity: 0;
    transform: translateY(10px) scale(.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`
