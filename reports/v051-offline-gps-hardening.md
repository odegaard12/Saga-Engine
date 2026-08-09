# SAGA Engine v0.5.1-dev — Offline and GPS hardening

This hardening pass strengthens the four production-ready games and
physical-node flows without changing their game rules.

## Offline recovery

- Synchronizes both existing offline queues before refreshing mission state.
- Runs recovery on browser focus, visibility changes, connectivity recovery
  and the existing periodic refresh.
- Adds `client_event_id` to IndexedDB progression events.
- Reconciles backend results by event identifier rather than array position.
- Keeps rejected events queued for review instead of deleting them.
- Preserves backend-authoritative node IDs, requirements and progression.

## GPS safety

- Stored coordinates are map-centering hints only.
- A stored or expired location cannot unlock a node.
- Live positions expire after 45 seconds without a new reading.
- Browser-reported accuracy is considered before unlocking.
- Reactivating GPS clears and recreates `watchPosition`.
- Accuracy and capture timestamps are stored locally.
- Heartbeats do not publish an old stored coordinate as a new live reading.

## Debug and PWA

- Removes the legacy global geolocation shim from normal startup.
- Keeps the explicit map debug workflow inside PlayerApp.
- Uses the same cache version in `pwaShell.ts` and `sw.js`.

## Tools and mobile browser UI

- Replaces the separate mission-pack and queue cards with one offline control panel.
- Makes `Download offline game` the primary action.
- Keeps explicit actions for updating local progress and synchronizing both queues.
- Saving the current snapshot no longer creates an artificial queue event.
- Shows mission-progression and QR/inventory pending counts separately.
- Expands the Tools sheet while preserving safe-area padding.
- Raises photo, players and route controls by 22 px in normal mobile browsers.
- Keeps the existing position in installed/full-screen PWA mode.

## Map recovery and offline tiles

- Stored GPS no longer centers or draws the player at application start.
- The first fresh GPS reading centers the player.
- The compass button centers the player and enables continuous following.
- Dragging the map disables following until the compass is pressed again.
- Leaflet invalidates and redraws after connectivity recovery, page restoration and mission refresh.
- Offline preparation downloads satellite tiles around mission nodes at zoom levels 15–18.
- The offline tools card is shorter and uses the same visual language as other Tools controls.
- Mobile bottom controls respect the safe-area inset.
- Installed PWA mode prefers fullscreen where supported.

## Compass route toggle

- First compass press displays all mission nodes and the current player position.
- Second press returns to the player and restores continuous following.
- Manual map dragging disables following without blocking free exploration.
- The main preparation action is labelled DESCARGAR JUEGO OFFLINE.
- That action stores the mission, application shell and map tiles.
- Save-progress and synchronization remain separate actions.

## Bottom bar and marker polish

- Restores the installed-player bottom overlay to bottom zero.
- Keeps the browser-only lift for Safari and normal mobile browsers.
- Removes stars from collectible QR markers.
- Uses cleaner numbered nodes and subdued locked-node styling.
- Replaces harsh blinking with slow breathing animations.
- Avoids rebuilding the local-player icon on every GPS update.
