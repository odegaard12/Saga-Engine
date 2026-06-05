# #233 — Mobile UX rescue audit v1

Generated: `2026-06-05T12:08:40Z`
Branch: `ux/mobile-rescue-v1`
HEAD: `cbab20b frontend: show deployed version commit`

> Scope: read-only mobile UX audit. No production deploy, no container restart, no data mutation.

## Executive summary

- User-visible issue: admin mobile bottom toolbar/badge area overlaps or feels cramped.
- User-visible issue: player build badge is now acceptable only inside Herramientas, not floating.
- User-visible issue: admin editor is usable, but QR/node panels need close-button review.
- Goal for this PR: small mobile rescue, not a full admin redesign and not gameplay changes.

## Priority files

| Lines | File |
| ---: | --- |
| 1041 | `frontend/src/login/LoginApp.tsx` ✅ |
| 3337 | `frontend/src/admin/AdminApp.tsx` ✅ |
| 3191 | `frontend/src/admin/styles/admin-modern-shell.css` ✅ |
| 1026 | `frontend/src/admin/components/NodeDetailDrawer.tsx` ✅ |
| 578 | `frontend/src/admin/components/NodePhysicalTypePanel.tsx` ✅ |
| 516 | `frontend/src/admin/components/AdminMissionControlShell.tsx` ✅ |
| 1659 | `frontend/src/player/PlayerApp.tsx` ✅ |
| 930 | `frontend/src/player/components/PlayerHud.tsx` ✅ |
| 248 | `frontend/src/styles/mobile-shell.css` ✅ |
| 89 | `frontend/src/shared/build-info-badge.css` ✅ |

## Mobile-risk scan

### `frontend/src/login/LoginApp.tsx`

| Line | Snippet |
| ---: | --- |
| 147 | `label: 'Jugadores',` |
| 223 | `detail: `${summary.ready_count}/${summary.profile_count} jugadores preparados`,` |
| 271 | `const message = error instanceof Error ? error.message : 'Sin conexión y sin jugadores preparados offline.'` |
| 310 | `setOfflinePrepProgress({ label: summary.failed_count > 0 ? 'Parcial' : 'Listo', done: 100, total: 100, detail: `${summary.ready_count}/${summary.profile_count} jugadores · mapa/fotos actualizados` })` |
| 313 | `? `Preparado parcialmente: ${summary.ready_count}/${summary.profile_count} jugadores.`` |
| 314 | `: `Modo offline listo: ${summary.ready_count}/${summary.profile_count} jugadores · mapa/fotos actualizados.`` |
| 386 | `? 'calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(env(safe-area-inset-bottom, 0px) + 24px)'` |
| 437 | `? `${offlineVault.ready_count}/${offlineVault.profile_count} jugadores listos · ${formatOfflineVaultAge(offlineVault)}`` |
| 573 | `minHeight: '100dvh',` |
| 575 | `overflowX: 'hidden',` |
| 604 | `const backGlowBottom: CSSProperties = {` |
| 686 | `marginBottom: 8,` |
| 815 | `overflow: 'hidden',` |
| 949 | `overflow: 'hidden',` |
| 959 | `overflow: 'hidden',` |
| 960 | `textOverflow: 'ellipsis',` |
| 970 | `const identityBottom: CSSProperties = {` |
| 993 | `overflow: 'hidden',` |
| 994 | `textOverflow: 'ellipsis',` |

### `frontend/src/admin/AdminApp.tsx`

