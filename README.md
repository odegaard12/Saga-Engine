# SAGA Engine

SAGA Engine is a self-hosted engine for building geolocated games, real-world routes, and node-based interactive experiences.

It is designed for organizers who want full control over:
- player flow
- node progression
- admin-managed content
- fallback recovery using organizer-provided codes / runes
- self-hosted deployment

SAGA is already usable as a real engine for route-based experiences and is evolving toward a cleaner node model with stronger runtime validation and more explicit gameplay rules.

---

## What SAGA does

A SAGA experience is built around **nodes**.

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
- custom narrative / instructions
- fallback answer / rune
- per-node entry rules
- per-node GPS / hint messages

---

## Current project status

The current engine supports:

- player selection flow
- player game screen with map and current objective
- sequential node progression
- GPS-based node access
- organizer fallback progression using answer / rune
- mini-game based progression
- persistent admin authentication
- forced admin password change flow
- runtime node normalization and validation
- sanitized player payloads that do not expose fallback secrets

This means the public schema remains compatible and simple, while the backend already works internally with a cleaner runtime node model.

---

## Main routes

### Player selection
- Route: `/`

Players choose a player profile and enter the experience.

### Player game
- Route: `/player/{PLAYER_NAME}`

The player UI includes:
- interactive map
- active node
- distance to target
- code / rune input
- debug mode
- mini-game modal
- GPS notice / badge
- per-node hint support
- per-node GPS unavailable messaging

### Admin panel
- Route: `/admin`

The admin panel currently manages:
- site title
- admin texts
- story and prologue text
- players
- map center and zoom
- node list
- node coordinates
- node radius
- node type
- node content
- node config
- fallback answer / rune

Current admin editing still uses the simple public stage schema.  
The backend already normalizes that schema internally into a richer runtime model.

---

## Gameplay flow

Normal progression flow:

1. Player enters the game
2. Current state is loaded
3. Current active node is resolved
4. Map and node markers are rendered
5. GPS / entry conditions are evaluated
6. Player enters the active node
7. Mini-game or interaction is completed
8. Progress is saved
9. Next node becomes active

---

## Fallback progression: official feature

Fallback progression is an official engine feature.

This is useful when:
- browser geolocation is blocked
- GPS fails in the field
- the player cannot physically unlock the node
- a mini-game fails or becomes unusable
- the organizer wants to manually advance a team

Current progression backend accepts success through:

- mini-game success token: `OK`
- `answer`
- `rune`

So the current engine supports:
- normal completion
- organizer recovery
- field failure recovery
- manual override without destroying route continuity

---

## GPS / secure context notes

Real player GPS depends on browser secure context rules.

### Recommended
- HTTPS deployment
- reverse proxy / tunnel / public secure access
- real phone/browser testing over HTTPS

### Local development
Local plain HTTP by LAN IP may block geolocation entirely, even if the map itself works.

Typical example:
- map loads
- node markers load
- player screen opens
- browser never grants geolocation
- distance never updates

For that reason SAGA supports:
- visible GPS warning UI
- persistent small GPS badge
- DEBUG mode for local flow testing
- fallback progression using code / rune

---

## Debug mode

DEBUG is intended for:
- local UI testing
- route flow testing without real GPS
- node access simulation
- mini-game testing
- recovery during organizer checks

With the current runtime node model, a node can explicitly allow or deny debug bypass behavior.

---

## Admin authentication

Admin authentication is persistent.

It is no longer only a raw environment variable comparison on every request.

Current behavior:

- admin auth is stored in `data/admin_auth.json`
- bootstrap password can be initialized with `ADMIN_PASS`
- insecure / temporary passwords can trigger forced password change
- admin can be blocked from the panel until password is changed
- reset from terminal is supported with `ADMIN_RESET=1`

### Important
Do **not** commit:
- `.env`
- `data/admin_auth.json`

---

## Forced password change flow

If the current admin password is temporary or weak, the admin UI can require a password change before access is granted.

Typical flow:
1. bootstrap or reset from terminal
2. login with temporary password
3. UI shows password-change screen
4. admin cannot continue until a stronger password is saved

This is important for recovery workflows where terminal reset is allowed but the final deployed system should not remain exposed.

---

## Docker bootstrap / reset

### Normal bootstrap
```bash
docker rm -f saga_engine_app
docker run -d \
  --name saga_engine_app \
  -p 8096:5000 \
  -e ADMIN_PASS='YOUR_PASSWORD' \
  -v ~/saga_engine:/app \
  --restart unless-stopped \
  saga_engine:latest
```

### Forced reset
```bash
docker rm -f saga_engine_app
docker run -d \
  --name saga_engine_app \
  -p 8096:5000 \
  -e ADMIN_PASS='TEMPORARY_PASSWORD' \
  -e ADMIN_RESET='1' \
  -v ~/saga_engine:/app \
  --restart unless-stopped \
  saga_engine:latest
```

### Local development fallback only
```bash
ALLOW_DEFAULT_ADMIN=1
```

Use this only for local development, never for real deployments.

---

## Environment

Typical `.env` values:

