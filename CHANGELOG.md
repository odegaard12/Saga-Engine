# Changelog

All notable changes to SAGA Engine are documented in this file.

---

## [1.0.1] — 2026-06-24

### 🔧 Improvements
- **Hardware-accelerated Map Animations**: Upgraded `MapSurface.tsx` animations (`sagaTypeBadgeFloat`, `sagaCurrentNodeHalo`, `sagaRoadFlow`, `sagaPlayerLocator`) with `translate3d` and `will-change`. This fixes map layout thrashing and blinking on iOS/Safari.
- **Smooth Global Transitions**: Applied 3D transforms (`scale3d`, `translate3d`) and `will-change` hints to `PlayerLayout.tsx` overlays, trophies, and status cards for buttery-smooth 60/120 FPS pop-ups.
- **iPhone Safe Area Edge Fix**: Updated `mobile-shell.css` global `body` and `html` backgrounds from light `#e8efea` to `#020617` (Slate 900) to eliminate white edge borders in iPhone safe areas.

### 📝 Documentation
- **README updates**: Removed references to legacy "Tema de Juegos" concepts. Strictly aligned available game families to `Matriz de Circuitos`, `Código Secuencial`, `Mosaico de Lugar`, and `Laberinto de Equilibrio`.
- **Physical QR definitions**: Unified physical QR type references in documentation to exactly `Objeto QR`, `Llave QR`, `Pista QR`, and `Bonus Oculto`.

---

## [1.0.0] — 2026-06-23

### 🎉 First stable release

This release marks the transition from the feature development phase (v0.5.x) to a stable, field-tested platform. Virtually every layer of the stack was touched: new offline architecture, a complete minigame runtime system, an overhauled player UI, GPS hardening, field photo proofs with ZIP export, a redesigned login flow, a professional deploy pipeline, and much more.

---

### ✨ New features

#### Player experience
- **New PlayerHud bar** — completely redesigned bottom HUD with glassmorphism style, matching the login palette and top bar. Clean separation of primary action, details, tools and GPS state.
- **New PlayerShell bar** — redesigned top bar with player avatar, mission progress, GPS indicator and team access.
- **Backpack (Mochila) panel** — inventory panel listing all collected items, next-node preview with game type description, and field context.
- **Tools panel** — redesigned with: field photo download as ZIP, QR quick-scan launcher, field camera, offline sync, and an in-app field assistant guide.
- **In-app assistant guide** — explains how to play each minigame family and how to use core tools (QR scan, GPS, mochila), accessible from the Tools panel.
- **Field Photo Proofs (ZIP export)** — players can download all their geolocated field photos as a single ZIP file directly from the Tools panel.
- **QR distance error toast** — scanning a QR node while out of range now shows a centered, auto-dismissing toast (3 seconds) below the player bars instead of a generic alert.
- **Route overview map control** — quick-controls bar on the map now includes a route toggle button to see all nodes at once.
- **Team presence on map** — real-time team member positions drawn as colored markers on the player map.
- **Celebration overlay** — brief animated overlay on node clear and mission finish.
- **Mission finish screen** — full finish screen with stats (nodes cleared, photos taken), accessible again via a floating trophy button.

#### Login
- **GPS permission request at login** — the login now asks for GPS permission before entering the player. If denied, the user enters without location and can use debug simulation.
- **No transition animation** — removed the "Entrando como…" loading overlay between login and player for a seamless experience.
- **Offline vault summary** — login shows each player's offline preparation state.

#### Offline & PWA
- **Mission Pack offline download** — players can download the full mission (payload, config, team profiles, field proofs, map tiles) from the Tools > Offline Prep panel before going to the field.
- **Map tile prefetch** — before going offline, the system prefetches all OSM tile URLs needed to cover the mission route.
- **Offline GPS storage** — last known GPS position is stored locally so the map can center correctly on first load even without a fresh fix.
- **Offline field proof cache** — field photos are cached locally and synced when connectivity returns.
- **Offline team presence** — team positions are cached and shown on the map even offline.
- **Service Worker hardening** — improved SW registration, unregister helper, and cache strategy for offline-first operation.
- **Local-first advance** — node submission falls back to local offline progression when the server is unreachable, queuing the event for sync.

#### Minigames
- **Minigame runtime system** — complete generic runtime architecture (`FamilyRuntimeHost`, `registry`, `resolver`, `runtime-bridge`) enabling any game family to run inside the player without coupling to PlayerApp.
- **Circuit Matrix** — connect circuit paths on a configurable grid to light up nodes. Visual circuit path editor in admin.
- **Sequence Code** — decode and replicate sequences. Admin editor with drag-and-drop sequence builder.
- **Bearing Hunt** — navigate by compass bearing toward a target. Definition with configurable tolerance.
- **Signal Hunt** — locate an oscillating signal source. Definition with configurable frequency and range.
- **Motion Challenge** — physical movement reto using device motion events. Admin editor with challenge config.
- **Place Mosaic** — reconstruct a fragmented image of a physical place. Admin editor.
- **Tilt Maze** — accelerometer-controlled maze. Shared tiltMaze physics module. Admin editor.

#### Admin panel
- **Game Template Wizard** — step-by-step wizard to create a new mission from a template, with game family selection.
- **Families panel** — browse and configure all available game families from a single panel.
- **QR Studio v2** — redesigned QR card generation studio with print-ready layouts, multiple formats, and batch generation.
- **Guided Node Editor Flow** — guided multi-step node creation flow: location → game type → physical QR → publish.
- **Physical node types** — full support for `collectible`, `requirement`, `clue`, and `bonus` node kinds, with visual indicators on the admin map.
- **Node physical type panel** — dedicated panel to configure physical QR parameters per node.
- **Requirement preview panel** — players can preview required items before activating a node.
- **Admin mission map** — improved map in admin with real-time player positions, node states, and field proof markers.
- **i18n / locale** — admin interface locale toggle (ES/EN) with full Spanish bridge for legacy strings.
- **Players panel** — create, edit and manage player profiles and team compositions.
- **Settings panel** — all mission-wide configuration in one place (site name, story, GPS radius, offline settings, etc.).