| Line | Snippet |
| ---: | --- |
| 6 | `import NodeDetailDrawer from './components/NodeDetailDrawer'` |
| 50 | `type CmsPanel = 'none' \| 'players' \| 'mission' \| 'labels' \| 'builder' \| 'builder'` |
| 802 | `setLocalNotice(`Plantilla "${template.title}" creada en local. Revisa los nodos y pulsa Guardar.`)` |
| 835 | `locked: 'Move closer to unlock this node.',` |
| 1112 | `min-height: 100vh;` |
| 1124 | `min-height: calc(100vh - 28px);` |
| 1144 | `overflow: auto;` |
| 1206 | `.admin-drawer-head button {` |
| 1286 | `overflow: hidden;` |
| 1453 | `overflow: auto;` |
| 1576 | `.admin-drawer-overlay {` |
| 1577 | `position: fixed;` |
| 1579 | `z-index: 50;` |
| 1586 | `.admin-drawer {` |
| 1588 | `height: 100%;` |
| 1589 | `overflow: auto;` |
| 1595 | `.admin-drawer-head {` |
| 1598 | `z-index: 2;` |
| 1603 | `border-bottom: 1px solid rgba(148,163,184,0.18);` |
| 1608 | `.admin-drawer-head h2 {` |
| 1615 | `.admin-drawer-body {` |
| 1668 | `@media (max-width: 1100px) {` |
| 1684 | `@media (max-width: 700px) {` |
| 1703 | `min-height: 100vh;` |
| 1721 | `z-index: 2;` |
| 1827 | `z-index: 1;` |
| 1846 | `bottom: -82px;` |
| 1850 | `@media (max-width: 700px) {` |
| 1868 | `height: 100vh;` |
| 1869 | `overflow: hidden;` |
| 1880 | `height: calc(100vh - 20px);` |
| 1940 | `.admin-root:not(.admin-root-login-only) .admin-drawer-head button {` |
| 1999 | `height: 100%;` |
| 2007 | `height: 100% !important;` |
| 2017 | `overflow: hidden;` |
| 2023 | `max-height: calc(100vh - 220px);` |
| 2024 | `overflow: auto;` |
| 2107 | `.admin-root:not(.admin-root-login-only) .admin-drawer-overlay {` |
| 2112 | `.admin-root:not(.admin-root-login-only) .admin-drawer {` |
| 2120 | `.admin-root:not(.admin-root-login-only) .admin-drawer-head {` |
| 2137 | `@media (max-width: 1200px) {` |
| 2140 | `overflow: auto;` |
| 2157 | `max-height: none;` |
| 2161 | `@media (max-width: 760px) {` |
| 2249 | `max-height: calc(100vh - 168px);` |
| 2336 | `.admin-root:not(.admin-root-login-only) .admin-drawer {` |
| 2340 | `@media (min-width: 1500px) {` |
| 2350 | `@media (max-width: 1200px) {` |
| 2359 | `height: 100vh;` |
| 2360 | `overflow: hidden;` |
| 2369 | `height: calc(100vh - 20px) !important;` |
| 2378 | `height: 100% !important;` |
| 2380 | `overflow: auto !important;` |
| 2511 | `max-height: 320px;` |
| 2512 | `overflow: auto;` |
| 2572 | `height: 100% !important;` |
| 2587 | `height: 100% !important;` |
| 2595 | `height: 100% !important;` |
| 2598 | `overflow: hidden !important;` |
| 2608 | `.admin-root:not(.admin-root-login-only) .admin-drawer {` |
| 2617 | `.admin-root:not(.admin-root-login-only) .admin-drawer-head,` |
| 2618 | `.admin-root:not(.admin-root-login-only) .admin-drawer-body {` |
| 2635 | `@media (max-width: 1180px) {` |
| 2638 | `overflow: auto;` |
| 2657 | `/* Local CMS actions and editable drawer pass */` |
| 2740 | `.admin-drawer-editable .admin-drawer-body {` |
| 2829 | `@media (max-width: 620px) {` |
| 2938 | `max-height: 44vh;` |
| 2963 | `.admin-drawer-editable .admin-drawer-head h2 {` |
| 2971 | `@media (max-width: 760px) {` |
| 3066 | `/* Non-blocking map editor drawer */` |
| 3067 | `.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking {` |
| 3074 | `.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking .admin-drawer {` |
| 3078 | `.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::before,` |
| 3079 | `.admin-root:not(.admin-root-login-only) .admin-drawer-overlay--nonblocking::after {` |
| 3084 | `.admin-root:not(.admin-root-login-only) .admin-drawer {` |
| 3090 | `.admin-root:not(.admin-root-login-only) .admin-drawer-head {` |
| 3137 | `@media (max-width: 760px) {` |
| 3147 | `max-height: 52vh;` |
| 3148 | `overflow: auto;` |
| … | `6 more matches omitted` |

