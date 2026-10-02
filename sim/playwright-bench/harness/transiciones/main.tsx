/**
 * Arnés de transiciones.
 *
 * Monta, controlados desde `window.__h`, los componentes REALES que abren y
 * cierran sobre el mapa. El padre de verdad (PlayerApp) los monta de dos
 * maneras -siempre montados con `open`, o condicionados `{abierto && <Panel/>}`-;
 * aquí cada uno va como va allí, que es lo que decide si la salida se puede
 * animar.
 */
import { StrictMode, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@frontend/styles/mobile-shell.css'
import '@frontend/mobile-themes.css'
import { SwipeableSheet } from '@frontend/player/components/SwipeableSheet'
import { ToastNotice, type UiNotice } from '@frontend/player/components/ToastNotice'
import { QuietNotice, type QuietNoticeData } from '@frontend/player/components/QuietNotice'
import { StoryModal } from '@frontend/player/components/StoryModal'
import { FieldPhotoViewer } from '@frontend/player/components/FieldPhotoViewer'
import { UseItemOverlay } from '@frontend/player/components/UseItemOverlay'
import { MissionCompleteScreen } from '@frontend/player/components/MissionCompleteScreen'
import { SplashScreen } from '@frontend/player/components/SplashScreen'
import { PantallaDeCarga } from '@frontend/player/components/PantallaDeCarga'
import { FamilyRuntimeHost } from '@frontend/player/minigames/core/FamilyRuntimeHost'
import { getToastOverlayStyle, getQuietOverlayStyle } from '@frontend/player/components/PlayerLayout'
import { cargaInicial } from '@frontend/player/offline/motorDeCarga'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __h: Record<string, (...args: any[]) => void>
  }
}

const FOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#3b82f6"/></svg>'
  )
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRUEBAS = [{ id: 'p1', user: 'yo', image_url: FOTO, thumbnail_url: FOTO, display_name: 'Yo', stage_title: 'Nodo' }] as any[]

// Un nodo de llegada: su familia carga de forma perezosa, que es lo que se mide.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resueltoFalso = { family: 'signal_hunt', compatibility: 'native', config: {}, label: 'x' } as any

function Arnes() {
  const [hoja, setHoja] = useState(false)
  const [aviso, setAviso] = useState<UiNotice>(null)
  const [callado, setCallado] = useState<QuietNoticeData>(null)
  const [historia, setHistoria] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [foto, setFoto] = useState<any[]>([])
  const [usar, setUsar] = useState<{ label: string; itemId: string } | null>(null)
  const [final, setFinal] = useState(false)
  const [esqueleto, setEsqueleto] = useState(false)
  const [cierres, setCierres] = useState<string[]>([])

  useEffect(() => {
    window.__h = {
      abrirHoja: () => setHoja(true),
      cerrarHoja: () => setHoja(false),
      avisar: (message: string, tone = 'warn') => setAviso({ message, tone } as UiNotice),
      avisoNulo: () => setAviso(null),
      callar: (message: string | null) => setCallado(message ? { message } : null),
      abrirHistoria: () => setHistoria(true),
      abrirFoto: () => setFoto(PRUEBAS),
      cerrarFoto: () => setFoto([]),
      abrirUsar: () => setUsar({ label: 'Llave', itemId: 'llave' }),
      cerrarUsar: () => setUsar(null),
      abrirFinal: () => setFinal(true),
      abrirEsqueleto: () => setEsqueleto(true),
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--theme-bg)' }}>
      <div data-testid="mapa" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#16304f,#0b1324)' }} />
      <div style={getToastOverlayStyle(true)}>
        <ToastNotice notice={aviso} />
      </div>
      <div style={getQuietOverlayStyle(true)}>
        <QuietNotice notice={callado} />
      </div>

      <SwipeableSheet open={hoja} onClose={() => setHoja(false)}>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <strong>Hoja de prueba</strong>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} style={{ height: 40, background: 'rgba(255,255,255,.08)', borderRadius: 10 }} />
          ))}
        </div>
      </SwipeableSheet>

      {historia ? (
        <StoryModal
          title="Prólogo"
          body="Texto de la historia."
          buttonText="Seguir"
          onClose={() => {
            setHistoria(false)
            setCierres((c) => [...c, 'historia'])
          }}
        />
      ) : null}

      <FieldPhotoViewer
        open={foto.length > 0}
        proofs={foto}
        viewerUser="yo"
        onClose={() => setFoto([])}
        onDelete={() => undefined}
      />

      <UseItemOverlay
        open={Boolean(usar)}
        label={usar?.label || ''}
        itemId={usar?.itemId || ''}
        onUsed={() => setUsar(null)}
        onCancel={() => setUsar(null)}
      />

      {final ? (
        <MissionCompleteScreen
          displayName="Yo"
          selfUser="yo"
          players={[]}
          totalNodes={6}
          photoCount={1}
          onDismiss={() => {
            setFinal(false)
            setCierres((c) => [...c, 'final'])
          }}
          onExit={() => undefined}
        />
      ) : null}

      {esqueleto ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }} data-testid="esqueleto">
          <Suspense fallback={null}>
            <FamilyRuntimeHost
              resolved={resueltoFalso}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              stage={{ id: 1, title: 'x' } as any}
              helperText=""
              submitting={false}
              onWin={async () => undefined}
            />
          </Suspense>
        </div>
      ) : null}

      <output data-testid="cierres" style={{ position: 'absolute', left: 0, top: 0, opacity: 0 }}>
        {cierres.join(',')}
      </output>
    </div>
  )
}

// Las dos pantallas de carga, una tras otra, para medir el relevo.
function CargaEnCadena() {
  const [fase, setFase] = useState<'neutra' | 'barras'>('neutra')
  useEffect(() => {
    window.__h = { pasarABarras: () => setFase('barras') }
  }, [])
  return fase === 'neutra' ? (
    <SplashScreen detail="Conectando con la misión…" primeiraVez={false} entradaSuave />
  ) : (
    <PantallaDeCarga modo="entrada" partes={cargaInicial()} />
  )
}

const caso = new URLSearchParams(location.search).get('caso')
createRoot(document.getElementById('raiz')!).render(
  <StrictMode>{caso === 'carga' ? <CargaEnCadena /> : <Arnes />}</StrictMode>
)