```env
ADMIN_PASS=your_password_here
ALLOW_DEFAULT_ADMIN=0
ADMIN_RESET=0
```

Notes:
- `ADMIN_PASS` is required for normal use
- `ALLOW_DEFAULT_ADMIN=1` is development only
- `ADMIN_RESET=1` is for deliberate password recovery / reset

Do **not** commit `.env`.

---

## Current mini-games / interaction types

Current runtime supports these node types:

- `digital_tuner`
- `circuit_hack`
- `cryptex`
- `radio_azimuth`
- `gyro_storm`
- `simon_says`
- `switchboard`
- `compass_blow`

Frontend mini-game logic is mainly in:
- `static/minigames_final.js`

Player game flow logic also lives in:
- `templates/game.html`

---

## Data model

### Global config
Stored in:
- `config.json`

Typical fields:
- `site_name`
- `admin_title`
- `admin_subtitle`
- `story_title`
- `story_text`
- `map_center`
- `map_zoom`
- `players`
- `data_dir`
- `prologue_title`
- `prologue_subtitle`
- `prologue_body`

### Public stage schema (compatible / editable today)
Stored in:
- `data/stages.json`

Current editable schema still supports simple node objects like:

```json
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
```

### Optional legacy-compatible fields already supported by runtime
These fields can also be added today and are already interpreted by the runtime:

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
- `gps`
- `free`

Meaning:
- `gps`: node is expected to use GPS / distance rules
- `free`: node can be entered without proximity requirement

### Current note
The admin panel does not yet expose all these advanced entry/message fields visually.  
However, the backend runtime already supports them.

---

## Runtime node model (internal)

Internally, the backend now normalizes public stage nodes into a richer runtime structure.

Conceptually, the engine now works with sections like:

- `presentation`
- `location`
- `entry`
- `interaction`
- `success`
- `messages`
- `debug`

This internal runtime model allows:
- safer evolution without breaking existing stage files
- explicit entry rules
- explicit message handling
- cleaner future admin tooling
- stage validation before saving

### Runtime behavior currently included
- stage normalization from public JSON
- stage validation before `/api/admin/save`
- per-node entry rule interpretation
- per-node message interpretation
- sanitized player payload projection

---

## Sanitized player payload

Players no longer consume raw admin stage data.

Current player flow uses:
- `GET /api/game/{user}`

The player payload includes only what the player needs:
- level / finished state
- map-visible stage info
- current active node runtime info
- current node entry rules
- current node messages

It does **not** expose fallback secrets such as:
- `answer`
- `rune`

This is a major improvement over directly shipping raw stage definitions to the player client.

---

## Stage validation

When saving stages through admin, the backend now validates node data before writing it.

Validation currently checks things such as:
- title is present
- node type is supported
- config is an object
- entry mode is valid
- GPS nodes with proximity rules have valid lat/lon/radius
- success condition structure is valid

This reduces accidental broken saves and prepares the project for richer admin tooling.

---

## Current project structure

```text
main.py                      FastAPI backend
config.json                  Global configuration
.env.example                 Example environment values
Dockerfile                   Container build
data/
  stages.json                Node definitions
  gamestate.json             Player progression
  positions.json             Optional player positions
  admin_auth.json            Persistent admin auth (local only; do not commit)
templates/
  login.html                 Player selection
  game.html                  Player UI
  admin.html                 Admin panel
static/
  minigames_final.js         Frontend mini-game logic
```

---

## Local run (Python)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn jinja2
export $(grep -v '^#' .env | xargs)
python -m uvicorn main:app --host 0.0.0.0 --port 8097
```

---

## Docker run

Example bind-mount deployment:

```bash
docker run -d \
  --name saga_engine_app \
  -p 8096:5000 \
  -e ADMIN_PASS='your_password_here' \
  -v ~/saga_engine:/app \
  --restart unless-stopped \
  saga_engine:latest
```

If building locally first:

```bash
docker build -t saga_engine .
```

---

## Remote access

For real player use, HTTPS is strongly recommended.

You can expose SAGA using:
- reverse proxy
- tunnel
- VPN
- secure domain
- other secure remote access methods

Always protect `/admin`.

---

## Security notes

Before publishing or sharing a deployment:

- do not commit `.env`
- do not commit `data/admin_auth.json`
- do not expose `/admin` without protection
- do not rely on default or temporary passwords
- do not publish private player data
- use demo content in public repositories if needed

For real deployments:

- always set `ADMIN_PASS`
- keep `ALLOW_DEFAULT_ADMIN=0`
- use `ADMIN_RESET=1` only intentionally
- rotate temporary credentials immediately
- verify HTTPS for real player tests

---

## Use cases

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

## Current development direction

The engine is already usable, but active development is focused on:

1. richer node logic
2. better admin tools
3. more mini-games / interaction types
4. cleaner runtime / schema evolution
5. improved player UX

Current architecture direction is:

- keep public stage schema compatible
- evolve runtime node model internally
- expose safer player payloads
- move toward cleaner admin editing of richer node rules

---

## License

MIT recommended.