### `frontend/src/admin/styles/admin-modern-shell.css`

| Line | Snippet |
| ---: | --- |
| 12 | `position: fixed;` |
| 15 | `height: 100vh;` |
| 16 | `overflow: hidden;` |
| 27 | `position: fixed;` |
| 29 | `z-index: 1;` |
| 31 | `height: 100vh;` |
| 32 | `overflow: hidden;` |
| 43 | `height: 100% !important;` |
| 44 | `min-height: 100% !important;` |
| 74 | `position: fixed;` |
| 75 | `z-index: 30;` |
| 77 | `bottom: 16px;` |
| 90 | `overflow: hidden;` |
| 136 | `margin-bottom: 7px;` |
| 199 | `.admin-drawer-tab {` |
| 219 | `.admin-drawer-tab:hover {` |
| 283 | `overflow-y: auto;` |
| 284 | `overflow-x: hidden;` |
| 328 | `overflow: hidden;` |
| 329 | `text-overflow: ellipsis;` |
| 354 | `position: fixed;` |
| 355 | `z-index: 25;` |
| 428 | `position: fixed;` |
| 429 | `z-index: 32;` |
| 431 | `bottom: 18px;` |
| 448 | `position: fixed;` |
| 449 | `z-index: 50;` |
| 451 | `bottom: 28px;` |
| 456 | `overflow: hidden;` |
| 471 | `border-bottom: 1px solid rgba(148, 163, 184, 0.14);` |
| 487 | `overflow-y: auto;` |
| 488 | `overflow-x: hidden;` |
| 562 | `max-height: none !important;` |
| 563 | `overflow: visible !important;` |
| 587 | `overflow: hidden;` |
| 591 | `text-overflow: ellipsis;` |
| 745 | `position: fixed;` |
| 746 | `z-index: 40;` |
| 749 | `bottom: 16px;` |
| 751 | `overflow: hidden;` |
| 758 | `.saga-inspector .admin-drawer-overlay {` |
| 762 | `height: 100% !important;` |
| 767 | `.saga-inspector .admin-drawer {` |
| 771 | `height: 100% !important;` |
| 778 | `overflow: hidden !important;` |
| 781 | `.saga-inspector .admin-drawer-head {` |
| 785 | `z-index: 3;` |
| 790 | `border-bottom: 1px solid rgba(148, 163, 184, 0.12);` |
| 794 | `.saga-inspector .admin-drawer-head h2 {` |
| 802 | `.saga-inspector .admin-drawer-head button {` |
| 814 | `.admin-drawer-head-copy {` |
| 820 | `.admin-drawer-meta {` |
| 826 | `.admin-drawer-meta span {` |
| 837 | `.admin-drawer-tabs {` |
| 842 | `overflow-x: auto;` |
| 843 | `overflow-y: hidden;` |
| 845 | `border-bottom: 1px solid rgba(148, 163, 184, 0.12);` |
| 849 | `.admin-drawer-tabs::-webkit-scrollbar {` |
| 853 | `.admin-drawer-tab {` |
| 858 | `.admin-drawer-tab.active {` |
| 864 | `.admin-drawer-body--modern,` |
| 865 | `.saga-inspector .admin-drawer-body {` |
| 868 | `overflow-y: auto;` |
| 869 | `overflow-x: hidden;` |
| 891 | `margin-bottom: 14px;` |
| 938 | `.admin-drawer-footer {` |
| 955 | `overflow: hidden;` |
| 962 | `text-overflow: ellipsis;` |
| 974 | `@media (max-width: 860px) {` |
| 977 | `height: 100svh;` |
| 984 | `bottom: auto;` |
| 987 | `max-height: 74px;` |
| 990 | `overflow: hidden;` |
| 1024 | `bottom: 74px;` |
| 1031 | `position: fixed;` |
| 1032 | `z-index: 70;` |
| 1035 | `bottom: 8px;` |
| 1056 | `bottom: 66px;` |
| 1149 | `bottom: -12px;` |
| 1150 | `z-index: 4;` |
| … | `159 more matches omitted` |

