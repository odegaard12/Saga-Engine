#!/usr/bin/env python3
from pathlib import Path

PLAYER_HUD = Path('frontend/src/player/components/PlayerHud.tsx')
MISSION = Path('frontend/src/player/components/MissionPackPanel.tsx')
GUIDED = Path('frontend/src/admin/components/GuidedNodeEditorFlow.tsx')


def exact(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'ERROR {label}: coincidencias={count}')
    return text.replace(old, new, 1)


def section(text: str, start: str, end: str, new: str, label: str) -> str:
    count = text.count(start)
    if count != 1:
        raise SystemExit(f'ERROR {label}: inicio={count}')
    a = text.index(start)
    b = text.find(end, a + len(start))
    if b < 0:
        raise SystemExit(f'ERROR {label}: fin no encontrado')
    return text[:a] + new.rstrip() + '\n\n' + text[b:]


# MissionPackPanel: una sola preparación offline que incluye fotos del mapa.
m = MISSION.read_text(encoding='utf-8')
m = exact(
    m,
    """import {
  fetchPlayerGame,
  fetchPublicConfig,
} from '../../shared/api'""",
    """import {
  fetchFieldProofs,
  fetchPlayerGame,
  fetchPublicConfig,
} from '../../shared/api'""",
    'imports API offline',
)
m = exact(
    m,
    """import {
  cacheMissionMapTiles,
  cachePlayerShell,
} from '../offline/pwaShell'""",
    """import {
  cacheMissionMapTiles,
  cachePlayerShell,
} from '../offline/pwaShell'
import {
  cacheFieldProofAssets,
  cacheFieldProofs,
} from '../offline/fieldProofCache'""",
    'imports fotos offline',
)
m = exact(
    m,
    """  const [tileCount, setTileCount] =
    useState<number | null>(null)

""",
    '',
    'estado teselas',
)
m = exact(
    m,
    """  const nodes =
    summary?.stageCount ||
    payload.stages?.length ||
    0

""",
    '',
    'contador nodos',
)
m = exact(
    m,
    """      const [config, game] =
        await Promise.all([
          fetchPublicConfig(),
          fetchPlayerGame(
            user,
            { offlinePack: true },
          ),
        ])""",
    """      const [config, game, fieldProofPayload] =
        await Promise.all([
          fetchPublicConfig(),
          fetchPlayerGame(
            user,
            { offlinePack: true },
          ),
          fetchFieldProofs(user).catch(() => ({ proofs: [] })),
        ])

      const fieldProofs = Array.isArray(fieldProofPayload.proofs)
        ? fieldProofPayload.proofs
        : []""",
    'descarga conjunta',
)
m = exact(
    m,
    """      await cachePlayerShell(
        `/player/${encodeURIComponent(user)}`
      )

      const tiles =
        await cacheMissionMapTiles(
          game.stages || [],
        )

      setTileCount(tiles.cached)

      setMessage(
        `${pack.stage_count} nodos · ` +
        `${tiles.cached} teselas listas`,
      )""",
    """      cacheFieldProofs(user, fieldProofs)

      await Promise.all([
        cachePlayerShell(
          `/player/${encodeURIComponent(user)}`
        ),
        cacheMissionMapTiles(
          game.stages || [],
        ),
        cacheFieldProofAssets(fieldProofs),
      ])

      setMessage(
        `Juego offline preparado · ${pack.stage_count} nodos`,
      )""",
    'cache conjunto',
)
mission_return = r'''  const statusLabel = downloaded
    ? online
      ? 'PREPARADO'
      : 'OFFLINE LISTO'
    : online
      ? 'POR PREPARAR'
      : 'SIN CONEXIÓN'

  return (
    <section style={card}>
      <div style={topRow}>
        <div style={titleBlock}>
          <span style={eyebrow}>JUEGO OFFLINE</span>
          <strong style={title}>Preparar para jugar</strong>
          <small style={description}>
            Incluye misión, mapa, juegos y fotografías visibles en el mapa.
          </small>
        </div>
        <span style={downloaded ? readyBadge : online ? pendingBadge : offlineBadge}>
          {statusLabel}
        </span>
      </div>

      <button
        type="button"
        style={primary}
        disabled={busy || !online}
        onClick={download}
      >
        {action === 'download'
          ? 'Preparando todo…'
          : downloaded
            ? 'Actualizar juego offline'
            : 'Preparar juego offline'}
      </button>

      <div style={actions}>
        <button type="button" style={secondary} disabled={busy} onClick={save}>
          {action === 'save' ? 'Guardando…' : 'Guardar progreso'}
        </button>
        <button
          type="button"
          style={secondary}
          disabled={busy || !online || pending === 0}
          onClick={sync}
        >
          {action === 'sync'
            ? 'Sincronizando…'
            : pending > 0
              ? `Sincronizar (${pending})`
              : 'Todo al día'}
        </button>
      </div>

      {message ? <div style={error ? messageError : messageOk}>{message}</div> : null}
    </section>
  )'''
