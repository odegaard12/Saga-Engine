# SAGA Engine v0.3.0 release manifest

- Prepared: 2026-06-16T08:50:45Z
- Base main: `435f61bca889d0e02608b01572252773690a2221`
- Tested source: `fa14c77580c91da810f926cdf9c9d1249d24c094`
- Source commits: 6
- Release branch: `release/0.3.0-sequence-code`
- Integration: one squashed release commit

## Production-ready games

- Circuit Matrix
- Sequence Code

## Sequence Code guarantees

- Exact configured token order is persisted
- Invalid and duplicate token sets are rejected
- Wrong completion code does not advance
- Correct completion advances exactly one node
- Player reloads the following node
- Offline runtime and synchronization are supported
- Visual design follows the SAGA player system

## Reliability changes

- Backend save responses are verified
- Persisted stages are compared with the submitted payload
- Player mission refreshes when the tab becomes active
- Service-worker navigation is network-first with offline fallback
- Config and build metadata requests bypass stale caches

## Files changed against main

```text
M	CHANGELOG.md
M	README.md
M	RELEASE_NOTES.md
M	VERSION
M	backend/app/runtime/minigames.py
M	frontend/package-lock.json
M	frontend/package.json
M	frontend/public/sw.js
M	frontend/src/admin/AdminApp.tsx
M	frontend/src/admin/components/GuidedNodeEditorFlow.tsx
A	frontend/src/admin/components/sequenceCode/SequenceCodeEditor.tsx
M	frontend/src/admin/lib/adminApi.ts
M	frontend/src/admin/lib/adminStagePersistence.ts
M	frontend/src/admin/lib/familyConfigs.ts
M	frontend/src/admin/lib/gameCatalog.ts
M	frontend/src/player/PlayerApp.tsx
M	frontend/src/player/minigames/core/FamilyRuntimeHost.tsx
M	frontend/src/player/minigames/core/family-types.ts
M	frontend/src/player/minigames/core/resolver.ts
M	frontend/src/player/minigames/families/circuitMatrix/definition.ts
A	frontend/src/player/minigames/families/sequenceCode/RuntimeScreen.tsx
M	frontend/src/player/offline/pwaShell.ts
M	frontend/src/shared/api.ts
M	scripts/contract_check.py
```

## Diff summary

```text
 CHANGELOG.md                                       |  10 +-
 README.md                                          |  21 +-
 RELEASE_NOTES.md                                   | 127 +--
 VERSION                                            |   2 +-
 backend/app/runtime/minigames.py                   |  90 +-
 frontend/package-lock.json                         |   4 +-
 frontend/package.json                              |   2 +-
 frontend/public/sw.js                              |  39 +-
 frontend/src/admin/AdminApp.tsx                    |  43 +-
 .../src/admin/components/GuidedNodeEditorFlow.tsx  | 176 +++-
 .../components/sequenceCode/SequenceCodeEditor.tsx | 462 ++++++++++
 frontend/src/admin/lib/adminApi.ts                 |  74 +-
 frontend/src/admin/lib/adminStagePersistence.ts    | 186 ++++
 frontend/src/admin/lib/familyConfigs.ts            |  49 ++
 frontend/src/admin/lib/gameCatalog.ts              |  39 +-
 frontend/src/player/PlayerApp.tsx                  |  85 ++
 .../player/minigames/core/FamilyRuntimeHost.tsx    |  16 +
 frontend/src/player/minigames/core/family-types.ts |   7 +
 frontend/src/player/minigames/core/resolver.ts     |  15 +-
 .../minigames/families/circuitMatrix/definition.ts |  89 ++
 .../families/sequenceCode/RuntimeScreen.tsx        | 946 +++++++++++++++++++++
 frontend/src/player/offline/pwaShell.ts            |  52 +-
 frontend/src/shared/api.ts                         |  31 +-
 scripts/contract_check.py                          | 227 +++++
 24 files changed, 2635 insertions(+), 157 deletions(-)
```