### `frontend/src/admin/components/NodeDetailDrawer.tsx`

| Line | Snippet |
| ---: | --- |
| 18 | `type DrawerTab = 'basics' \| 'location' \| 'game' \| 'requirement' \| 'messages' \| 'advanced'` |
| 57 | `type NodeDetailDrawerProps = {` |
| 60 | `onClose: () => void` |
| 188 | `export default function NodeDetailDrawer({` |
| 191 | `onClose,` |
| 198 | `}: NodeDetailDrawerProps) {` |
| 200 | `const [activeTab, setActiveTab] = useState<DrawerTab>('basics')` |
| 352 | `<div className="admin-drawer-overlay admin-drawer-overlay--nonblocking" role="presentation">` |
| 354 | `className="admin-drawer admin-drawer-editable"` |
| 356 | `aria-modal="true"` |
| 360 | `<div className="admin-drawer-head admin-drawer-head--modern admin-node-editor-topbar">` |
| 366 | `className="admin-node-editor-close"` |
| 367 | `onClick={onClose}` |
| 369 | `Cerrar` |
| 377 | `<div className="admin-drawer-meta admin-node-editor-meta">` |
| 403 | `<div className="admin-drawer-tabs admin-node-editor-tabs" role="tablist" aria-label="Node editor tabs">` |
| 406 | `className={activeTab === 'basics' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}` |
| 413 | `className={activeTab === 'location' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}` |
| 420 | `className={activeTab === 'game' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}` |
| 427 | `className={activeTab === 'requirement' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}` |
| 434 | `className={activeTab === 'messages' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}` |
| 441 | `className={activeTab === 'advanced' ? 'admin-drawer-tab active' : 'admin-drawer-tab'}` |
| 448 | `<div className="admin-drawer-body admin-drawer-body--modern">` |
| 629 | `className="admin-node-editor-close"` |
| 768 | `<option value="inventory_only">Guardar en mochila</option>` |
| 809 | `This panel updates local draft state immediately. Use Save in Mission Control to persist.` |
| 1011 | `<div className="admin-drawer-footer">` |
| 1016 | `<div className="admin-drawer-footer-actions">` |
| 1017 | `<button type="button" className="admin-cms-side-action" onClick={onClose}>` |
| 1018 | `Close` |

### `frontend/src/admin/components/NodePhysicalTypePanel.tsx`

| Line | Snippet |
| ---: | --- |
| 440 | `overflow: 'hidden',` |

### `frontend/src/admin/components/AdminMissionControlShell.tsx`

| Line | Snippet |
| ---: | --- |
| 4 | `import NodeDetailDrawer from './NodeDetailDrawer'` |
| 8 | `import MissionBuilderPanel from './MissionBuilderPanel'` |
| 16 | `type CmsPanel = 'none' \| 'players' \| 'mission' \| 'labels' \| 'builder' \| 'builder'` |
| 186 | `<button type="button" className="saga-primary-action" onClick={() => togglePanel('builder')}>` |
| 302 | `<button type="button" className="saga-command-primary" onClick={() => togglePanel('builder')}>` |
| 378 | `<NodeDetailDrawer` |
| 381 | `onClose={() => onSelectStage(null)}` |
| 396 | `<strong>{cmsPanel === 'players' ? 'Players' : cmsPanel === 'labels' ? 'Families' : cmsPanel === 'builder' ? 'Crear' : 'Mission settings'}</strong>` |
| 397 | `<button type="button" onClick={() => onSetCmsPanel('none')}>Close</button>` |
| 401 | `{cmsPanel === 'builder' ? (` |
| 402 | `<MissionBuilderPanel` |
| 444 | `<button type="button" onClick={() => togglePanel('builder')}>+ Node</button>` |
| 446 | `<button type="button" onClick={() => togglePanel('builder')}>Builder</button>` |

### `frontend/src/player/PlayerApp.tsx`

