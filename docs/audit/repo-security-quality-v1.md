# #229 — Repo / security / quality audit v1

Generated: `2026-06-04T20:51:44`
Branch: `audit/repo-security-quality-v1`
HEAD: `e840e4f`
Last commit: `e840e4f gameplay: add universal offline fallback codes (#228)`

> Scope: read-only repository audit. No production deploy, no container restart, no data mutation.

## 1. Repository snapshot

- Tracked files: **218**
- Code/docs files scanned: **202**
- Validation/smoke/guard scripts detected: **6**
- Docker/deploy files detected: **4**
- Service worker/offline/cache related files detected: **25**

## 2. Largest tracked files

| Size | Path |
| --- | --- |
| 89.2 KB | main.py |
| 84.8 KB | frontend/src/admin/AdminApp.tsx |
| 66.8 KB | frontend/src/admin/styles/admin-modern-shell.css |
| 66.6 KB | frontend/public/saga-app-icon-512.png |
| 47.9 KB | frontend/src/player/PlayerApp.tsx |
| 43.8 KB | frontend/src/player/components/MapSurface.tsx |
| 37.6 KB | frontend/src/admin/components/NodeDetailDrawer.tsx |
| 32.6 KB | frontend/package-lock.json |
| 29.1 KB | frontend/src/login/LoginApp.tsx |
| 25.7 KB | frontend/src/player/minigames/families/bearingHunt/RuntimeScreen.tsx |
| 24.8 KB | frontend/src/player/components/PlayerHud.tsx |
| 22.4 KB | frontend/src/player/minigames/families/signalHunt/RuntimeScreen.tsx |
| 20.1 KB | frontend/src/admin/lib/gameCatalog.ts |
| 20.0 KB | frontend/public/saga-app-icon-192.png |
| 18.0 KB | frontend/public/saga-app-icon-180.png |
| 17.7 KB | backend/app/storage/sqlite_store.py |
| 17.6 KB | frontend/src/admin/components/AdminMissionControlShell.tsx |
| 15.6 KB | frontend/src/player/offline/missionPack.ts |
| 15.3 KB | frontend/src/admin/components/NodePhysicalTypePanel.tsx |
| 14.3 KB | frontend/src/admin/AdminMissionMap.tsx |
| 13.9 KB | frontend/src/admin/lib/familySchemas.ts |
| 13.6 KB | frontend/src/player/components/QuickProofPanel.tsx |
| 13.0 KB | frontend/src/player/components/InteractionSheet.tsx |
| 11.7 KB | frontend/src/admin/components/PlayersPanel.tsx |
| 11.4 KB | frontend/src/admin/lib/adminApi.ts |
| 10.5 KB | frontend/src/player/offline/mapTileCache.ts |
| 10.3 KB | frontend/src/i18n/legacySpanishBridge.ts |
| 9.6 KB | docs/gameplay/game-system-architecture.md |
| 9.1 KB | backend/app/runtime/minigames.py |
| 8.7 KB | frontend/src/player/components/TeamSheet.tsx |

## 3. Monolith candidates by line count

| Lines | Path |
| --- | --- |
| 3337 | frontend/src/admin/AdminApp.tsx |
| 3191 | frontend/src/admin/styles/admin-modern-shell.css |
| 2818 | main.py |
| 1659 | frontend/src/player/PlayerApp.tsx |
| 1514 | frontend/src/player/components/MapSurface.tsx |
| 1041 | frontend/src/login/LoginApp.tsx |
| 1026 | frontend/src/admin/components/NodeDetailDrawer.tsx |
| 1015 | frontend/src/player/minigames/families/bearingHunt/RuntimeScreen.tsx |
| 994 | frontend/package-lock.json |
| 919 | frontend/src/player/components/PlayerHud.tsx |
| 854 | frontend/src/player/minigames/families/signalHunt/RuntimeScreen.tsx |
| 648 | backend/app/storage/sqlite_store.py |
| 578 | frontend/src/admin/components/NodePhysicalTypePanel.tsx |
| 572 | frontend/src/admin/AdminMissionMap.tsx |
| 547 | frontend/src/player/offline/missionPack.ts |
| 539 | frontend/src/player/components/InteractionSheet.tsx |
| 539 | frontend/src/admin/lib/familySchemas.ts |
| 536 | frontend/src/player/components/QuickProofPanel.tsx |
| 516 | frontend/src/admin/components/AdminMissionControlShell.tsx |
| 486 | frontend/src/admin/lib/gameCatalog.ts |
| 452 | frontend/src/admin/lib/adminApi.ts |
| 365 | docs/gameplay/game-system-architecture.md |
| 364 | frontend/src/player/components/PlayerShell.tsx |
| 360 | frontend/src/player/offline/mapTileCache.ts |
| 355 | frontend/src/admin/components/PhysicalQrCardsPanel.tsx |
| 348 | frontend/src/player/components/TeamSheet.tsx |
| 342 | backend/app/security/admin_auth.py |
| 331 | frontend/src/admin/components/PlayersPanel.tsx |
| 329 | frontend/src/player/components/InventoryPanel.tsx |
| 324 | frontend/src/player/offline/localFirst.ts |
| 319 | frontend/src/player/components/MissionPackPanel.tsx |
| 301 | docs/architecture/offline-team-map-architecture.md |
| 299 | frontend/src/i18n/legacySpanishBridge.ts |
| 296 | frontend/src/player/components/FieldCameraCapture.tsx |
| 270 | frontend/src/player/components/FieldPrepPanel.tsx |
| 259 | frontend/src/player/components/ManualInventoryCollectPanel.tsx |
| 248 | frontend/src/styles/mobile-shell.css |
| 244 | frontend/src/player/components/RequirementPreviewPanel.tsx |
| 236 | frontend/src/player/offline/inventory.ts |
| 229 | backend/app/runtime/minigames.py |

