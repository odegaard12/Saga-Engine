# #233 v4 — Admin mobile controls exact audit

Generated: 2026-06-05T12:59:09Z
Branch: ux/mobile-rescue-v1
HEAD: 4196575 frontend: improve admin mobile usability

## Searches

### Buttons and labels
frontend/src/admin/components/MissionBuilderPanel.tsx:26:          <strong>Crear nodo suelto</strong>
frontend/src/admin/components/PhysicalQrCardsPanel.tsx:182:          Guardar QR en nodo
frontend/src/admin/components/AdminMissionControlShell.tsx:368:                    if (window.confirm(`Eliminar nodo "${liveSelectedStage.title || 'Sin título'}"? Guarda después para persistir.`)) {
frontend/src/admin/components/AdminMissionControlShell.tsx:373:                  Eliminar nodo
frontend/src/admin/components/AdminMissionControlShell.tsx:444:        <button type="button" onClick={() => togglePanel('builder')}>+ Node</button>
frontend/src/admin/components/NodePhysicalTypePanel.tsx:238:            Cambiar tipo de nodo
frontend/src/admin/components/NodePhysicalTypePanel.tsx:281:              <b>Mover punto</b>
frontend/src/admin/components/NodeDetailDrawer.tsx:369:              Cerrar
frontend/src/admin/components/NodeDetailDrawer.tsx:386:                Cambiar tipo
frontend/src/admin/components/NodeDetailDrawer.tsx:392:                  if (window.confirm(`Eliminar nodo "${draft.title || 'Sin título'}"? Guarda después para persistir.`)) {
frontend/src/admin/styles/admin-modern-shell.css:3339:  .admin-root:not(.admin-root-login-only) .admin-drawer-head button[aria-label*="Cerrar"],
frontend/src/admin/styles/admin-modern-shell.css:3340:  .admin-root:not(.admin-root-login-only) .admin-drawer-head button[title*="Cerrar"],
frontend/src/i18n/index.ts:78:      close: 'Cerrar',
frontend/src/i18n/index.ts:118:        close: 'Cerrar herramientas',
frontend/src/i18n/legacySpanishBridge.ts:10:  'Close': 'Cerrar',

### Map creation / click handlers
frontend/src/admin/AdminMissionMap.tsx:12:  onCreateStageAt?: (lat: number, lon: number) => void
frontend/src/admin/AdminMissionMap.tsx:93:  onCreateStageAt,
frontend/src/admin/AdminMissionMap.tsx:108:    const map = L.map(mapRootRef.current, {
frontend/src/admin/AdminMissionMap.tsx:109:      zoomControl: false,
frontend/src/admin/AdminMissionMap.tsx:134:    if (!map || !onCreateStageAt) return
frontend/src/admin/AdminMissionMap.tsx:136:    const handleMapClick = (event: L.LeafletMouseEvent) => {
frontend/src/admin/AdminMissionMap.tsx:145:      onCreateStageAt(event.latlng.lat, event.latlng.lng)
frontend/src/admin/AdminMissionMap.tsx:148:    map.on('click', handleMapClick)
frontend/src/admin/AdminMissionMap.tsx:151:      map.off('click', handleMapClick)
frontend/src/admin/AdminMissionMap.tsx:153:  }, [onCreateStageAt])
frontend/src/admin/AdminMissionMap.tsx:206:      ring.on('click', (event: L.LeafletMouseEvent) => {
frontend/src/admin/AdminMissionMap.tsx:211:      marker.on('click', (event: L.LeafletMouseEvent) => {
frontend/src/admin/components/AdminMissionControlShell.tsx:327:            onCreateStageAt={onCreateNodeAt}

### Admin mobile classes
frontend/src/admin/AdminApp.tsx:3060:.admin-root:not(.admin-root-login-only) .admin-node-map-hint {
frontend/src/admin/components/NodeDetailDrawer.tsx:366:              className="admin-node-editor-close"
frontend/src/admin/components/NodeDetailDrawer.tsx:629:                  className="admin-node-editor-close"
frontend/src/admin/components/NodeDetailDrawer.tsx:1011:        <div className="admin-drawer-footer">
frontend/src/admin/components/NodeDetailDrawer.tsx:1016:          <div className="admin-drawer-footer-actions">
frontend/src/admin/styles/admin-modern-shell.css:938:.admin-drawer-footer {
frontend/src/admin/styles/admin-modern-shell.css:1222:  .admin-drawer-footer {
frontend/src/admin/styles/admin-modern-shell.css:2640:.admin-node-editor-close {
frontend/src/admin/styles/admin-modern-shell.css:2796:.admin-node-editor-close {
frontend/src/admin/styles/admin-modern-shell.css:3208:  .admin-root:not(.admin-root-login-only) .admin-bottom-nav,
frontend/src/admin/styles/admin-modern-shell.css:3209:  .admin-root:not(.admin-root-login-only) .admin-mobile-nav,
frontend/src/admin/styles/admin-modern-shell.css:3212:  .admin-root:not(.admin-root-login-only) .admin-action-dock,
frontend/src/admin/styles/admin-modern-shell.css:3213:  .admin-root:not(.admin-root-login-only) .admin-mission-actions {
frontend/src/admin/styles/admin-modern-shell.css:3223:  .admin-root:not(.admin-root-login-only) .admin-bottom-nav button,
frontend/src/admin/styles/admin-modern-shell.css:3224:  .admin-root:not(.admin-root-login-only) .admin-mobile-nav button,
frontend/src/admin/styles/admin-modern-shell.css:3227:  .admin-root:not(.admin-root-login-only) .admin-action-dock button,
frontend/src/admin/styles/admin-modern-shell.css:3228:  .admin-root:not(.admin-root-login-only) .admin-mission-actions button,
frontend/src/admin/styles/admin-modern-shell.css:3229:  .admin-root:not(.admin-root-login-only) .admin-bottom-nav a,
frontend/src/admin/styles/admin-modern-shell.css:3230:  .admin-root:not(.admin-root-login-only) .admin-mobile-nav a,
frontend/src/admin/styles/admin-modern-shell.css:3233:  .admin-root:not(.admin-root-login-only) .admin-action-dock a,
frontend/src/admin/styles/admin-modern-shell.css:3234:  .admin-root:not(.admin-root-login-only) .admin-mission-actions a {
frontend/src/admin/styles/admin-modern-shell.css:3283:  .admin-root:not(.admin-root-login-only) .admin-node-editor-close {
frontend/src/admin/styles/admin-modern-shell.css:3320:  .admin-root:not(.admin-root-login-only) .admin-bottom-nav button,
frontend/src/admin/styles/admin-modern-shell.css:3321:  .admin-root:not(.admin-root-login-only) .admin-mobile-nav button,
frontend/src/admin/styles/admin-modern-shell.css:3324:  .admin-root:not(.admin-root-login-only) .admin-action-dock button,
frontend/src/admin/styles/admin-modern-shell.css:3325:  .admin-root:not(.admin-root-login-only) .admin-mission-actions button {
frontend/src/admin/styles/admin-modern-shell.css:3338:  .admin-root:not(.admin-root-login-only) .admin-node-editor-close,
frontend/src/admin/styles/admin-modern-shell.css:3354:  .admin-root:not(.admin-root-login-only) .admin-node-editor-close {
frontend/src/admin/styles/admin-modern-shell.css:3416:  .admin-root:not(.admin-root-login-only) .admin-node-map-hint,
frontend/src/admin/styles/admin-modern-shell.css:3424:  .admin-root:not(.admin-root-login-only) .admin-node-editor-close {
frontend/src/admin/styles/admin-modern-shell.css:3461:.admin-root:not(.admin-root-login-only) .admin-node-map-hint,
frontend/src/admin/styles/admin-modern-shell.css:3481:  .admin-root:not(.admin-root-login-only) .admin-node-editor-close {
