# Minigames and physical interactions audit

This document captures the current gameplay state after the iPhone fullscreen recovery and Mission Control polish work.

## Current baseline

Current safe baseline:

- iPhone fullscreen player baseline restored.
- Signal Hunt runtime fix restored.
- Gated debug GPS restored.
- Player GPS/offline copy improved.
- Mission Control polish roadmap added.
- Admin visual polish applied separately from the player shell.

Future gameplay work must keep player fullscreen safety separate from minigame, QR/NFC and admin changes.

## Current family-native minigames

**Actualizado 2026-09-18** — desactualizado desde hace tiempo respecto al código real, verificado contra `frontend/src/player/minigames/core/resolver.ts` y `backend/app/runtime/core_engine.py`.

El backend define 10 `interaction_type` en `backend/app/runtime/minigames.py` (`SUPPORTED_MINIGAME_TYPES`): `circuit_matrix`, `signal_hunt`, `bearing_hunt`, `motion_challenge`, `audio_challenge`, `sequence_code`, `tilt_maze`, `place_mosaic`, `spark_radar`, `checkpoint`.

De esos 10, el frontend solo tiene **5 runtimes nativos** (`resolver.ts: isNativeMinigameFamily`):

- `signal_hunt`
- `bearing_hunt`
- `circuit_matrix`
- `motion_challenge`
- `audio_challenge`

**3 más son alias de `circuit_matrix`** — el backend los reetiqueta antes de llegar al jugador (`core_engine.py:157-160`), y el frontend cambia solo la etiqueta visible según `config.game_id` (`resolver.ts:113-121`):

- `sequence_code` → se sirve como `circuit_matrix`, se muestra como "Simón Dice"
- `place_mosaic` → se sirve como `circuit_matrix`, se muestra como "Mosaico del lugar"
- `tilt_maze` → se sirve como `circuit_matrix`, se muestra como "Laberinto de equilibrio"

**2 no tienen runtime propio** y caen en fallback silencioso a `signal_hunt` si un nodo los usa (`core_engine.py:161-172`; el fallback ahora se marca con `⚠️` en el panel admin, ver `backend/app/runtime/admin_overview.py: type_fallback_reason`):

- `checkpoint` → se reetiqueta a `signal_hunt` con `game_id: "simple_checkpoint"` (`core_engine.py:161-164`) — es intencional, no un bug, pero no tiene su propia mecánica.
- `spark_radar` → sin alias, cae directamente en `unsupported_minigame_type:spark_radar` → `signal_hunt` genérico. Existe una carpeta `frontend/src/player/minigames/families/sparkRadar/` sin cablear en el resolver — trabajo a medias, no arrancado desde cero.

También hay una carpeta `families/teamRelay/` sin tipo de backend asociado y sin importar en `resolver.ts` — prototipo huérfano, no forma parte de los 10 tipos soportados.

Relevant family runtime files:

- `frontend/src/player/minigames/core/FamilyRuntimeHost.tsx`
- `frontend/src/player/minigames/core/resolver.ts`
- `frontend/src/player/minigames/core/runtime-bridge.ts`
- `frontend/src/player/minigames/core/registry.ts`
- `frontend/src/player/minigames/families/signalHunt/definition.ts`
- `frontend/src/player/minigames/families/signalHunt/RuntimeScreen.tsx`
- `frontend/src/player/minigames/families/bearingHunt/definition.ts`
- `frontend/src/player/minigames/families/bearingHunt/RuntimeScreen.tsx`
- `frontend/src/player/minigames/families/circuitMatrix/definition.ts`
- `frontend/src/player/minigames/families/circuitMatrix/RuntimeScreen.tsx`
- `frontend/src/player/minigames/families/motionChallenge/definition.ts`
- `frontend/src/player/minigames/families/audioChallenge/definition.ts`

## Legacy/demo game components

The old standalone demo game components have been removed from the active frontend tree.

The current player path should use family-native runtimes only:

- `signal_hunt`
- `bearing_hunt`
- `circuit_matrix`
- `motion_challenge`
- `audio_challenge`

Future gameplay work should add or port games as family-native definitions and runtimes, not as disconnected standalone components. `sparkRadar` and `teamRelay` are the two candidates already half-started.

## Family audit priorities

### 1. Signal Hunt

Known status:

- Uses GPS/distance/source radius logic.
- Has lock/capture progress.
- Has timeout/update parameters.
- Already received a runtime recovery fix.
- Depends on live or debug geolocation.

Audit goals:

- confirm capture behavior on real iPhone PWA
- confirm degraded GPS behavior
- confirm lock threshold and hold timing
- improve player-facing error/status messages
- add smoke tests around config validation and runtime bridge
- confirm offline completion behavior

### 2. Bearing Hunt

Known status:

- Uses heading/device orientation.
- Has compass-style lock/capture progress.
- Includes degraded/manual sensor hints.
- More fragile on mobile because browser orientation APIs vary.

Audit goals:

- test on iPhone Safari/PWA
- test permission/sensor unavailable states
- improve compass fallback text
- ensure no impossible challenge if heading is unavailable
- decide whether a manual calibration/fallback mode is needed
- add config/runtime smoke tests

### 3. Circuit Matrix

Known status:

- Logic/grid family.
- Supports manual code fallback in its definition.
- Should be less dependent on GPS/sensors than the other families.

Audit goals:

- confirm real puzzle mechanics are implemented, not only placeholder shell
- confirm validation and completion path
- confirm max moves/time behavior
- add deterministic tests
- improve UX if currently only a placeholder runtime

## Physical interactions current state

Current foundations exist for physical gameplay:

- offline physical event queue
- QR/NFC/manual event sources
- local-first inventory
- manual inventory collection panel
- backend event validation
- admin interaction method fields
- offline mission pack and sync

But this is not yet a finished product flow.

## QR/NFC/manual audit

### Current likely state

The system appears to support the idea of:

- physical item/event capture
- inventory snapshots
- manual collection
- offline queueing
- later sync

But the player experience still needs stronger implementation:

- QR scan with camera
- NFC trigger where supported
- manual code fallback
- clear success/failure UI
- backend validation messages exposed cleanly
- admin configuration for codes/items/requirements

### Recommended sequence

1. Audit current physical event data model.
2. Improve manual collection UX first.
3. Add QR scanning behind a safe fallback.
4. Keep NFC optional and later because browser support is limited.
5. Add admin clarity for QR/NFC/manual fields.
6. Add backend validation tests for physical events.
7. Add offline sync tests for physical capture.

## Proposed PR sequence

Recommended next work:

1. `test(player): add minigame runtime bridge smoke checks`
2. `docs(gameplay): audit QR NFC manual flow`
3. `fix(signal_hunt): clarify runtime states and failure copy`
4. `fix(bearing_hunt): improve heading fallback UX`
5. `fix(circuit_matrix): complete deterministic runtime audit`
6. `player: improve manual physical collection panel`
7. `player: add QR scanner behind manual fallback`
8. `admin: clarify physical interaction settings`
9. `test: physical event validation and offline sync`
10. `feat: add a new minigame family only after existing families are stable`

## Safety rules

Gameplay PRs should avoid:

- `frontend/index.html`
- PWA manifest
- global CSS
- player fullscreen shell layout
- map shell layout
- unrelated admin polish
- unrelated login redesign

Gameplay PRs should prefer:

- one family at a time
- one physical interaction flow at a time
- tests or docs before large UI changes
- iPhone PWA validation when touching player runtime
- Docker smoke after deployed player changes

## New game ideas after stabilization

Only after current families are stable, possible new families:

- QR relic hunt
- audio clue / frequency tune
- photo alignment challenge
- team split/asymmetric puzzle
- route memory challenge
- timed checkpoint relay
- NFC/object exchange quest
- environmental observation quiz

New families should be built as family-native runtimes, not as disconnected standalone components.
