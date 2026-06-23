# SAGA Engine v0.5.4 — Tools and QR Studio release

SAGA Engine v0.5.4 improves the field experience without adding another game.
It consolidates offline preparation into a compact Tools panel and adds a safe,
validated QR card workflow to Mission Control.

## Compact field Tools

- Aligns Tools with the established SAGA player design.
- Removes duplicated headings and explanatory copy.
- Uses one action to prepare mission data, map tiles, games and field photographs for offline play.
- Keeps photograph downloads for the device gallery as a separate action.
- Preserves progress save, synchronization, GPS centring, language, fallback code and diagnostics.
- Leaves the bottom navigation and mobile safe areas unchanged.

## QR Studio

- Adds clear, dark and photographic card presets.
- Supports configurable accent colour and square or rounded cards.
- Optimizes uploaded header photographs without placing them over QR modules.
- Keeps QR codes on a white, high-contrast surface with error-correction level H.
- Adds camera validation using exact payload comparison.
- Blocks PNG export until the current payload and design have been validated.
- Invalidates the previous validation after any payload, photograph, colour, shape or preset change.
- Does not modify inventory, node completion or player progress during validation.

## Offline preparation

The preparation action now caches the player shell, mission configuration, map
tiles and field-proof assets together. Successful preparation remains compatible
with later progress saving and pending-event synchronization.

## Validation

- Dedicated Tools and QR Studio guard.
- Offline/GPS hardening and recovery guards.
- Marker, routing, privacy and protected-files guards.
- Runtime contracts inside Docker.
- TypeScript and Vite production build.
- npm audit with zero known vulnerabilities.
- Candidate-first Docker deployment and smoke checks for `/`, `/admin-react` and `/player/PLAYER%201`.

## Follow-up work

- Test QR scanning across more phones, cameras, screens, printers and lighting conditions.
- Consider PDF/A4 batch export after the single-card workflow is proven.
- Continue reducing the frontend bundle through game-level dynamic imports.