## 4. Priority frontend files

| File | Exists | Size | Lines |
| --- | --- | --- | --- |
| frontend/src/PlayerApp.tsx | missing | 0.0 KB | 0 |
| frontend/src/PlayerHud.tsx | missing | 0.0 KB | 0 |
| frontend/src/MapSurface.tsx | missing | 0.0 KB | 0 |
| frontend/src/NodeDetailDrawer.tsx | missing | 0.0 KB | 0 |

## 5. Imports in priority frontend files

### `frontend/src/PlayerApp.tsx`
_No imports found or file missing._

### `frontend/src/PlayerHud.tsx`
_No imports found or file missing._

### `frontend/src/MapSurface.tsx`
_No imports found or file missing._

### `frontend/src/NodeDetailDrawer.tsx`
_No imports found or file missing._

## 6. Possible duplicated identifiers

| Identifier | Occurrences |
| --- | --- |
| payload | 23 |
| title | 20 |
| raw | 18 |
| normalized | 17 |
| snapshot | 17 |
| value | 14 |
| itemId | 13 |
| next | 13 |
| parsed | 12 |
| message | 12 |
| label | 12 |
| map | 12 |
| eyebrow | 12 |
| record | 11 |
| response | 10 |
| url | 10 |
| key | 10 |
| config | 10 |
| panel | 10 |
| res | 10 |
| cancelled | 9 |
| lat | 9 |
| lon | 9 |
| radius | 9 |
| center | 8 |
| family | 8 |
| source | 8 |
| request | 7 |
| kind | 7 |
| errors | 7 |
| clean | 7 |
| presence | 7 |
| saved | 6 |
| messages | 6 |
| parts | 6 |
| existing | 6 |
| header | 6 |
| copy | 6 |
| image | 6 |
| body | 6 |
| stage | 6 |
| cache | 5 |
| cached | 5 |
| urls | 5 |
| user | 5 |
| stages | 5 |
| result | 5 |
| visual | 5 |
| index | 5 |
| physicalQr | 5 |
| field | 5 |
| input | 5 |
| identity | 5 |
| text | 5 |
| intervalId | 5 |
| distance | 5 |
| sheet | 5 |
| closeButton | 5 |
| timestamp | 5 |
| dLat | 5 |

## 7. TODO / debug / temporary traces