m = section(m, '  return (\n    <section style={card}>', '\n}\n\nconst card: CSSProperties =', mission_return, 'UI misión offline')
mission_styles = r'''const card: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 13,
  borderRadius: 20,
  border: '1px solid rgba(96,165,250,.20)',
  background: 'linear-gradient(145deg, rgba(30,64,175,.17), rgba(15,23,42,.62))',
}
const topRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }
const titleBlock: CSSProperties = { display: 'grid', gap: 3, minWidth: 0 }
const eyebrow: CSSProperties = { color: '#93c5fd', fontSize: 8, fontWeight: 950, letterSpacing: '0.14em' }
const title: CSSProperties = { color: '#fff', fontSize: 16, fontWeight: 950, letterSpacing: '-0.02em' }
const description: CSSProperties = { color: 'rgba(226,232,240,.70)', fontSize: 11, lineHeight: 1.35 }
const badge: CSSProperties = { minHeight: 23, display: 'inline-flex', alignItems: 'center', padding: '0 8px', borderRadius: 999, fontSize: 8, fontWeight: 950, whiteSpace: 'nowrap' }
const readyBadge: CSSProperties = { ...badge, background: 'rgba(34,197,94,.14)', border: '1px solid rgba(74,222,128,.20)', color: '#dcfce7' }
const pendingBadge: CSSProperties = { ...badge, background: 'rgba(59,130,246,.14)', border: '1px solid rgba(96,165,250,.20)', color: '#dbeafe' }
const offlineBadge: CSSProperties = { ...badge, background: 'rgba(245,158,11,.14)', border: '1px solid rgba(251,191,36,.20)', color: '#fef3c7' }
const button: CSSProperties = { minHeight: 42, borderRadius: 14, fontSize: 11, fontWeight: 950 }
const primary: CSSProperties = { ...button, border: '1px solid rgba(147,197,253,.26)', background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)', color: '#fff' }
const actions: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7 }
const secondary: CSSProperties = { ...button, minHeight: 38, border: '1px solid rgba(148,163,184,.14)', background: 'rgba(51,65,85,.66)', color: '#f8fafc' }
const messageBase: CSSProperties = { padding: '8px 10px', borderRadius: 12, fontSize: 10, fontWeight: 850 }
const messageOk: CSSProperties = { ...messageBase, background: 'rgba(34,197,94,.11)', color: '#dcfce7' }
const messageError: CSSProperties = { ...messageBase, background: 'rgba(220,38,38,.13)', color: '#fee2e2' }
'''
m = m[:m.index('const card: CSSProperties =')] + mission_styles
MISSION.write_text(m, encoding='utf-8')


