# 🧭 SAGA Engine

SAGA Engine is a self-hosted engine for geolocated games, checkpoint missions, real-world interactive routes, and node-based interactive experiences.

It is designed for organizers who want full control over:

- player flow
- mission progression
- GPS-based node access
- admin-managed content
- fallback recovery via answer / rune
- self-hosted deployment
- live mission control and operator recovery actions

---

## Project Status

SAGA already has a usable backend/runtime for real route-based and checkpoint-based experiences.

At the same time, a React frontend workspace is being built to evolve the player experience into a more modern mobile-first app flow.

### Stable today

The FastAPI backend and current runtime already support:

- player selection flow
- player map / game screen
- sequential node progression
- GPS-based access
- fallback progression via answer / rune
- mini-game progression
- persistent admin authentication
- forced admin password change flow
- temporary admin login lockout
- sanitized player payloads
- runtime node normalization and validation
- player profiles / team-ready sessions
- Mission Control live status
- admin profile recovery actions
- compact admin node list
- improved node editor reachability
- player themes (`classic` / `glass`)
- English-first visible UI
- external live data directory via `SAGA_DATA_DIR`

### Frontend migration in progress

A new frontend workspace exists under `frontend/`.

Current React frontend stack:

- React
- TypeScript
- Vite
- Leaflet

Current React frontend scope:

- React mission entry / login flow
- React player shell
- React mission dock / HUD
- React map-first player layout
- Leaflet-based node rendering
- public config fetch via `/api/config`
- sanitized player payload consumption via `/api/game/{user}`
- team presence / live player overlays
- route-progress top shell
- interaction-sheet family runtime host for minigames

### Important boundary

The production backend serves the React player build when `frontend/dist` is available.

The React frontend is currently:

- a migration workspace
- served by the backend when frontend/dist exists
- still being completed toward full production gameplay polish

---

## Stack

### Backend

- FastAPI
- Python
- Docker

### Frontend

New frontend workspace:

- React
- TypeScript
- Vite
- Leaflet

### Runtime model

- repo-mounted app code
- optional external live data directory via `SAGA_DATA_DIR`

---

## What SAGA Does

A SAGA experience is built around nodes.

A node can represent:

- a real-world GPS point
- a challenge location
- a puzzle checkpoint
- a narrative stop
- a manual recovery / organizer override point

Players move through nodes in order.

At each node, the engine can combine:

- map location
- activation radius
- mini-game
- narrative / instructions
- organizer fallback answer / rune
- per-node entry rules
- per-node GPS / hint / locked messages

---

## Main Routes

### Stable backend routes

- `/` -> React mission entry / player app when `frontend/dist` exists
- `/player/{PLAYER_NAME}` -> backend-served React player route
- `/admin` -> React admin CMS
- `/admin-react` -> React admin shell for the new Mission Control/editor direction
- `/api/admin/react-overview` -> password-protected read-only React admin overview / Mission Control read model
- `/api/config` -> public config payload
- `/api/game/{user}` -> sanitized player payload
- `/api/team/{user}` -> team presence / player status payload
- `/api/heartbeat` -> live player heartbeat updates
- `/api/admin/login` -> admin login
- `/api/admin/change-password` -> admin password change flow
- `/api/admin/stages` -> admin stage data
- `/api/admin/save-config` -> save global config
- `/api/admin/save` -> save stages
- `/api/admin/mission-status` -> Mission Control live status
- `/api/admin/profile-action` -> admin profile recovery actions

### React frontend development flow

When running the frontend workspace locally through Vite:

- `/` -> React mission entry / login flow
- `/?user=PLAYER 1` -> React player directly
- `/admin` -> proxied backend admin
- `/player/...` -> backend-served React player route

This React flow is the active player direction.

---

## Player Experience

### Stable runtime today

The stable player runtime currently supports:

- map
- active node
- distance to target
- answer / rune input
- debug mode
- mini-game modal
- GPS warning UI
- persistent GPS badge
- per-node hint support
- per-node GPS unavailable messaging
- classic / glass player themes

### React player direction

The React player iteration is moving toward:

- map-first mobile layout
- mission dock / bottom action area
- stronger app-like flow
- React mission entry to player transition
- cleaner mobile shell and overlays
- player/team presence visibility
- faster live sync
- clearer route progress visualization

