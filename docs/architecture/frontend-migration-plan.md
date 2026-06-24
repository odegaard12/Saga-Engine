# Frontend migration plan

## Goal
Migrate the player experience from template-heavy inline frontend code to a modern frontend architecture without breaking the backend or deployment model.

## Target architecture
- Backend: FastAPI
- Frontend: React + TypeScript + Vite
- Delivery: browser-first, installable web app
- Optional later packaging: Capacitor for iPhone / Android
- Deployment: same repo, Docker kept for backend and overall deployment

## Why this path
- mobile-first UX matters for the product
- current player frontend has accumulated UI and JS complexity
- migration should be incremental, not a blind rewrite

## Migration phases

### Phase 0 - preparation
- document architecture decision
- create frontend workspace
- define initial folder structure
- identify backend API contracts used by player

### Phase 1 - player app foundation
- boot React + TypeScript app
- define app layout
- define shared mission/player state model
- define API client layer
- define map integration boundary

### Phase 2 - player shell and HUD
- reproduce shell
- reproduce mission status HUD
- reproduce debug state presentation
- preserve current mission behavior

### Phase 3 - map and mission interaction
- stage markers
- active node
- distance/range feedback
- debug simulated position
- player position handling

### Phase 4 - minigame integration strategy
- decide which minigames can be wrapped first
- isolate minigame mounting contract
- migrate one minigame at a time

### Phase 5 - installability and mobile polish
- web app manifest
- icons
- splash/setup polish
- offline strategy only if truly needed

### Phase 6 - optional native packaging
- Capacitor evaluation
- iPhone and Android packaging
- permissions review
- distribution strategy

## First technical objectives
1. keep current backend unchanged
2. create new frontend workspace
3. model player mission state clearly
4. migrate shell/HUD/map before deeper features
5. leave current template implementation as fallback until stable

## Risks
- duplicated frontend during migration
- inconsistent UX if both systems drift
- temptation to rewrite too much at once

## Risk mitigation
- migrate player only first
- avoid backend churn
- keep visual parity where possible
- define state shape early