#### Deploy pipeline
- **`deploy_saga_safe.sh`** — zero-downtime blue/green deploy script:
  - Builds new Docker image
  - Starts candidate on alternate port (18096)
  - Runs smoke tests against candidate
  - Promotes to production (8096) only if all smokes pass
  - Cleans up candidate container
- **Version + build time injection** — `SAGA_VERSION` and `SAGA_BUILD_TIME` are injected at deploy time and shown in the BuildInfoBadge in the player UI.
- **Local timezone build time** — build time is captured in local timezone (CEST) instead of UTC to avoid confusion.

---

### 🔧 Improvements

- **PlayerApp refactor** — extracted layout primitives (`ScreenFrame`, `getViewportStyle`, `CelebrationOverlay`, `getTopOverlayStyle`, `getBottomOverlayStyle`, `getMapQuickControlsStyle`, `finishOverlayStyle`, etc.) into a dedicated `PlayerLayout.tsx` component, reducing `PlayerApp.tsx` from ~2300 lines.
- **GPS accuracy feedback** — GPS status now shows accuracy in meters when below threshold, with a separate "imprecise GPS" warning in the HUD helper text.
- **GPS staleness detection** — positions older than 15 seconds are marked "stale" and don't unlock nodes.
- **Distance display** — distance to active node shown in HUD with color-coded feedback (far / approaching / in range).
- **Map quick controls floating bar** — camera, team, route and QR buttons grouped in a pill-shaped glassmorphism bar centered above the HUD.
- **Toast notice system** — unified `ToastNotice` component for info/warning toasts with 3-second auto-dismiss.
- **BuildInfoBadge** — version + build time badge visible in login and player UI.
- **ErrorBoundary** — global React error boundary to prevent full crashes from rendering errors.
- **Collectible rewards rules** — `collectibleRules.ts` engine for evaluating unlock conditions on collected items.
- **Manual inventory collect panel** — UI for manually collecting physical inventory items.
- **OfflineSyncPanel** — status panel showing pending offline events and sync state.
- **Field prep panel** — pre-field preparation checklist with offline download controls.
- **Map surface CSS** — dedicated `map-surface.css` for Leaflet overrides and node marker styles.
- **GPS storage utilities** — `gpsStorage.ts` for persisting and reading the last GPS fix across sessions.
- **Stage position utilities** — `stagePosition.ts` for deriving active stage lat/lon/radius from payload.
- **Player identity** — `playerIdentity.ts` for avatar URL, initials and color derivation.
- **Player route** — `playerRoute.ts` for extracting player name from URL path.
- **Offline public config** — `offlinePublicConfig.ts` for caching and reading the public configuration offline.
- **Offline vault** — `offlineVault.ts` for persisting a cross-player offline readiness summary.

---

### 🐛 Bug fixes

- Fixed: field photo download produced a `.txt` file instead of `.zip` — corrected by using JSZip with proper MIME type and `Blob` construction.
- Fixed: duplicate `handleDownloadFieldProofs` function caused TypeScript compilation failure.
- Fixed: TypeScript import conflict between local declarations and imports from `PlayerLayout` (`getBottomOverlayStyle`, `getToastOverlayStyle`, `OverlayState`).
- Fixed: orphan closing `</div>` after removing the inner viewport wrapper caused JSX parse error and broken HUD layout.
- Fixed: `ScreenFrame` double-wrapper bug — `PlayerApp` was wrapping children in both `ScreenFrame` (which already applied `getViewportStyle`) and an additional `<div style={getViewportStyle()}>`, breaking the absolute positioning of both top and bottom HUD bars.
- Fixed: login to player transition showed a "Preparando jugador" loading card — removed in favor of an instant dark background.
- Fixed: second "Entrando como…" animation was playing on player load from the `StatusCard` component.
- Fixed: `OverlayState` type mismatch between `PlayerLayout` export and internal uses (`'activate' | 'node' | 'finish'` vs `'success' | 'finish' | 'error'`).
- Fixed: deploy script had Windows line endings (`\r\n`) causing bash `set -euo pipefail\r` error on Linux.

---

### 🗑️ Removed

- Removed "Preparando jugador" `StatusCard` from the idle/loading state — replaced with a plain dark background.
- Removed "Entrando como…" `StatusCard` overlay that appeared during login→player transition.
- Removed `launchingPlayer` state from `LoginApp` that triggered the transition animation.
- Removed floating route toggle button (replaced by the quick controls bar).
- Removed inline layout component definitions from `PlayerApp.tsx` (moved to `PlayerLayout.tsx`).

---

## [0.5.4] — 2026-06 (previous stable)

Last version before the v1.0.0 feature push. Included:
- Offline GPS hardening
- QR Studio initial version
- Map marker polish
- Universal fallback code
- SQLite runtime strict mode
- Audit and cleanup tooling

See `reports/v051-offline-gps-hardening.md` and previous release manifests for details.

---

## [0.5.0] — [0.5.3]
See `reports/release-0.5.0-manifest.md`.

## [0.4.0]
See `reports/release-0.4.0-manifest.md`.

## [0.3.1]
See `reports/release-0.3.1-security-manifest.md`.

## [0.3.0]
See `reports/release-0.3.0-manifest.md`.

## [0.2.0]
See `reports/release-0.2.0-manifest.md`.