| Kind | File | Line | Snippet |
| --- | --- | --- | --- |
| debug/debugger/test temporal | backend/app/storage/json_store.py | 9 | - temporary-file writes |
| debug/debugger/test temporal | docs/admin/mission-control-polish-roadmap.md | 11 | - Gated debug GPS recovered. |
| debug/debugger/test temporal | docs/architecture/adr-001-player-frontend-migration.md | 8 | This allowed fast iteration, but it now slows down UX work, responsive tuning, debug tooling, and future mobile packaging. |
| debug/debugger/test temporal | docs/architecture/adr-001-player-frontend-migration.md | 25 | - cleaner map / HUD / debug separation |
| debug/debugger/test temporal | docs/architecture/adr-001-player-frontend-migration.md | 35 | - debug simulation tools |
| debug/debugger/test temporal | docs/architecture/adr-001-player-frontend-migration.md | 52 | - temporary dual-frontend period |
| debug/debugger/test temporal | docs/architecture/event-log-foundation.md | 95 | This is temporary but useful. |
| debug/debugger/test temporal | docs/architecture/frontend-migration-plan.md | 36 | - reproduce debug state presentation |
| debug/debugger/test temporal | docs/architecture/frontend-migration-plan.md | 43 | - debug simulated position |
| debug/debugger/test temporal | docs/frontend/ios-pwa-fullscreen-guardrails.md | 12 | - Added the gated debug geolocation shim. |
| debug/debugger/test temporal | docs/frontend/ios-pwa-fullscreen-guardrails.md | 64 | - PR #183 restored only the gated debug geolocation shim. |
| debug/debugger/test temporal | docs/gameplay/admin-game-authoring-clarity-v1.md | 49 | Internal names can remain in advanced/debug areas. |
| debug/debugger/test temporal | docs/gameplay/demo-gameplay-inventory-qr-nfc-v1.md | 15 | Purpose: validate GPS, debug GPS, proximity gameplay and Signal Hunt. |
| debug/debugger/test temporal | docs/gameplay/demo-gameplay-inventory-qr-nfc-v1.md | 62 | ## Debug rules |
| debug/debugger/test temporal | docs/gameplay/demo-gameplay-inventory-qr-nfc-v1.md | 66 | Debug play may simulate the player position, but only when debug is explicitly enabled. |
| debug/debugger/test temporal | docs/gameplay/demo-gameplay-inventory-qr-nfc-v1.md | 68 | Minigames must receive the same debug position as the main player map. |
| debug/debugger/test temporal | docs/gameplay/demo-gameplay-inventory-qr-nfc-v1.md | 70 | Debug mode must never become the default for normal users. |
| debug/debugger/test temporal | docs/gameplay/demo-gameplay-inventory-qr-nfc-v1.md | 89 | - debug mode works without browser console |
| debug/debugger/test temporal | docs/gameplay/minigames-and-physical-interactions-audit.md | 11 | - Gated debug GPS restored. |
| debug/debugger/test temporal | docs/gameplay/minigames-and-physical-interactions-audit.md | 61 | - Depends on live or debug geolocation. |
| debug/debugger/test temporal | docs/operations/i18n-global-ui-fast.md | 12 | - Keeps login/player/admin copy translated through the existing i18n foundation plus a temporary legacy UI bridge. |
| debug/debugger/test temporal | docs/operations/i18n-player-tools-cleanup.md | 11 | - Keeps the temporary legacy Spanish bridge for remaining hardcoded copy. |
| debug/debugger/test temporal | docs/operations/sqlite-migration-dry-run.md | 18 | By default, the script writes to a temporary SQLite database and deletes it after the check. |
| debug/debugger/test temporal | docs/player-field-test-checklist.md | 16 | - Confirm the player marker appears on the map without debug mode. |
| debug/debugger/test temporal | docs/security/admin-auth.md | 19 | For temporary compatibility only, legacy password payload authentication can be enabled explicitly: |
| TODO/FIXME/HACK/XXX | docs/security/audit-closeout-roadmap.md | 60 | - TODO/FIXME cleanup markers |
| TODO/FIXME/HACK/XXX | docs/security/cleanup-checklist.md | 62 | - TODO/FIXME markers |
| debug/debugger/test temporal | docs/security/privacy-guard.md | 9 | - logs, backups and temporary artifacts |
| debug/debugger/test temporal | frontend/README.md | 14 | - debug simulation |
| TODO/FIXME/HACK/XXX | frontend/src/admin/lib/gameCatalog.ts | 435 | summary: 'Ritmo variado con GPS, brújula, objeto QR y bonus, todo jugable offline.', |
| debug/debugger/test temporal | frontend/src/i18n/index.ts | 54 | enableDebug: 'Enable local debug', |
| debug/debugger/test temporal | frontend/src/i18n/index.ts | 55 | disableDebug: 'Disable local debug', |
| debug/debugger/test temporal | frontend/src/i18n/index.ts | 121 | enableDebug: 'Activar debug local', |
| debug/debugger/test temporal | frontend/src/i18n/index.ts | 122 | disableDebug: 'Desactivar debug local', |
| debug/debugger/test temporal | frontend/src/i18n/legacySpanishBridge.ts | 128 | 'Enable local debug': 'Activar debug local', |
| debug/debugger/test temporal | frontend/src/i18n/legacySpanishBridge.ts | 129 | 'Disable local debug': 'Desactivar debug local', |
| debug/debugger/test temporal | frontend/src/player/PlayerApp.tsx | 547 | showNotice('Activa GPS o usa modo debug para guardar la foto en el mapa.', 'warn') |
| debug/debugger/test temporal | frontend/src/player/PlayerApp.tsx | 657 | showNotice('Debug desactivado. Recuperando GPS real…', 'info') |
| debug/debugger/test temporal | frontend/src/player/PlayerApp.tsx | 677 | showNotice('Modo prueba activo. Toca un punto libre del mapa para colocar tu ubicación.', 'info') |
| debug/debugger/test temporal | frontend/src/player/PlayerApp.tsx | 693 | showNotice('Posición debug actualizada.', 'success') |
| debug/debugger/test temporal | frontend/src/player/PlayerApp.tsx | 885 | : 'Activa GPS o usa modo debug para abrir este QR físico.', |
| debug/debugger/test temporal | frontend/src/player/PlayerApp.tsx | 923 | : 'Activa GPS o usa modo debug para abrir este QR físico.', |
| debug/debugger/test temporal | frontend/src/player/components/MapSurface.tsx | 512 | const playerAuraModeRef = useRef<'gps' \\| 'debug' \\| null>(null) |
| debug/debugger/test temporal | frontend/src/player/components/MapSurface.tsx | 602 | .saga-player-aura--debug { |
| debug/debugger/test temporal | frontend/src/player/components/MapSurface.tsx | 834 | debugSimulation ? 'debug' : gpsState === 'ready' \\|\\| gpsState === 'stale' ? 'gps' : null |
| debug/debugger/test temporal | frontend/src/player/components/MapSurface.tsx | 842 | auraMode === 'debug' ? 'saga-player-aura--debug' : 'saga-player-aura--gps' |
| debug/debugger/test temporal | frontend/src/player/components/MapSurface.tsx | 843 | const auraColor = auraMode === 'debug' ? '#ef4444' : '#22c55e' |
| debug/debugger/test temporal | frontend/src/player/components/MapSurface.tsx | 844 | const auraFill = auraMode === 'debug' ? '#f87171' : '#4ade80' |
| debug/debugger/test temporal | frontend/src/player/components/PlayerHud.tsx | 468 | {debugEnabled ? 'Desactivar debug GPS' : 'Activar debug GPS'} |
| TODO/FIXME/HACK/XXX | frontend/src/player/components/RequirementPreviewPanel.tsx | 72 | 'Cuando cumplas todo, podras avanzar.', |
| debug/debugger/test temporal | frontend/src/player/components/TeamSheet.tsx | 149 | {player.debug_enabled ? <span style={metaChipWarn}>DEBUG</span> : null} |
| console.log/warn/error | frontend/src/player/minigames/core/runtime-bridge.smoke.ts | 32 | console.log({ |
| debug/debugger/test temporal | frontend/src/player/runtime.ts | 81 | primaryLabel: debugEnabled ? 'SET DEBUG GPS' : 'GPS REQUIRED', |
| debug/debugger/test temporal | frontend/src/player/utils/debugGeolocationShim.ts | 30 | url.searchParams.get('debug') === '1' \\|\\| |
| debug/debugger/test temporal | main.py | 1098 | raw_debug = raw.get("debug") |
| debug/debugger/test temporal | main.py | 1191 | "debug": { |
| debug/debugger/test temporal | main.py | 1211 | debug = node.get("debug") or {} |
| debug/debugger/test temporal | main.py | 1221 | if debug_enabled and (entry.get("allow_debug_bypass") or debug.get("force_unlock")): |
| debug/debugger/test temporal | main.py | 2038 | # Public heartbeat must not be able to toggle debug state remotely. |
| debug/debugger/test temporal | main.py | 2779 | return JSONResponse(status_code=400, content={"status": "error", "detail": "choose a stronger password (minimum 10 chars, avoid temporary/default values)"}) |
| TODO/FIXME/HACK/XXX | scripts/audit_cleanup_candidates.py | 58 | ("cleanup_marker", re.compile(r"\bTODO\b\\|\bFIXME\b\\|delete me\\|remove later\\|temporary hack", re.IGNORECASE)), |
| debug/debugger/test temporal | scripts/audit_cleanup_candidates.py | 58 | ("cleanup_marker", re.compile(r"\bTODO\b\\|\bFIXME\b\\|delete me\\|remove later\\|temporary hack", re.IGNORECASE)), |
| debug/debugger/test temporal | scripts/sqlite_migration_dry_run.py | 6 | - it writes to a temporary SQLite DB by default |
| debug/debugger/test temporal | scripts/sqlite_migration_dry_run.py | 170 | help="Keep the temporary SQLite DB when --sqlite-db is not provided.", |
| debug/debugger/test temporal | scripts/sqlite_migration_dry_run.py | 204 | print(f"Temporary DB kept at: {sqlite_path}") |

## 8. Sensitive-looking terms

> Line content intentionally omitted to avoid leaking values into documentation.

| Kind | File | Line | Content |
| --- | --- | --- | --- |
| possible secret/token/password | .github/workflows/secret-scan.yml | 1 | line omitted |
| possible secret/token/password | SECURITY.md | 21 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 3 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 23 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 27 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 47 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 58 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 66 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 67 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 72 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 80 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 85 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 121 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 134 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 148 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 149 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 152 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 153 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 158 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 160 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 164 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 169 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 171 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 172 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 176 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 181 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 198 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 201 | line omitted |
| possible secret/token/password | backend/app/security/admin_auth.py | 220 | line omitted |
| possible secret/token/password | docs/architecture/offline-team-map-architecture.md | 96 | line omitted |
| possible secret/token/password | docs/architecture/offline-team-map-architecture.md | 229 | line omitted |
| possible secret/token/password | docs/architecture/sqlite-storage-foundation.md | 165 | line omitted |
| possible secret/token/password | docs/architecture/sqlite-storage-foundation.md | 167 | line omitted |
| possible secret/token/password | docs/gameplay/playable-game-templates-v1.md | 14 | line omitted |
| possible secret/token/password | docs/gameplay/playable-game-templates-v1.md | 26 | line omitted |
| possible secret/token/password | docs/operations/i18n-global-ui-fast.md | 30 | line omitted |
| possible secret/token/password | docs/operations/pwa-mobile-app-shell.md | 20 | line omitted |
| possible secret/token/password | docs/security/admin-auth.md | 15 | line omitted |
| possible secret/token/password | docs/security/admin-auth.md | 19 | line omitted |
| possible secret/token/password | docs/security/admin-auth.md | 25 | line omitted |
| possible secret/token/password | docs/security/admin-auth.md | 31 | line omitted |
| possible secret/token/password | docs/security/admin-auth.md | 41 | line omitted |
| possible secret/token/password | docs/security/audit-closeout-roadmap.md | 15 | line omitted |
| possible secret/token/password | docs/security/privacy-guard.md | 11 | line omitted |
| possible secret/token/password | docs/security/privacy-guard.md | 28 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 122 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 489 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 492 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 889 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 891 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 892 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 893 | line omitted |
| possible secret/token/password | frontend/src/admin/AdminApp.tsx | 894 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 134 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 135 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 142 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 145 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 209 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 210 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 215 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 216 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 217 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 218 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 219 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 223 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 224 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 228 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 229 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 283 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 286 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 301 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 323 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 329 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 330 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 331 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 371 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 372 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 381 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 382 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 383 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 384 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 385 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 386 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 387 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 392 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/adminApi.ts | 397 | line omitted |
| possible secret/token/password | frontend/src/admin/lib/familySchemas.ts | 341 | line omitted |
| possible secret/token/password | frontend/src/i18n/legacySpanishBridge.ts | 16 | line omitted |
| possible secret/token/password | frontend/src/i18n/legacySpanishBridge.ts | 17 | line omitted |
| possible secret/token/password | frontend/src/i18n/legacySpanishBridge.ts | 18 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 37 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 121 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 654 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 685 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 704 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 717 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 742 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 748 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 796 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 801 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 892 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 900 | line omitted |
| possible secret/token/password | frontend/src/player/PlayerApp.tsx | 916 | line omitted |
| possible secret/token/password | frontend/src/player/components/MapSurface.tsx | 10 | line omitted |
| possible secret/token/password | frontend/src/player/components/MapSurface.tsx | 1131 | line omitted |
| possible secret/token/password | frontend/src/player/components/MapSurface.tsx | 1132 | line omitted |
| possible secret/token/password | main.py | 611 | line omitted |
| possible secret/token/password | main.py | 612 | line omitted |
| possible secret/token/password | main.py | 623 | line omitted |
| possible secret/token/password | main.py | 624 | line omitted |
| possible secret/token/password | main.py | 627 | line omitted |
| possible secret/token/password | main.py | 628 | line omitted |
| possible secret/token/password | main.py | 631 | line omitted |
| possible secret/token/password | main.py | 634 | line omitted |
| possible secret/token/password | main.py | 671 | line omitted |
| possible secret/token/password | main.py | 672 | line omitted |
| possible secret/token/password | main.py | 679 | line omitted |
| possible secret/token/password | main.py | 683 | line omitted |
| possible secret/token/password | main.py | 2231 | line omitted |
| possible secret/token/password | main.py | 2237 | line omitted |

## 9. Suspicious files tracked or present

### Tracked suspicious paths
- `backend/app/storage/sqlite_store.py`
- `docs/architecture/sqlite-storage-foundation.md`
- `docs/operations/sqlite-migration-dry-run.md`
- `docs/operations/sqlite-runtime-only.md`
- `scripts/check_sqlite_runtime_strict.py`
- `scripts/sqlite_migration_dry_run.py`
- `tests/test_event_sync_sqlite_routes.py`
- `tests/test_sqlite_migration_dry_run.py`
- `tests/test_sqlite_store.py`

### Untracked suspicious paths
_No untracked suspicious paths detected by filename scan._

## 10. API/public route surface

| File | Line | Snippet |
| --- | --- | --- |
| docs/frontend/ios-pwa-fullscreen-guardrails.md | 57 | 6. Smoke `/api/game/PLAYER%201`. |
| frontend/public/sw.js | 7 | url.pathname.startsWith('/api/') \\|\\| |
| frontend/public/sw.js | 41 | const response = await fetch(request) |
| frontend/public/sw.js | 51 | return await fetch(request, { signal: controller.signal }) |
| frontend/public/sw.js | 101 | const response = await fetch(request) |
| frontend/public/sw.js | 159 | if (url.pathname.startsWith('/api/field-proofs/') && request.method === 'GET') { |
| frontend/src/admin/lib/adminApi.ts | 117 | const res = await fetch(url, { |
| frontend/src/admin/lib/adminApi.ts | 135 | return adminPostJson<AdminLoginResponse>('/api/admin/login', { password }) |
| frontend/src/admin/lib/adminApi.ts | 139 | return adminPostJson<AdminLoginResponse>('/api/admin/logout', {}) |
| frontend/src/admin/lib/adminApi.ts | 144 | '/api/admin/react-overview', |
| frontend/src/admin/lib/adminApi.ts | 150 | const res = await fetch(url, { |
| frontend/src/admin/lib/adminApi.ts | 181 | const res = await fetch(url, { |
| frontend/src/admin/lib/adminApi.ts | 225 | return ['/api/admin/stages'] |
| frontend/src/admin/lib/adminApi.ts | 229 | return keys.map((key) => `/api/admin/stages?${key}=${encodeURIComponent(password)}`) |
| frontend/src/admin/lib/adminApi.ts | 288 | const payload = await adminPostJsonResilient('/api/admin/stages', body) |
| frontend/src/admin/lib/adminApi.ts | 336 | const payload = await adminPostJsonResilient('/api/admin/save', body) |
| frontend/src/admin/lib/adminApi.ts | 399 | const res = await fetch('/api/admin/save-config', { |
| frontend/src/admin/lib/adminApi.ts | 447 | return adminPostJson<AdminProfileActionResponse>('/api/admin/profile-action', { |
| frontend/src/player/offline/fieldProofCache.ts | 101 | const response = await fetch(url, { |
| frontend/src/player/offline/localFirst.ts | 227 | syncEndpoint = "/api/events/sync", |
| frontend/src/player/offline/localFirst.ts | 291 | endpoint = `/api/game/${encodeURIComponent(user)}`, |
| frontend/src/player/offline/mapTileCache.ts | 258 | const response = await fetch(request) |
| frontend/src/player/offline/missionPack.ts | 214 | const response = await fetch('/api/events/sync', { |
| frontend/src/player/offline/pwaShell.ts | 69 | const response = await fetch(url, { |
| frontend/src/player/utils/debugGeolocationShim.ts | 52 | const response = await fetch(`/api/game/${encodeURIComponent(user)}?fresh=${Date.now()}`, { |
| frontend/src/shared/api.ts | 21 | const res = await fetch(url, { |
| frontend/src/shared/api.ts | 45 | const res = await fetch(`/api/game/${encodeURIComponent(user)}${suffix}`, { |
| frontend/src/shared/api.ts | 66 | const res = await fetch('/api/config', { |
| frontend/src/shared/api.ts | 87 | const res = await fetch(`/api/team/${encodeURIComponent(user)}`, { |
| frontend/src/shared/api.ts | 105 | return postJson<AdvanceResponse>('/api/advance', { user, code }) |
| frontend/src/shared/api.ts | 115 | return postJson('/api/heartbeat', args) |
| frontend/src/shared/api.ts | 123 | const res = await fetch(`/api/field-proofs?user=${encodeURIComponent(user)}`, { |
| frontend/src/shared/api.ts | 149 | return postJson<FieldProofUploadResponse>('/api/field-proofs', args) |
| frontend/src/shared/api.ts | 154 | const res = await fetch(`/api/field-proofs/${encodeURIComponent(proofId)}?user=${encodeURIComponent(user)}`, { |
| frontend/src/shared/api.ts | 170 | return `/api/field-proofs/download?user=${encodeURIComponent(user)}` |
| tests/test_backend_security_smoke.py | 26 | "/api/admin/login", |
| tests/test_backend_security_smoke.py | 43 | "/api/admin/login", |
| tests/test_backend_security_smoke.py | 48 | response = client.post("/api/admin/react-overview", json={}) |
| tests/test_backend_security_smoke.py | 59 | response = client.post("/api/reset", json={"user": "PLAYER 1"}) |
| tests/test_backend_security_smoke.py | 72 | "/api/admin/login", |
| tests/test_backend_security_smoke.py | 77 | response = client.post("/api/reset", json={"user": "PLAYER 1"}) |
| tests/test_backend_security_smoke.py | 112 | response = client.get("/api/game/PLAYER%201") |
| tests/test_backend_security_smoke.py | 126 | response = client.post("/api/admin/save", json={"stages": []}) |
| tests/test_event_sync_api.py | 20 | "/api/events/sync", |
| tests/test_event_sync_api.py | 62 | "/api/events/sync", |
| tests/test_event_sync_api.py | 79 | "/api/events/sync", |
| tests/test_event_sync_api.py | 95 | response = client.post("/api/admin/events", json={}) |
| tests/test_event_sync_api.py | 108 | login = client.post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"]}) |
| tests/test_event_sync_api.py | 111 | response = client.post("/api/admin/events", json={"limit": 10}) |
| tests/test_event_sync_api.py | 126 | login = client.post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"]}) |
| tests/test_event_sync_api.py | 130 | "/api/admin/events/mark", |
| tests/test_item_requirements_api.py | 82 | "/api/advance", |
| tests/test_item_requirements_api.py | 99 | "/api/advance", |
| tests/test_item_requirements_api.py | 116 | "/api/advance", |
| tests/test_offline_progression_sync_api.py | 79 | "/api/events/sync", |
| tests/test_offline_progression_sync_api.py | 105 | "/api/events/sync", |
| tests/test_offline_progression_sync_api.py | 130 | "/api/events/sync", |
| tests/test_offline_progression_sync_api.py | 157 | "/api/events/sync", |

## 11. Write endpoints / mutating calls

| File | Line | Snippet |
| --- | --- | --- |
| .github/workflows/smoke.yml | 111 | -X POST http://127.0.0.1:8097/api/reset \ |
| docs/architecture/event-log-foundation.md | 109 | - `POST /api/events/sync` |
| docs/architecture/event-log-foundation.md | 110 | - `POST /api/admin/events` |
| docs/architecture/event-log-foundation.md | 111 | - `POST /api/admin/events/mark` |
| main.py | 397 | @app.delete("/api/field-proofs/{proof_id}") |
| main.py | 461 | @app.post("/api/field-proofs") |
| main.py | 1852 | @app.post("/api/events/sync") |
| main.py | 1900 | @app.post("/api/admin/events") |
| main.py | 1928 | @app.post("/api/admin/events/mark") |
| main.py | 1957 | @app.post("/api/heartbeat") |
| main.py | 2224 | @app.post("/api/admin/react-overview") |
| main.py | 2294 | @app.post("/api/admin/mission-status") |
| main.py | 2330 | @app.post("/api/admin/stages") |
| main.py | 2348 | @app.post("/api/admin/save-config") |
| main.py | 2576 | @app.post("/api/advance") |
| main.py | 2614 | @app.post("/api/reset") |
| main.py | 2640 | @app.post("/api/admin/profile-action") |
| main.py | 2711 | @app.post("/api/admin/save") |
| main.py | 2730 | @app.post("/api/admin/login") |
| main.py | 2752 | @app.post("/api/admin/logout") |
| main.py | 2762 | @app.post("/api/admin/change-password") |
| tests/test_admin_legacy_password_payload.py | 87 | response = client.post("/api/admin/login", json={"password": "wrong-password"}) |
| tests/test_backend_security_smoke.py | 48 | response = client.post("/api/admin/react-overview", json={}) |
| tests/test_backend_security_smoke.py | 59 | response = client.post("/api/reset", json={"user": "PLAYER 1"}) |
| tests/test_backend_security_smoke.py | 77 | response = client.post("/api/reset", json={"user": "PLAYER 1"}) |
| tests/test_backend_security_smoke.py | 126 | response = client.post("/api/admin/save", json={"stages": []}) |
| tests/test_event_sync_api.py | 95 | response = client.post("/api/admin/events", json={}) |
| tests/test_event_sync_api.py | 108 | login = client.post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"]}) |
| tests/test_event_sync_api.py | 111 | response = client.post("/api/admin/events", json={"limit": 10}) |
| tests/test_event_sync_api.py | 126 | login = client.post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"]}) |

## 12. Headers / CORS / browser hardening hints

| File | Line | Snippet |
| --- | --- | --- |
| frontend/src/player/offline/mapTileCache.ts | 254 | mode: 'no-cors', |

## 13. Existing validation, privacy and smoke scripts

- `scripts/check_audit_guards.py`
- `scripts/check_playable_templates.py`
- `scripts/check_protected_files.py`
- `scripts/check_repo_privacy.py`
- `scripts/check_sqlite_runtime_strict.py`
- `scripts/check_universal_fallback_code.py`

## 14. Docker / deploy files

- `.dockerignore`
- `Dockerfile`
- `docs/operations/clean-docker-production-deploy.md`
- `docs/operations/docker-runtime.md`


### `.dockerignore` key lines
| Line | Snippet |
| --- | --- |
| 7 | env |
| 20 | .env |
| 21 | .env.* |
| 22 | !.env.example |

### `Dockerfile` key lines
| Line | Snippet |
| --- | --- |
| 1 | FROM python:3.13-slim |
| 5 | COPY requirements.txt /app/requirements.txt |
| 8 | COPY . /app |
| 10 | EXPOSE 5000 |
| 12 | CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"] |

### `docs/operations/clean-docker-production-deploy.md` key lines
| Line | Snippet |
| --- | --- |
| 99 | --env-file /ruta/a/production.env \ |
| 103 | uvicorn main:app --host 0.0.0.0 --port 5000 |

### `docs/operations/docker-runtime.md` key lines
| Line | Snippet |
| --- | --- |
| 49 | Do not bake production secrets, local .env files, live SQLite databases, backups or logs into the image. |

## 15. Frontend/backend dependencies

### `frontend/package.json`
- scripts: `dev, build, preview`
- dependencies: **5**
- devDependencies: **6**
  - `jsqr`: `^1.4.0`
  - `leaflet`: `^1.9.4`
  - `qrcode.react`: `^4.2.0`
  - `react`: `^18.3.0`
  - `react-dom`: `^18.3.0`

### Python / lock / package files
- `frontend/package-lock.json`
- `requirements-dev.txt`
- `requirements.txt`

## 16. Open Dependabot PRs

- #216 `build(deps-dev): bump the frontend-tooling group in /frontend with 2 updates` — `dependabot/npm_and_yarn/frontend/frontend-tooling-43347ce365` — https://github.com/odegaard12/Saga-Engine/pull/216
- #215 `build(deps-dev): bump typescript from 5.9.3 to 6.0.3 in /frontend in the typescript group` — `dependabot/npm_and_yarn/frontend/typescript-3b9b15ff01` — https://github.com/odegaard12/Saga-Engine/pull/215
- #214 `build(deps): bump the react-major group in /frontend with 4 updates` — `dependabot/npm_and_yarn/frontend/react-major-9865d7ccac` — https://github.com/odegaard12/Saga-Engine/pull/214
- #213 `build(deps): bump gitleaks/gitleaks-action from 2 to 3 in the github-actions group` — `dependabot/github_actions/github-actions-1cd067a277` — https://github.com/odegaard12/Saga-Engine/pull/213

## 17. Offline / PWA / cache related files

- `docs/architecture/offline-team-map-architecture.md`
- `docs/gameplay/inventory-use-offline-event.md`
- `docs/gameplay/manual-code-offline-fallback.md`
- `docs/gameplay/offline-field-vault-v1.md`
- `docs/gameplay/offline-local-first-player.md`
- `docs/gameplay/offline-player-launch-invariant.md`
- `docs/gameplay/offline-sync-tools.md`
- `docs/gameplay/physical-event-offline-queue.md`
- `docs/gameplay/team-presence-cache.md`
- `docs/gameplay/universal-offline-fallback-code-v1.md`
- `frontend/public/sw.js`
- `frontend/src/player/components/OfflineSyncPanel.tsx`
- `frontend/src/player/offline/fieldProofCache.ts`
- `frontend/src/player/offline/index.ts`
- `frontend/src/player/offline/inventory.ts`
- `frontend/src/player/offline/localFirst.ts`
- `frontend/src/player/offline/mapTileCache.ts`
- `frontend/src/player/offline/missionPack.ts`
- `frontend/src/player/offline/physicalEvents.ts`
- `frontend/src/player/offline/pwaShell.ts`
- `frontend/src/player/offline/teamMapPresence.ts`
- `frontend/src/player/offline/teamPresence.ts`
- `frontend/src/shared/offlinePublicConfig.ts`
- `frontend/src/shared/offlineVault.ts`
- `tests/test_offline_progression_sync_api.py`

## 18. Manual security review checklist

- [ ] Confirm `/admin-react` is protected by server-side admin secret/session, not only frontend state.
- [ ] Confirm every mutating `/api/*` endpoint requires auth/session/secret.
- [ ] Confirm no production `.env`, DB, backup, private key, token, or player private data is tracked.
- [ ] Confirm `gitleaks` runs locally and in CI with redaction.
- [ ] Confirm `scripts/check_repo_privacy.py` and protected-files guard cover `.env`, DB, backups, keys, dumps and local runtime data.
- [ ] Confirm CORS is not permissive for mutating endpoints.
- [ ] Confirm basic security headers are set at app or reverse-proxy layer.
- [ ] Confirm container exposes only app port internally and production reverse proxy maps only intended public routes.
- [ ] Confirm Service Worker/cache has a clean recovery path to avoid white screens after deploy.

## 19. Recommended small fixes before Admin UX

Priority proposal, pending manual confirmation:

1. Add global frontend `ErrorBoundary` for Admin/Player/Login to avoid blank screens.
2. Add visible version/commit in login, admin and player footer or debug panel.
3. Add one canonical smoke script that checks `/`, `/admin-react`, `/player/PLAYER%201`, health/API and frontend build output.
4. Add offline cache reset action in player/login tools if not already present.
5. Show “offline prepared X ago” and warning when offline package is missing/stale.
6. Add automatic mission JSON backup before server-side mission save.
7. Add mission JSON export from admin.
8. Add demo mission smoke/checklist for 5-node route.

## 20. Monolith split proposal — no refactor in #229

### `PlayerApp.tsx`
- Extract hooks: player load/session, offline preparation, debug GPS, fallback code, photos/presence.

### `PlayerHud.tsx`
- Extract panels: tools, backpack/inventory, GPS/status, fallback form, offline status.

### `NodeDetailDrawer.tsx`
- Extract node-type views: normal node, physical QR, requirements, reward, messages/hints.

### `MapSurface.tsx`
- Extract map layers: base map, route/nodes, player marker, photos, debug simulated location, offline tiles.

## 21. Proposed follow-up PR order

- `#230` Admin UX cleanup: local apply vs global save vs QR apply.
- `#231` Gameplay validation matrix.
- `#232` Real 5–8 node demo mission.
- `#233` README/release `v0.0.2`.
- `#234+` New minigames only after validation/documentation.

## 22. Notes

- This report is generated mechanically and must be manually reviewed before fixes.
- This PR should remain documentation/audit only unless explicitly expanded.
- No production deploy is needed for this audit document.