### Still pending on the React side

- stronger interaction logic
- final top bar / HUD hierarchy
- complete production gameplay polish on the React player flow
- richer motion / transitions / microinteractions
- complete family-native minigame implementations
- final fullscreen sensor gameplay

---

## Mission Entry / Login

### React mission entry

The React workspace now includes a first mission entry / login flow that:

- loads public config from `/api/config`
- uses `player_profiles` when available
- falls back to `players` when profiles are simple
- links mission entry to React player
- exposes admin access from the entry screen
- aligns visually with the glass/player shell direction

This is the beginning of the new app flow, not the final product version yet.

---


### Admin UI

The operator admin surface is the React admin CMS.

- `/admin-react` opens the React admin CMS / Mission Control shell.
- `/admin` redirects to `/admin-react`.
- Backend admin APIs remain active because the React admin uses them for authentication, mission settings, node persistence, player/profile management, Mission Control status and recovery actions.


## Admin Panel

The admin panel currently includes:

### Global config

- site title
- admin title / subtitle
- login subtitle
- story text
- prologue title / subtitle / body
- map center / zoom
- players
- player theme

### Mission Control

- compact per-profile live status
- live / stale / offline visibility
- current level / stage visibility
- GPS / last seen / position visibility
- organizer recovery actions:
  - reset profile
  - level -1
  - level +1
  - mark finished

### Nodes

- compact node list
- node coordinates
- node radius
- node type
- node content
- node config
- fallback answer / rune
- entry mode / flags
- hint / GPS unavailable / locked messages
- quick reordering
- improved node editor usability
- reachable save / delete actions

### Admin auth / safety

- persistent admin auth file
- forced password change flow
- temporary login lockout on repeated failures

---

## Supported Mini-Games

### Backend/player minigame policy

The normal backend, admin, and React player path now uses only family-native minigame types:

- `signal_hunt`
- `bearing_hunt`
- `circuit_matrix`

### React runtime foundation

The React/frontend runtime now includes a scalable family-based minigame foundation.

Current minigame families:

- `circuit_matrix`
- `bearing_hunt`
- `signal_hunt`

These are mechanic families, not a hard limit of three games. Future gameplay should usually be added as family-native variants, presets, and schemas first, so a mission can grow to 5, 10, or 20 game variants without creating 20 unrelated runtime systems.

Current runtime foundation includes:

- core minigame type system
- family configs and registry contracts
- native family runtime resolution
- stage/runtime resolution helpers
- `FamilyRuntimeHost`
- `InteractionSheet` integration for resolved family-native runtimes
- first fullscreen runtime shells for each family


### React player runtime policy

The React player runtime should use family-native minigame types as the normal path:

- `signal_hunt`
- `bearing_hunt`
- `circuit_matrix`

New work should use only family-native minigame types.


### What the families are for

#### `circuit_matrix`

Logic-heavy games such as:

- path restore
- switch logic
- route repair
- power balancing
- lock-style board logic
- sequence grids

#### `bearing_hunt`

Sensor/orientation games such as:

- compass lock
- stable heading hold
- directional sequence
- sector scan
- device orientation challenges

#### `signal_hunt`

Proximity/search games such as:

- source finding
- hot/cold search
- signal intensity lock
- GPS-based tracking
- audio/haptic guidance hunts

### Important note

Current family runtime screens are foundation shells, not final production gameplay yet.

New gameplay work should use family-native runtimes as the normal path.

---

### Schema compatibility boundary

New gameplay work should target only family-native runtimes.

## Runtime Model

The public editable schema remains simple, while the backend internally normalizes nodes into a richer runtime structure with sections such as:

- presentation
- location
- entry
- interaction
- success
- messages
- debug

This allows:

- safer schema evolution
- per-node entry rules
- per-node messages
- runtime validation before save
- safer player payload projection

---

## Sanitized Player Payload

Players do not consume raw admin stage data directly.

Current player runtime uses:

- `GET /api/game/{user}`

The player payload includes only what the player needs, such as:

- current user / display name
- session mode / profile context
- level / finished state
- map-visible stage info
- current active node runtime info
- current node entry rules
- current node messages
- live status / GPS-related state when available