| Line | Snippet |
| ---: | --- |
| 335 | `function closeQrIfPhysicalScannerNoLongerReachable() {` |
| 346 | `window.dispatchEvent(new CustomEvent('saga:close-qr-scanner'))` |
| 352 | `window.dispatchEvent(new CustomEvent('saga:close-qr-scanner'))` |
| 356 | `closeQrIfPhysicalScannerNoLongerReachable()` |
| 537 | `closeTools()` |
| 547 | `showNotice('Activa GPS o usa modo debug para guardar la foto en el mapa.', 'warn')` |
| 576 | `showNotice('No hay posición para guardar la foto.', 'warn')` |
| 621 | `function closeTools() {` |
| 631 | `function closeTeam() {` |
| 641 | `window.dispatchEvent(new CustomEvent('saga:close-qr-scanner'))` |
| 824 | `? 'Permiso de ubicación denegado. En iPhone revisa Ajustes > Safari > Ubicación, o elimina y vuelve a añadir la PWA.'` |
| 942 | `? 'Too far away. Move closer to the node.'` |
| 1093 | `onClose={() => setSelectedFieldProofs([])}` |
| 1100 | `onClose={() => setFieldCameraOpen(false)}` |
| 1137 | `aria-label="Jugadores"` |
| 1196 | `onCloseTools={closeTools}` |
| 1212 | `onClose={closeTeam}` |
| 1223 | `onClose={() => {` |
| 1235 | `bottom: 'calc(env(safe-area-inset-bottom, 0px) + 176px)',` |
| 1274 | `overflow: 'hidden',` |
| 1323 | `bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 138px)' : 148,` |
| 1354 | `min-height: 100%;` |
| 1356 | `overflow: hidden;` |
| 1388 | `minHeight: mobile ? '100dvh' : '100svh',` |
| 1389 | `height: mobile ? '100dvh' : 'auto',` |
| 1394 | `overflow: 'hidden',` |
| 1467 | `height: mobile ? '100dvh' : 'calc(100svh - 24px)',` |
| 1468 | `minHeight: mobile ? '100dvh' : 620,` |
| 1469 | `maxHeight: mobile ? '100dvh' : 980,` |
| 1471 | `overflow: 'hidden',` |
| 1491 | `top: mobile ? 'calc(env(safe-area-inset-top, 0px) + 10px)' : 12,` |
| 1505 | `bottom: mobile ? 'calc(env(safe-area-inset-bottom, 0px) + 154px)' : 176,` |
| 1519 | `bottom: mobile ? 0 : 12,` |

### `frontend/src/player/components/PlayerHud.tsx`

| Line | Snippet |
| ---: | --- |
| 37 | `onCloseTools: () => void` |
| 87 | `onCloseTools,` |
| 258 | `{detailsOpen ? 'Cerrar mochila' : 'Mochila'}` |
| 266 | `{toolsOpen ? t('player.tools.close', locale) : 'Herramientas'}` |
| 280 | `aria-modal="true"` |
| 292 | `aria-label="Cerrar mochila"` |
| 293 | `style={closeButton}` |
| 348 | `<div style={toolsBackdrop} onClick={onCloseTools} />` |
| 355 | `aria-modal="true"` |
| 367 | `aria-label="Cerrar herramientas"` |
| 368 | `style={closeButton}` |
| 372 | `onCloseTools()` |
| 455 | `onCloseTools()` |
| 466 | `onCloseTools()` |
| 475 | `onClick={onCloseTools}` |
| 660 | `padding: '0 10px calc(8px + env(safe-area-inset-bottom, 0px))',` |
| 678 | `overflowY: 'auto',` |
| 679 | `overflowX: 'hidden',` |
| 690 | `paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',` |
| 706 | `borderBottom: '1px solid rgba(255,255,255,.10)',` |
| 785 | `padding: '0 10px calc(8px + env(safe-area-inset-bottom, 0px))',` |
| 804 | `const closeButton: CSSProperties = {` |

### `frontend/src/styles/mobile-shell.css`