# PlayerHud: panel corto, sin secciones repetidas ni estados mezclados.
h = PLAYER_HUD.read_text(encoding='utf-8')
old_tools = '''            <div style={toolsHeader}>
              <div style={toolsHeaderCopy}>
                <div style={toolsEyebrow}>CENTRO DE CAMPO</div>
                <div style={toolsTitle}>Herramientas</div>
                <div style={toolsSubtitle}>
                  Mapa sin conexión, ubicación, fotos e idioma
                </div>
              </div>

              <button
                type="button"
                aria-label="Cerrar herramientas"
                style={closeButton}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCloseTools()
                }}
              >
                ×
              </button>
            </div>

            <MissionPackPanel user={user} payload={missionPayload} />

            <div style={toolsSectionLabel}>IDIOMA</div>
            <div className="saga-tools-language-row">
              <span>{t('common.language', locale)}</span>
              <button
                type="button"
                className={locale === 'en' ? 'active' : ''}
                onClick={() => chooseLocale('en')}
              >
                EN
              </button>
              <button
                type="button"
                className={locale === 'es' ? 'active' : ''}
                onClick={() => chooseLocale('es')}
              >
                ES
              </button>
            </div>
            <div style={toolsSectionLabel}>CONTENIDO DE CAMPO</div>
            {onDownloadFieldProofs ? (
              <button
                type="button"
                style={fieldPhotoCount > 0 ? toolsButton : { ...toolsButton, opacity: 0.55, cursor: 'not-allowed' }}
                disabled={fieldPhotoCount <= 0}
                onClick={fieldPhotoCount > 0 ? onDownloadFieldProofs : undefined}
              >
                {fieldPhotoCount > 0 ? `Descargar fotos (${fieldPhotoCount})` : 'Sin fotos'}
              </button>
            ) : null}

            {onSubmitCode && currentStage && !finished ? (
              <section style={fallbackToolPanel}>'''
new_tools = '''            <div style={toolsHeader}>
              <div style={toolsHeaderCopy}>
                <div style={toolsTitle}>Herramientas</div>
                <div style={toolsSubtitle}>Offline, fotos y ayuda</div>
              </div>

              <button
                type="button"
                aria-label="Cerrar herramientas"
                style={closeButton}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCloseTools()
                }}
              >
                ×
              </button>
            </div>

            <MissionPackPanel user={user} payload={missionPayload} />

            <div style={toolsUtilityGrid}>
              {onDownloadFieldProofs ? (
                <button
                  type="button"
                  style={fieldPhotoCount > 0 ? toolsButton : { ...toolsButton, opacity: 0.55, cursor: 'not-allowed' }}
                  disabled={fieldPhotoCount <= 0}
                  onClick={fieldPhotoCount > 0 ? onDownloadFieldProofs : undefined}
                >
                  {fieldPhotoCount > 0 ? `Descargar fotos (${fieldPhotoCount})` : 'Sin fotos para descargar'}
                </button>
              ) : null}

              <button
                type="button"
                style={toolsButton}
                onClick={() => {
                  onRequestGps()
                  onCloseTools()
                }}
              >
                Centrar ubicación
              </button>
            </div>

            <div style={toolsCompactRow}>
              <div className="saga-tools-language-row">
                <span>{t('common.language', locale)}</span>
                <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => chooseLocale('en')}>EN</button>
                <button type="button" className={locale === 'es' ? 'active' : ''} onClick={() => chooseLocale('es')}>ES</button>
              </div>
              <a href={loginHref} style={toolsLoginLink} onClick={onCloseTools}>Entrar</a>
            </div>

            {onSubmitCode && currentStage && !finished ? (
              <section style={fallbackToolPanel}>'''
h = exact(h, old_tools, new_tools, 'bloque principal Herramientas')
old_tail = '''            <div style={toolsSectionLabel}>UBICACIÓN Y DIAGNÓSTICO</div>
            <button
              type="button"
              style={toolsButton}
              onClick={() => {
                onRequestGps()
                onCloseTools()
              }}
            >
              Reactivar / centrar GPS
            </button>

            <button
              type="button"
              style={debugEnabled ? toolsButtonDangerActive : toolsButton}
              onClick={() => {
                onToggleDebug()
                onCloseTools()
              }}
            >
              {debugEnabled ? 'Desactivar debug GPS' : 'Activar debug GPS'}
            </button>

            <a
              href={loginHref}
              style={toolsLink}
              onClick={onCloseTools}
            >
              Login
            </a>

              <div style={toolsBuildInfo}>
                <BuildInfoBadge mode="inline" />
              </div>'''
new_tail = '''            <div style={toolsSecondaryRow}>
              <button
                type="button"
                style={debugEnabled ? toolsButtonDangerActive : toolsQuietButton}
                onClick={() => {
                  onToggleDebug()
                  onCloseTools()
                }}
              >
                {debugEnabled ? 'Salir de prueba GPS' : 'Modo prueba GPS'}
              </button>
              <div style={toolsBuildInfo}>
                <BuildInfoBadge mode="inline" />
              </div>
            </div>'''