It does not expose fallback secrets such as:

- `answer`
- `rune`

---

## Stage Validation

When saving stages through admin, the backend validates node data before writing it.

Validation currently checks things such as:

- title is present
- node type is supported
- config is an object
- entry mode is valid
- GPS nodes with proximity rules have valid lat/lon/radius
- success condition structure is valid

---

## Data Model

### Global config

Stored in:

- `config.json`

Typical fields include:

- `site_name`
- `admin_title`
- `admin_subtitle`
- `story_title`
- `story_text`
- `map_center`
- `map_zoom`
- `players`
- `player_profiles`
- `ui_lang`
- `player_theme`
- `prologue_title`
- `prologue_subtitle`
- `prologue_body`

Players can still be kept simple, but the runtime also supports richer profile / team-ready normalization internally.

### Public stage schema

Default/demo stage schema lives in:

- `data/stages.json`

Production live stage data can instead live in the external directory selected through `SAGA_DATA_DIR`.

Current editable schema supports simple node objects. New stages should prefer family-native minigame types like:

```json
{
  "id": 0,
  "title": "NODE TITLE",
  "lat": 42.0000,
  "lon": -8.0000,
  "radius": 50,
  "type": "signal_hunt",
  "content": "NODE TEXT",
  "config": {
    "objective": "proximity_lock",
    "source_radius_m": 75,
    "lock_threshold": 65,
    "hold_ms": 1500
  },
  "answer": "",
  "rune": ""
}
```

Optional compatibility fields already supported by runtime:

```json
{
  "hint": "Fallback hint shown inside the node",
  "gps_unavailable_message": "Custom message when GPS is unavailable",
  "locked_message": "Custom message for locked / distance state",
  "require_proximity": true,
  "allow_debug_bypass": true,
  "allow_manual_fallback_without_gps": true,
  "entry_mode": "gps"
}
```

Supported `entry_mode` values:

- `gps` -> node is expected to use GPS / distance rules
- `free` -> node can be entered without proximity requirement

### Runtime-oriented minigame shape

The React/frontend runtime now also supports a richer per-stage runtime minigame block:

```json
{
  "minigame": {
    "type": "bearing_hunt",
    "version": "v1",
    "label": "Bearing Hunt",
    "config": {
      "objective": "single_lock",
      "tolerance_deg": 12,
      "hold_ms": 1200
    }
  }
}
```

This coexists with the simple `type` + `config` stage shape during schema evolution.

---

## Deployment

### Recommended production model

Current production uses:

- repo bind mount for app code
- external live data directory via `SAGA_DATA_DIR`

Typical production setup:

- repo: `/path/to/saga-engine`
- live data dir: `/path/to/saga-live-data`
- container: `saga_engine_app_example`
- port: `8096 -> 5000`

### Production deployment example

```bash
docker build -t saga_engine:latest /path/to/saga-engine

docker rm -f saga_engine_app_example || true

docker run -d \
  --name saga_engine_app_example \
  -p <HOST_PORT>:5000 \
    -e SAGA_DATA_DIR=/app_data \
  -v /path/to/saga-engine:/app \
  -v /path/to/saga-live-data:/app_data \
  --restart unless-stopped \
  saga_engine:latest
```

### Production smoke check

```bash
curl -sS -o /tmp/saga_root.html  -w "GET / => HTTP %{http_code}\n" http://127.0.0.1:<HOST_PORT>/
curl -sS -o /tmp/saga_admin.html -w "GET /admin => HTTP %{http_code}\n" http://127.0.0.1:<HOST_PORT>/admin
curl -sS -o /tmp/saga_cfg.json   -w "GET /api/config => HTTP %{http_code}\n" http://127.0.0.1:<HOST_PORT>/api/config
docker logs --since=2m saga_engine_app_example 2>&1 | tail -n 40
```

---

## Local Development

### Backend / test runtime

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn jinja2
python -m uvicorn main:app --host 127.0.0.1 --port <DEV_BACKEND_PORT>
```

Or use the existing Docker-based test container if that is already part of your workflow.

### Frontend workspace

The new frontend workspace lives in:

- `frontend/`

Install and run:

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Default Vite dev behavior:

- backend test target expected at `http://127.0.0.1:<DEV_BACKEND_PORT>`
- frontend default port is `5173`
- if `5173` is busy, Vite may move to another port