| Line | Snippet |
| ---: | --- |
| 10 | `min-height: 100%;` |
| 11 | `height: 100%;` |
| 16 | `overflow: hidden;` |
| 27 | `@supports (height: 100dvh) {` |
| 31 | `min-height: 100dvh;` |
| 32 | `height: 100dvh;` |
| 36 | `@media (max-width: 560px) {` |
| 45 | `--saga-safe-top: env(safe-area-inset-top, 0px);` |
| 46 | `--saga-safe-right: env(safe-area-inset-right, 0px);` |
| 47 | `--saga-safe-bottom: env(safe-area-inset-bottom, 0px);` |
| 48 | `--saga-safe-left: env(safe-area-inset-left, 0px);` |
| 52 | `min-height: 100dvh;` |
| 55 | `padding-bottom: var(--saga-safe-bottom);` |
| 60 | `/* i18n fast pass: keep global toggle out of player and avoid admin drawer overlap */` |
| 62 | `z-index: 5500;` |
| 67 | `right: max(10px, env(safe-area-inset-right, 0px)) !important;` |
| 68 | `bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;` |
| 73 | `right: max(10px, env(safe-area-inset-right, 0px)) !important;` |
| 74 | `bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;` |
| 125 | `right: max(10px, env(safe-area-inset-right, 0px)) !important;` |
| 126 | `bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;` |
| 133 | `right: max(10px, env(safe-area-inset-right, 0px)) !important;` |
| 134 | `bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;` |

### `frontend/src/shared/build-info-badge.css`

| Line | Snippet |
| ---: | --- |
| 25 | `position: fixed;` |
| 26 | `right: max(10px, env(safe-area-inset-right));` |
| 27 | `bottom: max(10px, env(safe-area-inset-bottom));` |
| 28 | `z-index: 2147483000;` |
| 68 | `overflow: hidden;` |
| 73 | `text-overflow: ellipsis;` |
| 77 | `@media (max-width: 560px) {` |
| 79 | `right: max(10px, env(safe-area-inset-right));` |
| 80 | `bottom: max(8px, env(safe-area-inset-bottom));` |

## Proposed #233 small fixes

1. Admin mobile bottom bar: reserve bottom padding and avoid overlap with editor/drawer content.
2. Admin bottom actions: improve wrapping/spacing on narrow screens.
3. Login mobile: keep current improved look, but verify no fixed badge overlaps form.
4. QR/node drawers: ensure close button is visible, tappable, sticky/safe-area aware.
5. Player: keep build info inside Herramientas; no floating badge in player.

## Not included

- No new minigames.
- No gameplay changes.
- No large monolith refactor.
- No production deploy before visual testing.

## After #233

- Demo/config cleanup.
- Gameplay validation matrix.
- Real demo mission.
- README/release.
- Then new minigames.
- Monolith refactor after gameplay is validated enough to detect regressions.

## Implemented in this PR

- Added a mobile rescue CSS pass in `frontend/src/admin/styles/admin-modern-shell.css`.
- Reserves extra bottom safe-area space in admin mobile.
- Compacts bottom/admin action bars on narrow screens.
- Keeps drawer/node editor headers sticky and close buttons tappable.
- Hides the floating build badge on admin mobile to avoid overlap.
- Leaves player build info inside Herramientas.
- Does not change gameplay, event sync, mission data, or minigames.

## Follow-up still required

- Manual mobile review on real phone for:
  - bottom admin toolbar;
  - QR physical node panel;
  - normal node editor close button;
  - map/editor panel scrolling;
  - login/admin unlock screen.
- If this pass is acceptable, next work should be demo/config cleanup and gameplay validation matrix.

## Follow-up adjustment v2 from mobile test

Manual test on phone found these issues:

- Admin map zoom buttons `+ / −` are distracting on mobile/admin.
- Map tap is too sensitive and can create nodes accidentally.
- “Nodo creado desde el mapa…” notice overlaps the bottom bar.
- QR/node drawer close affordance is not visible enough on phone.

Implemented v2:

- Hide Leaflet zoom controls inside admin.
- Remove the map-created success notice.
- Add a coarse-pointer/mobile guard to avoid accidental map-created nodes on phone.
- Strengthen mobile drawer close button visibility/tap size.

