# SAGA Engine v0.2.0 release manifest

- Prepared: 2026-06-15T12:11:18Z
- Base main: `69b4bb43ae5652369c856ca677058bd8dd331bac`
- Tested gameplay source: `65d3c87ecf24bb962f4488b0fa52b6d3ca279ba8`
- Release branch: `release/0.2.0-circuit-matrix`
- Integration: one squashed release commit

## Production-ready

- Circuit Matrix
- Fixed and per-game random circuit patterns
- Visual circuit-pattern editor
- Physical QR objects, keys, clues and bonuses
- Guided Mission Control editor
- Offline progress and synchronization foundation
- Candidate-first safe deployment
- Visible version, commit and build time

## Included but not published as production gameplay

- Motion Challenge: parked experimental prototype
- GPS signal game: further field validation pending
- Bearing/compass game: further validation pending

## Planned

- Sequence Code
- Photo challenge
- Team challenge

## Changed files against main

```text
M	README.md
M	RELEASE_NOTES.md
M	VERSION
M	backend/app/runtime/minigames.py
M	frontend/package-lock.json
M	frontend/package.json
M	frontend/src/admin/AdminApp.tsx
M	frontend/src/admin/AdminMissionMap.tsx
M	frontend/src/admin/components/AdminMissionControlShell.tsx
M	frontend/src/admin/components/FamiliesPanel.tsx
M	frontend/src/admin/components/GuidedNodeEditorFlow.tsx
M	frontend/src/admin/components/NodeDetailDrawer.tsx
M	frontend/src/admin/components/PlayersPanel.tsx
A	frontend/src/admin/components/circuitPattern/CircuitPatternEditor.tsx
M	frontend/src/admin/lib/familyConfigs.ts
M	frontend/src/admin/lib/familySchemas.ts
M	frontend/src/admin/lib/gameCatalog.ts
M	frontend/src/admin/styles/admin-modern-shell.css
M	frontend/src/player/PlayerApp.tsx
M	frontend/src/player/components/InteractionSheet.tsx
M	frontend/src/player/minigames/core/FamilyRuntimeHost.tsx
M	frontend/src/player/minigames/core/family-types.ts
M	frontend/src/player/minigames/core/registry-types.ts
M	frontend/src/player/minigames/core/registry.ts
M	frontend/src/player/minigames/core/resolver.ts
M	frontend/src/player/minigames/core/runtime-bridge.ts
M	frontend/src/player/minigames/core/types.ts
M	frontend/src/player/minigames/families/circuitMatrix/RuntimeScreen.tsx
A	frontend/src/player/minigames/families/circuitMatrix/circuitConfig.ts
A	frontend/src/player/minigames/families/circuitMatrix/circuitPath.ts
M	frontend/src/player/minigames/families/circuitMatrix/definition.ts
A	frontend/src/player/minigames/families/motionChallenge/RuntimeScreen.tsx
A	frontend/src/player/minigames/families/motionChallenge/definition.ts
M	frontend/src/player/minigames/families/signalHunt/RuntimeScreen.tsx
M	frontend/src/player/runtime.ts
M	frontend/src/player/utils/debugGeolocationShim.ts
M	frontend/src/shared/api.ts
A	reports/decision-park-motion-challenge.md
A	reports/release-0.2.0-manifest.md
A	reports/v011-gps-signal-lock-validation.md
M	scripts/contract_check.py
M	scripts/deploy_saga_safe.sh
```

## Diff summary

```text
 README.md                                          |  48 +-
 RELEASE_NOTES.md                                   | 177 ++--
 VERSION                                            |   2 +-
 backend/app/runtime/minigames.py                   | 318 ++++++-
 frontend/package-lock.json                         |   4 +-
 frontend/package.json                              |   2 +-
 frontend/src/admin/AdminApp.tsx                    |  55 +-
 frontend/src/admin/AdminMissionMap.tsx             |  39 +-
 .../admin/components/AdminMissionControlShell.tsx  |   9 +-
 frontend/src/admin/components/FamiliesPanel.tsx    |   2 +-
 .../src/admin/components/GuidedNodeEditorFlow.tsx  | 316 +++++--
 frontend/src/admin/components/NodeDetailDrawer.tsx |  20 +-
 frontend/src/admin/components/PlayersPanel.tsx     |  67 +-
 .../circuitPattern/CircuitPatternEditor.tsx        | 565 +++++++++++++
 frontend/src/admin/lib/familyConfigs.ts            | 136 ++-
 frontend/src/admin/lib/familySchemas.ts            | 109 ++-
 frontend/src/admin/lib/gameCatalog.ts              | 152 +---
 frontend/src/admin/styles/admin-modern-shell.css   | 190 +++++
 frontend/src/player/PlayerApp.tsx                  |  11 +-
 .../src/player/components/InteractionSheet.tsx     |  10 +
 .../player/minigames/core/FamilyRuntimeHost.tsx    |  13 +
 frontend/src/player/minigames/core/family-types.ts |  36 +-
 .../src/player/minigames/core/registry-types.ts    |  10 +
 frontend/src/player/minigames/core/registry.ts     |   8 +
 frontend/src/player/minigames/core/resolver.ts     |  39 +-
 .../src/player/minigames/core/runtime-bridge.ts    |  31 +
 frontend/src/player/minigames/core/types.ts        |   1 +
 .../families/circuitMatrix/RuntimeScreen.tsx       | 912 ++++++++++++++++++---
 .../families/circuitMatrix/circuitConfig.ts        | 158 ++++
 .../families/circuitMatrix/circuitPath.ts          | 224 +++++
 .../minigames/families/circuitMatrix/definition.ts |  78 +-
 .../families/motionChallenge/RuntimeScreen.tsx     | 771 +++++++++++++++++
 .../families/motionChallenge/definition.ts         | 152 ++++
 .../families/signalHunt/RuntimeScreen.tsx          |  83 +-
 frontend/src/player/runtime.ts                     |   2 +-
 frontend/src/player/utils/debugGeolocationShim.ts  |  52 +-
 frontend/src/shared/api.ts                         |   8 +-
 reports/decision-park-motion-challenge.md          |  14 +
 reports/release-0.2.0-manifest.md                  |  81 ++
 reports/v011-gps-signal-lock-validation.md         |  54 ++
 scripts/contract_check.py                          | 203 ++++-
 scripts/deploy_saga_safe.sh                        |  12 +
 42 files changed, 4669 insertions(+), 505 deletions(-)
```