Useful development URLs:

- React mission entry: `http://127.0.0.1:<DEV_FRONTEND_PORT>/`
- React player direct: `http://127.0.0.1:<DEV_FRONTEND_PORT>/?user=PLAYER%201`

### Current frontend dev behavior

- no `?user` -> React mission entry / login flow
- with `?user` -> React player flow
- `/admin` still goes to the current backend admin
- `/admin-react` opens the new React admin shell
- React build is the primary player route when served by the backend

---

## Project Structure

### Backend / runtime

- `main.py` -> FastAPI backend
- `data/` -> demo / default data files

### Frontend workspace

- `frontend/src/App.tsx` -> React entry router (`LoginApp` vs `PlayerApp`)
- `frontend/src/login/LoginApp.tsx` -> React mission entry / login flow
- `frontend/src/player/PlayerApp.tsx` -> React player app
- `frontend/src/admin/AdminApp.tsx` -> React admin minimal protected login, modern operator shell, persistent mission settings, persistent player/profile editing, family config editor, local CMS actions, resilient node save/delete/reorder flow, map click/drag node editing, map-first workspace and editable-preview node drawer
- `frontend/src/admin/AdminMissionMap.tsx` -> React admin Leaflet mission map with visible numbered pins, click-to-create and drag-to-move editing
- `frontend/src/player/components/*` -> player shell / HUD / map surface / interaction sheet
- `frontend/src/player/minigames/core/*` -> family runtime contracts, resolver and runtime host
- `frontend/src/player/minigames/gameCatalog.ts` and `frontend/src/player/minigames/registry.ts` -> family-native React minigame catalog/registry
- `frontend/src/player/minigames/families/*` -> family definitions and fullscreen runtime screens
- `frontend/src/shared/api.ts` -> frontend API calls
- `frontend/src/types/player.ts` -> shared frontend types

### Architecture docs

Migration and architecture planning live in:

- `docs/architecture/adr-001-player-frontend-migration.md`
- `docs/architecture/frontend-migration-plan.md`

---

## Security Notes

Before public or shared deployments:

- do not commit `.env`
- do not commit live runtime data
- do not expose `/admin` without protection
- do not rely on temporary passwords
- prefer HTTPS for real player usage

Live runtime data should stay outside the repo-mounted code directory.

Typical live files include:

- `stages.json`
- `gamestate.json`
- `positions.json`
- `admin_auth.json`

See also:

- `SECURITY.md`

---

## Use Cases

SAGA can be used for:

- outdoor games
- ARG experiences
- geolocated routes
- tourism experiences
- puzzle routes
- educational activities
- team challenges
- organizer-managed recovery flows

---

## Development Direction

Current direction:

- keep public stage schema compatible
- evolve runtime node model internally
- expose safer player payloads
- improve admin editing of richer node rules
- improve player UX
- reduce deploy friction
- keep live runtime data separated from code

### React frontend direction

Near-term direction for the new frontend:

- strengthen mission entry / login flow
- continue improving the mobile-first player shell
- refine top bar / HUD / menu logic
- build full production gameplay on top of the family runtime foundation
- continue building family-native minigame variants, presets, and schemas
- add admin editing for family minigame configuration
- keep backend stable while the frontend runtime evolves
- target a stronger installable web app / PWA flow before considering mobile packaging

### Product potential

Longer-term, SAGA can evolve into:

- a stronger mission runtime
- a better mobile player app / PWA
- a richer Mission Control live ops console
- a more powerful mission editor / CMS
- a reusable platform for advanced geolocated experiences

---

## License

MIT recommended.


## Nota de seguridad operativa

Este repositorio público documenta un modelo de despliegue genérico. Los detalles reales de red, puertos internos, rutas locales, credenciales, contraseñas de administración, datos vivos de misión y backups deben mantenerse fuera del repositorio y configurarse únicamente en entornos privados.

Para desarrollo local, los ejemplos usan `127.0.0.1` por defecto. Exponer servicios en `0.0.0.0` solo debe hacerse en redes controladas y con medidas de protección adicionales.
