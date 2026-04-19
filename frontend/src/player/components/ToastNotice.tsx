export type UiNotice = {
  message: string
  tone: 'info' | 'warn' | 'success'
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

const toastWrap: React.CSSProperties = {
  minHeight: 38,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  maxWidth: 'min(92vw, 440px)',
  padding: '9px 14px',
  borderRadius: 999,
  boxShadow: '0 10px 26px rgba(15,23,42,.14)',
  fontSize: 12,
  lineHeight: 1.3,
  fontWeight: 800,
  textAlign: 'center',
  animation: 'sagaToastIn 180ms cubic-bezier(0.22, 1, 0.36, 1)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

const toastInfo: React.CSSProperties = {
  border: '1px solid rgba(59,130,246,.16)',
  background: 'rgba(239,246,255,.94)',
  color: '#1d4ed8',
}

const toastWarn: React.CSSProperties = {
  border: '1px solid rgba(245,158,11,.18)',
  background: 'rgba(255,251,235,.95)',
  color: '#92400e',
}

const toastSuccess: React.CSSProperties = {
  border: '1px solid rgba(22,163,74,.18)',
  background: 'rgba(220,252,231,.95)',
  color: '#166534',
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
