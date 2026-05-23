# iOS PWA fullscreen guardrails

This project has a validated iPhone Add to Home Screen fullscreen baseline.

## Known good baselines

- `ios-fullscreen-restored-main-20260522`
  - Restored the last known iPhone fullscreen-good frontend baseline.
- `ios-fullscreen-signalhunt-20260523`
  - Added the safe Signal Hunt runtime fix.
- `ios-fullscreen-signalhunt-debuggps-20260523`
  - Added the gated debug geolocation shim.

## Known bad baseline

- `ios-fullscreen-bad-pr178`
  - Regression source: PR #178 / commit `b587abf`.
  - Do not reintroduce this commit wholesale.

## Rule

Never recover or merge broad UI/PWA shell changes without real iPhone Add to Home Screen testing.

Desktop browser emulation and Safari browser mode are not sufficient.

## Fullscreen-sensitive files

Changes to any of these files require explicit iPhone PWA validation before merge:

- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/index.css`
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/mobile-shell.css`
- `frontend/src/login/*`
- `frontend/src/player/FirstRunGate.tsx`
- `frontend/src/player/IntroGate.tsx`
- `frontend/src/player/PlayerEntrance.tsx`
- `frontend/src/player/PlayerApp.tsx`
- `frontend/src/player/components/MapSurface.tsx`
- `frontend/src/player/components/PlayerHud.tsx`
- `frontend/src/player/components/PlayerShell.tsx`
- `frontend/src/shared/gpsPrewarm.ts`
- `frontend/src/shared/transitions.ts`
- `frontend/src/player/autoOfflinePack.ts`
- `frontend/src/player/offline/pwaShell.ts`

## Safe recovery pattern

Recover post-PR176 work only in small PRs:

1. One feature per branch.
2. No broad shell/theme changes.
3. Run guards.
4. Run frontend build.
5. Deploy to Raspberry Pi Docker production path.
6. Smoke `/api/game/PLAYER%201`.
7. Test iPhone installed PWA.
8. Merge only after validation.

## Validated recovery after restoration

- PR #182 restored only the Signal Hunt runtime fix.
- PR #183 restored only the gated debug geolocation shim.