h = exact(h, old_tail, new_tail, 'cola Herramientas')
h = exact(h, "width: compact ? '100%' : 'min(100%, 520px)',", "width: compact ? '100%' : 'min(100%, 460px)',", 'ancho herramientas')
h = exact(h, "maxHeight: 'min(88dvh, 820px)',", "maxHeight: 'min(76dvh, 680px)',", 'alto herramientas')
h = exact(h, "gap: 12,\n  padding: 14,", "gap: 10,\n  padding: 12,", 'espaciado herramientas')
h = exact(h, "margin: '-14px -14px 2px',\n  padding: '16px 16px 14px',", "margin: '-12px -12px 0',\n  padding: '13px 14px 11px',", 'cabecera compacta')
h = exact(h, "const toolsEyebrow: CSSProperties = { color: '#bfdbfe', fontSize: 9, fontWeight: 950, letterSpacing: '0.16em' }\n", '', 'eliminar eyebrow')
h = exact(h, "const toolsTitle: CSSProperties = { ...sheetTitle, marginTop: 0, fontSize: 22 }", "const toolsTitle: CSSProperties = { ...sheetTitle, marginTop: 0, fontSize: 20 }", 'titulo compacto')
h = exact(h, "const toolsSubtitle: CSSProperties = { color: 'rgba(219,234,254,.76)', fontSize: 12, lineHeight: 1.35, marginTop: 2 }\nconst toolsSectionLabel: CSSProperties = { marginTop: 3, color: 'rgba(191,219,254,.74)', fontSize: 9, fontWeight: 950, letterSpacing: '0.14em' }", "const toolsSubtitle: CSSProperties = { color: 'rgba(219,234,254,.72)', fontSize: 11, lineHeight: 1.3, marginTop: 2 }\nconst toolsUtilityGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }\nconst toolsCompactRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }\nconst toolsSecondaryRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 2 }", 'estilos filas')
h = exact(h, "minHeight: 46,\n  borderRadius: 18,", "minHeight: 40,\n  borderRadius: 14,", 'boton compacto')
h = exact(h, "const toolsLink: CSSProperties = {", "const toolsLoginLink: CSSProperties = {", 'link login')
h = exact(h, "const toolsBuildInfo: CSSProperties = {", "const toolsQuietButton: CSSProperties = {\n  ...toolsButton,\n  minHeight: 34,\n  padding: '0 10px',\n  background: 'rgba(255,255,255,.04)',\n  color: 'rgba(226,232,240,.72)',\n  fontSize: 10,\n}\n\nconst toolsBuildInfo: CSSProperties = {", 'boton silencioso')
PLAYER_HUD.write_text(h, encoding='utf-8')


# GuidedNodeEditorFlow: sustituir descarga directa por estudio con diseño y validación.
g = GUIDED.read_text(encoding='utf-8')
g = exact(g, "import { useEffect, useMemo, useRef, useState } from 'react'", "import { useEffect, useMemo, useState } from 'react'", 'useRef QR')
g = exact(g, "import { QRCodeSVG } from 'qrcode.react'\n", "import QrCardStudio, {\n  getQrDesignSignature,\n  type QrCardDesign,\n} from './QrCardStudio'\n", 'import QR Studio')
g = exact(g, "  const qrWrapRef = useRef<HTMLDivElement | null>(null)\n", '', 'ref QR antiguo')
helpers = r'''function qrDesignFromConfig(config: Record<string, unknown>): QrCardDesign {
  const preset = String(config.qr_card_preset || 'clean')
  const shape = String(config.qr_card_shape || 'rounded')
  const accent = String(config.qr_card_accent || '#2563eb')
  const imageDataUrl = String(config.qr_card_image_data_url || '')

  return {
    preset: preset === 'dark' || preset === 'photo' ? preset : 'clean',
    shape: shape === 'square' ? 'square' : 'rounded',
    accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#2563eb',
    imageDataUrl,
  }
}'''
g = exact(g, """function qrPayload(stage: StageLike) {
  return String(stage.qr_payload || `SAGA1:ITEM:${qrItemId(stage)}:${qrLabel(stage)}`)
}
""", """function qrPayload(stage: StageLike) {
  return String(stage.qr_payload || `SAGA1:ITEM:${qrItemId(stage)}:${qrLabel(stage)}`)
}

${HELPER}
""".replace('${HELPER}', helpers), 'helper diseño QR')
g = exact(g, """  const config = configOf(stage)

  const customGameEditor =""", """  const config = configOf(stage)
  const qrDesign = qrDesignFromConfig(config)
  const qrDesignSignature = getQrDesignSignature(qrPayload(stage), qrDesign)
  const qrValidated = String(config.qr_validation_signature || '') === qrDesignSignature

  const customGameEditor =""", 'estado QR Studio')