## Follow-up adjustment v3 from visual test

The previous mobile pass was deployed but the visible changes were not obvious enough on the public domain/mobile browser.

Implemented v3:

- Stronger Leaflet zoom-control hiding selectors.
- Attempted JS-level `zoomControl: false` for admin map where possible.
- Hides admin map hint overlays on mobile/coarse pointer.
- Stronger sticky/tappable close button styling for node/QR drawers.
- Added domain/local CSS verification step to distinguish stale browser cache from missing deployed assets.

If the version is correct but the phone still shows old UI, clear site data/service worker cache or test in private mode.

## Follow-up adjustment v3

The previous phone test still showed old-looking admin controls. This pass makes the cleanup explicit:

- Hide Leaflet zoom controls with stronger selectors.
- Try JS-level `zoomControl: false` in admin map.
- Hide admin map hint overlays.
- Keep mobile/coarse pointer guard against accidental map-created nodes.
- Strengthen QR/node drawer close button visibility.
- Verify served CSS contains the #233 marker after deploy.

## Follow-up adjustment v4 from second mobile test

Manual test after v3 confirmed that changes are visible, but the UI still has product problems:

- `+ Node` is unsafe on mobile because node placement must not happen accidentally.
- Better future flow: tap `+ Node` -> create a draggable pending pin -> confirm with second tap/button.
- QR/physical node close affordance still needs to be highly visible.
- Drawer footer/action buttons can be hidden or feel lost behind the bottom admin bar.

Implemented v4:

- Hide direct node creation entry points on mobile/coarse pointer for now.
- Keep map-tap node creation blocked on mobile/coarse pointer.
- Keep Leaflet zoom controls hidden in admin.
- Strengthen drawer/footer action visibility.
- Strengthen node/QR drawer close button visibility.
- Document future `safe staged pin placement` as a separate PR, not part of this CSS rescue.

## Follow-up adjustment v5 from QR editor test

Manual test still showed:

- `+ Node` in the admin bottom dock.
- No obvious close button in the physical QR node editor on mobile.

Implemented v5:

- Removed the real `+ Node` button from `AdminMissionControlShell.tsx`.
- Added a real mobile-only `Cerrar ×` button inside `NodeDetailDrawer.tsx`.
- Gave the mobile close button fixed positioning and very high z-index so it cannot be hidden by the QR editor, drawer header, or bottom dock.
- Kept future safe node placement as a separate product PR.

## Follow-up adjustment v6b

The first v6 insertion looked for an exact `return` block and failed because the drawer markup had already changed.

Implemented v6b:

- Inserts `admin-node-editor-global-close` using a flexible regex against the drawer overlay div.
- Makes the close button always visible, not only under mobile media queries.
- Hides older close variants on mobile so the new fixed `Cerrar ×` is the only close affordance.

## Follow-up adjustment v7 from QR editor close test

Manual test still did not show a visible close affordance in physical QR node editor.

Implemented v7:

- Adds `AdminDrawerGlobalCloseButton`, rendered from `App.tsx` only on admin.
- The button lives outside the drawer DOM, so it is not hidden by drawer/header/footer stacking.
- It observes the DOM and appears when an admin drawer/editor is open.
- On click, it triggers the existing drawer close button internally.
- This is a mobile rescue guardrail; a cleaner admin drawer refactor remains future work.

## Follow-up adjustment v8

Manual test still did not show the close button in the physical QR editor.

Implemented v8:

- Removed drawer-detection logic from `AdminDrawerGlobalCloseButton`.
- The global `Cerrar ×` button is now always rendered on admin.
- It lives outside the drawer DOM, above all admin content.
- On click, it tries existing internal close buttons, then Escape, then Builder fallback.
- This is intentionally blunt so mobile admin has a reliable escape hatch.

## Follow-up adjustment v9 from design review

The forced global red close button was visible but visually wrong: it appeared outside the editor/card on desktop and mobile.

Implemented v9:

- Removed `AdminDrawerGlobalCloseButton` rendering from `App.tsx`.
- Hid previous global/mobile close experiments.
- Reworked `NodeDetailDrawer` close affordance as an integrated `Cerrar ×` pill inside the editor topbar.
- Polished drawer/sheet sizing, header, body padding and footer actions for mobile.
- Kept previous fixes: no `+ Node`, no Leaflet `+ / −`, no map-created popup.

## Follow-up adjustment v10 from integrated editor review

The v7/v8 global close solved visibility but looked wrong because it floated outside the editor/card. v9 still did not reliably show the integrated close.

Implemented v10:

- Removed global close rendering from `App.tsx`.
- Removed/disabled previous global/mobile close experiments.
- Inserted a new `admin-node-editor-inline-topbar` directly inside the real `admin-drawer admin-drawer-editable` element.
- The topbar contains the integrated `Cerrar ×` button and is sticky inside the editor/card.
- The previous drawer header becomes content header only.
- Kept previous fixes: no `+ Node`, no Leaflet `+ / −`, no map-created popup.

## Follow-up adjustment v11b

The previous v11 command aborted before patching because it searched for a root `<div>` but the real `NodePhysicalTypePanel` root is `<section style={panel} aria-label="Tipo de nodo">`.

Extra finding:

- A previous mobile CSS rule hid buttons whose `aria-label` or `title` contained `nodo`, which could also hide close/editor controls.
- v11b removes the Spanish `nodo` catch-all hide selector and uses `aria-label="Cerrar editor físico"`.

Implemented v11b:

- Adds optional `onClose` to `NodePhysicalTypePanel`.
- Inserts `saga-physical-editor-topbar` directly inside the real physical QR panel root `<section>`.
- Passes `onClose={() => onSelectStage(null)}` from the physical-node branch in `AdminMissionControlShell`.
- Adds a visible, sticky `Cerrar ×` button inside the physical QR panel.

## Follow-up adjustment v12: duplicate cleanup and consolidated CSS

The duplicate audit showed the physical QR editor had too many repeated headings:

- `Editor físico / Nodo QR físico`
- `TIPO DE NODO / Nodo QR físico`
- `QR FÍSICO`
- `Editor de nodo físico QR`
- `Datos físicos / Sin opciones de minijuego`
- `QR DEL NODO / Tarjeta física`

Implemented v12:

- The physical editor now keeps one main topbar with close and stage title.
- The `TIPO DE NODO` header is only shown in the chooser flow, not in the editor flow.
- The edit bar now says `Configuración física`.
- The details section now says `Datos del objeto`.
- The QR card section now says `TARJETA QR / QR imprimible`.
- `Guardar QR en nodo` becomes `Aplicar QR al nodo`.
- All accumulated #233 CSS experiment blocks were replaced by one consolidated block.
- Confirmed previous behavior remains: no `+ Node`, no Leaflet `+ / −`, no map-created popup.

## Follow-up adjustment v13b: repair failed JSX patch

The v13 attempt broke `AdminMissionControlShell.tsx` by inserting `className="saga-admin-add-node-action"` inside a `disabled={...}` expression.

Implemented v13b:

- Restored `AdminMissionControlShell.tsx` from HEAD to remove the broken JSX.
- Kept the successful `NodePhysicalTypePanel` cleanup where `TIPO DE NODO` is limited to chooser mode.
- Avoided fragile JSX rewriting for add-node controls.
- Hid the main add-node entry points through safer CSS selectors.
- Re-applied strong Leaflet zoom-control hiding.

## Follow-up adjustment v14b: safe discard/delete for accidental local nodes

Manual test confirmed that accidental local nodes are dangerous because pressing Save persists them.

Implemented v14b:

- Direct map click/tap no longer creates nodes.
- Leaflet zoom control creation is removed from `AdminMissionMap`.
- Quick add-node buttons are hidden until #234 introduces a safe staged pin flow.
- `NodePhysicalTypePanel` now receives `onDeleteLocal`.
- Physical QR editor topbar shows a visible `Descartar` button for local unsaved nodes, or `Eliminar` for existing nodes.
- Delete/discard uses existing `onDeleteStage` / `deleteLocalStage` flow, so it does not invent a second deletion path.
