# Mission Control polish roadmap

SAGA Engine has a stable iPhone fullscreen player baseline. Future UI work must keep player fullscreen safety separate from admin and Mission Control polish.

## Safe baseline

Recent safe recovery work:

- iPhone fullscreen baseline restored.
- Signal Hunt runtime fix recovered.
- Gated debug GPS recovered.
- iOS PWA fullscreen guardrails documented.
- GPS guidance, field prep, offline sync and mission pack copy improved.

## Admin-only polish area

Preferred admin targets:

- frontend/src/admin/AdminApp.tsx
- frontend/src/admin/AdminMissionMap.tsx
- frontend/src/admin/components/AdminMissionControlShell.tsx
- frontend/src/admin/components/FamiliesPanel.tsx
- frontend/src/admin/components/NodeDetailDrawer.tsx
- frontend/src/admin/components/PlayersPanel.tsx
- frontend/src/admin/components/SettingsPanel.tsx
- frontend/src/admin/styles/admin-modern-shell.css

## Files to avoid

Admin polish PRs must not touch:

- frontend/index.html
- frontend/public/manifest.webmanifest
- frontend/src/main.tsx
- frontend/src/index.css
- frontend/src/styles/tokens.css
- frontend/src/styles/mobile-shell.css
- frontend/src/login
- frontend/src/player/PlayerApp.tsx
- frontend/src/player/components/MapSurface.tsx
- player fullscreen, viewport or safe-area layout code

## Mission Control goals

Mission Control should become clearer and more visual:

- better mission status header
- clearer node and stage state
- better selected-node detail panel
- stronger map/list relationship
- clearer player/team monitoring
- better warnings and empty states

## QR/NFC and physical interactions

QR/NFC/manual gameplay has foundations, but still needs a finished user flow.

Known foundations:

- offline physical event queue
- QR/NFC/manual event sources
- local-first inventory
- manual inventory collection panel
- backend event validation
- admin interaction method fields

Future sequence:

1. audit current QR/NFC/manual implementation
2. improve manual fallback UX
3. add real QR scanning
4. improve backend validation messages
5. expose admin configuration clearly
6. add NFC polish later where supported

## Minigames

Current families to audit separately:

- signal_hunt
- bearing_hunt
- circuit_matrix

Each should be checked for mobile usability, sensor fallback, error messages, offline behavior, runtime payload validation and admin configuration clarity.

## Proposed next PRs

1. admin: polish Mission Control shell hierarchy
2. admin: clarify node detail drawer sections
3. admin: clarify physical interaction settings
4. docs: audit minigame family runtime state
5. docs: audit QR/NFC physical interaction flow
6. player: improve manual physical item collection UX
7. player: add QR scan flow behind fallback
8. login: copy-only polish
9. login: local card visual polish
10. login: local-only micro animation

## Animation guardrails

Allowed:

- local admin panel fade-ins
- local status/badge transitions
- local button microinteractions
- local saving/loading indicators

Avoid:

- global page transitions
- root/body/html height changes
- fullscreen wrappers
- viewport unit changes
- safe-area global rewrites
- player map shell changes
- PWA manifest or install behavior changes

## Validation rule

Every UI PR should include:

- changed-file check
- repository guards
- frontend build
- Docker smoke when runtime/frontend is affected
- real iPhone PWA check if any player file changes

Admin-only docs do not need a fullscreen tag unless they affect deployed player behavior.