g = exact(g, """    const nextConfig = {
      ...(base.config || {}),
      game_id: game.id,""", """    const nextConfig = {
      ...(base.config || {}),
      ...config,
      game_id: game.id,""", 'preservar diseño QR')
g = section(g, '  function downloadQrPng() {', '  function patchNumber(', '', 'descarga QR antigua')
g = exact(g, """                  <span>Payload QR</span>
                  <input value={qrPayload(stage)} onChange={(event) => onPatch({ qr_payload: event.target.value })} />""", """                  <span>Payload QR</span>
                  <input
                    value={qrPayload(stage)}
                    onChange={(event) => onPatch({
                      qr_payload: event.target.value,
                      config: {
                        ...config,
                        qr_validation_signature: '',
                        qr_validated_at: '',
                      },
                    })}
                  />""", 'invalidar payload')
old_qr_panel = '''              <div className="saga-guided-v4-qrpanel">
                <div className="saga-guided-v4-qrcard">
                  <div ref={qrWrapRef} className="saga-guided-v4-qrimage">
                    <QRCodeSVG value={qrPayload(stage)} size={138} level="M" includeMargin />
                  </div>
                  <strong>{selectedQr.icon} {qrLabel(stage)}</strong>
                  <small>{qrItemId(stage)}</small>
                </div>

                <div className="saga-guided-v4-qrside">
                  <label>
                    <span>Nombre visible</span>
                    <input value={qrLabel(stage)} onChange={(event) => onPatch({ physical_item_label: event.target.value, title: event.target.value })} />
                  </label>

                  <label>
                    <span>Payload</span>
                    <input value={qrPayload(stage)} onChange={(event) => onPatch({ qr_payload: event.target.value })} />
                  </label>

                  <div className="saga-guided-v4-qractions">
                    <button type="button" className="primary" onClick={saveQrCard}>Aplicar QR</button>
                    <button type="button" onClick={() => copyText(qrPayload(stage), showNotice)}>Copiar</button>
                    <button type="button" onClick={downloadQrPng}>Descargar PNG</button>
                  </div>

                  {notice ? <small className="saga-guided-v4-notice">{notice}</small> : null}
                </div>
              </div>'''
new_qr_panel = '''              <QrCardStudio
                payload={qrPayload(stage)}
                label={qrLabel(stage)}
                itemId={qrItemId(stage)}
                typeLabel={selectedQr.title}
                design={qrDesign}
                validationSignature={String(config.qr_validation_signature || '')}
                onDesignChange={(design) => onPatch({
                  config: {
                    ...config,
                    qr_card_preset: design.preset,
                    qr_card_shape: design.shape,
                    qr_card_accent: design.accent,
                    qr_card_image_data_url: design.imageDataUrl,
                    qr_validation_signature: '',
                    qr_validated_at: '',
                  },
                })}
                onValidated={(signature) => onPatch({
                  config: {
                    ...config,
                    qr_validation_signature: signature,
                    qr_validated_at: new Date().toISOString(),
                  },
                })}
                onApply={saveQrCard}
              />'''
g = exact(g, old_qr_panel, new_qr_panel, 'panel QR Studio')
g = exact(g, """              <article><b>Fallback</b><span>{fallbackCode(stage)}</span></article>
            </div>""", """              <article><b>Fallback</b><span>{fallbackCode(stage)}</span></article>
              {mode === 'qr' ? (
                <article>
                  <b>Validación QR</b>
                  <span>{qrValidated ? 'Validado para este diseño' : 'Pendiente de validar'}</span>
                </article>
              ) : null}
            </div>""", 'resumen validación')
GUIDED.write_text(g, encoding='utf-8')

print('OK patch v0.5.4 Tools + QR Studio')
