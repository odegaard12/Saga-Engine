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

At the same time, a new React frontend workspace is being built to evolve the player experience into a more modern mobile-first app flow.

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

### Important boundary

The production runtime still uses the existing FastAPI + template-based frontend.

The React frontend is currently:

- a work in progress
- a migration workspace
- not the production frontend yet
- not at full feature parity with the legacy player flow yet

---

## Stack

### Backend

- FastAPI
- Python
- Docker

### Frontend

Legacy template frontend:

- HTML
- JavaScript
- CSS

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

- `/` -> legacy player selection / login
- `/player/{PLAYER_NAME}` -> legacy player game UI
- `/admin` -> admin panel
- `/api/config` -> public config payload
- `/api/game/{user}` -> sanitized player payload
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
- `/player/...` -> proxied legacy player route when needed

This React flow is for development / migration work and does not replace the production template flow yet.

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
- `classic` / `glass` player themes

### React player direction

The React player iteration is moving toward:

- map-first mobile layout
- mission dock / bottom action area
- stronger app-like flow
- React mission entry to player transition
- cleaner mobile shell and overlays

### Still pending on the React side

- stronger interaction logic
- final top bar / HUD hierarchy
- full gameplay / mini-game bridge
- full parity with the legacy player flow
- final responsive and UX polish
- richer motion / transitions / microinteractions

---

## Mission Entry / Login

### Legacy login

The legacy runtime still ships with a template-based player selection/login flow under `/`.

### React mission entry

The React workspace now includes a first mission entry / login flow that:

- loads public config from `/api/config`
- uses `player_profiles` when available
- falls back to `players` when profiles are simple
- links mission entry to React player
- exposes admin access from the entry screen

This is the beginning of the new app flow, not the final visual/product version yet.

---

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

### Organizer recovery actions

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

Currently supported mini-game types:

- `digital_tuner`
- `circuit_hack`
- `cryptex`
- `radio_azimuth`
- `gyro_storm`
- `simon_says`
- `switchboard`
- `compass_blow`

These currently belong to the stable backend/template runtime.

The React migration has not fully migrated mini-games yet.

---

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

    GET /api/game/{user}

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

- answer
- rune

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

    config.json

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

    data/stages.json

Production live stage data can instead live in the external directory selected through `SAGA_DATA_DIR`.

Current editable schema still supports simple node objects like:

    {
      "id": 0,
      "title": "NODE TITLE",
      "lat": 42.0000,
      "lon": -8.0000,
      "radius": 50,
      "type": "circuit_hack",
      "content": "NODE TEXT",
      "config": {},
      "answer": "",
      "rune": ""
    }

Optional legacy-compatible fields already supported by runtime:

    {
      "hint": "Fallback hint shown inside the node",
      "gps_unavailable_message": "Custom message when GPS is unavailable",
      "locked_message": "Custom message for locked / distance state",
      "require_proximity": true,
      "allow_debug_bypass": true,
      "allow_manual_fallback_without_gps": true,
      "entry_mode": "gps"
    }

Supported `entry_mode` values:

- `gps` -> node is expected to use GPS / distance rules
- `free` -> node can be entered without proximity requirement

---

## Deployment

### Recommended production model

Current production uses:

- repo bind mount for app code
- external live data directory via `SAGA_DATA_DIR`

Typical production setup:

- repo: `~/saga_engine`
- live data dir: `~/saga_engine_data`
- container: `saga_engine_app`
- port: `8096 -> 5000`

### Production deployment example

    docker build -t saga_engine:latest ~/saga_engine

    docker rm -f saga_engine_app || true

    docker run -d \
      --name saga_engine_app \
      -p 8096:5000 \
      -e ADMIN_PASS='YOUR_PASSWORD' \
      -e SAGA_DATA_DIR=/app_data \
      -v ~/saga_engine:/app \
      -v ~/saga_engine_data:/app_data \
      --restart unless-stopped \
      saga_engine:latest

### Production smoke check

    curl -sS -o /tmp/saga_root.html  -w "GET / => HTTP %{http_code}\n" http://127.0.0.1:8096/
    curl -sS -o /tmp/saga_admin.html -w "GET /admin => HTTP %{http_code}\n" http://127.0.0.1:8096/admin
    curl -sS -o /tmp/saga_cfg.json   -w "GET /api/config => HTTP %{http_code}\n" http://127.0.0.1:8096/api/config
    docker logs --since=2m saga_engine_app 2>&1 | tail -n 40

---

## Local Development

### Backend / test runtime

    python3 -m venv .venv
    source .venv/bin/activate
    pip install fastapi uvicorn jinja2
    python -m uvicorn main:app --host 0.0.0.0 --port 8097

Or use the existing Docker-based test container if that is already part of your workflow.

### Frontend workspace

The new frontend workspace lives in:

    frontend/

Install and run:

    cd frontend
    npm install
    npm run dev -- --host 0.0.0.0

Default Vite dev behavior:

- backend test target expected at `http://127.0.0.1:8097`
- frontend default port is `5173`
- if `5173` is busy, Vite may move to another port

Useful development URLs:

- React mission entry: `http://127.0.0.1:5173/`
- React player direct: `http://127.0.0.1:5173/?user=PLAYER%201`

### Current frontend dev behavior

- no `?user` -> React mission entry / login flow
- with `?user` -> React player flow
- `/admin` still goes to backend admin
- legacy template runtime still exists and remains authoritative for production

---

## Project Structure

### Backend / runtime

- `main.py` -> FastAPI backend
- `templates/login.html` -> legacy player selection / login
- `templates/game.html` -> legacy player UI
- `templates/admin.html` -> admin panel
- `static/minigames_final.js` -> frontend mini-game logic
- `data/` -> demo / default data files

### Frontend workspace

- `frontend/src/App.tsx` -> React entry router (`LoginApp` vs `PlayerApp`)
- `frontend/src/login/LoginApp.tsx` -> React mission entry / login flow
- `frontend/src/player/PlayerApp.tsx` -> React player app
- `frontend/src/player/components/*` -> player shell / HUD / map surface
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
- define gameplay bridge with current runtime and mini-games
- keep backend untouched while the frontend evolves
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
