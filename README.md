# 🚀 SAGA Engine

SAGA is a self-hosted engine for building geolocated games, real-world routes, and interactive node-based experiences.

Design your own adventure, host it yourself, and control the full player flow.

---

## ✨ Features

- Interactive map-based gameplay
- Player selection system
- Node-based progression
- GPS-based node access
- Manual fallback progression using organizer-provided codes / runes
- Multiple mini-game types
- Admin panel for editing game content
- JSON-based storage
- Persistent admin authentication
- Forced admin password change flow for temporary / insecure passwords
- Docker-friendly deployment
- Suitable for local testing and remote HTTPS deployments

---

## 🧠 Concept

SAGA works around **nodes**.

Each node is a real-world location that can include:

- Coordinates
- Activation radius
- A mini-game or interaction
- Custom text or instructions
- A fallback code / rune
- Per-node configuration

Players move across the route, unlock nodes, complete interactions, and progress through the experience.

---

## 🖥️ Main Routes

### Player Selection
- Route: `/`

Players choose a profile and enter the game.

### Player Game View
- Route: `/player/{PLAYER_NAME}`

Includes:

- Interactive map
- Current objective
- Distance to active node
- Rune / code input
- Debug mode
- Mini-game modal
- GPS status feedback

### Admin Panel
- Route: `/admin`

Admin can control:

- Titles and subtitles
- Story and prologue text
- Players
- Map center and zoom
- Nodes
- Node position, radius, content, type, rune, config

Nodes can also be created directly from the map.

---

## 🔄 Gameplay Flow

Normal flow:

1. Player enters the game
2. Current progression is loaded
3. Active node is determined
4. Map and objective are rendered
5. Distance to node is evaluated
6. Player reaches the active node area
7. Mini-game or interaction is completed
8. Progress is saved
9. Next node becomes active

---

## 🔐 Fallback Progression (Codes / Runes)

SAGA also supports **manual recovery / organizer override**.

If a player cannot complete a node normally, for example:

- GPS is blocked
- GPS fails in the field
- a node is inaccessible
- a mini-game cannot be completed
- the organizer wants to manually advance a team

the player can enter a valid fallback value in the code field.

Current backend accepts progression through:

- automatic `OK` after mini-game success
- `answer`
- `rune`

This allows the organizer to keep the route moving even when real-world conditions fail.

---

## 🎮 Current Mini-games / Interaction Types

Current player code supports these node types:

- `circuit_hack`
- `cryptex`
- `radio_azimuth`
- `gyro_storm`
- `switchboard`
- `simon_says`
- `compass_blow`
- `digital_tuner`

The exact game opened depends on the current node `type`.

Frontend mini-game logic lives mainly in:

    static/minigames_final.js

There is also player-side game logic in:

    templates/game.html

---

## 🧪 Debug Mode

`DEBUG` is intended for local testing and recovery.

What it is useful for:

- testing node flow without real GPS
- simulating access to a node
- validating that the map, objective, and mini-game open correctly
- local development over HTTP where browser geolocation may be blocked

In the current player implementation, debug mode allows local route testing without depending on real field conditions.

---

## 📍 Geolocation / GPS

SAGA player geolocation depends on browser permissions and secure context rules.

### What works

- **HTTPS deployments**: recommended for real player testing
- **Secure public / reverse-proxied access**: recommended for live experiences
- **DEBUG mode**: recommended for local development when real GPS is not available

### What may not work

Opening the player through a local network IP over plain HTTP, for example:

    http://192.168.x.x:8096/player/PLAYER%201

may load the map and nodes correctly, but the browser can block geolocation entirely.

In that case:

- the player may not receive a GPS permission prompt
- real distance updates may not work
- the game can remain locked until GPS is available
- DEBUG mode should be used for local testing

### Recommended testing modes

- **Real GPS test**: deploy behind HTTPS
- **Local UI / flow test**: local HTTP + DEBUG
- **Same-machine test**: `localhost` may work depending on browser and OS, but HTTPS is still the reliable setup

---

## 🔑 Admin Authentication

Admin authentication is now **persistent**.

It is no longer only based on a raw environment variable comparison at request time.

Current behavior:

- admin auth is stored in:

    data/admin_auth.json

- a bootstrap password can be provided through `ADMIN_PASS`
- temporary or insecure passwords can trigger a **forced password change** screen
- the admin panel can block access until a new password is set

This makes admin auth more practical and safer for real use.

### Important

Do **not** commit:

- `.env`
- `data/admin_auth.json`

`data/admin_auth.json` should remain local to the deployment.

---

## 🔒 Forced Password Change Flow

If a temporary or insecure admin password is active, the admin UI can require a password change before access is granted.

Typical use case:

- you bootstrap or reset admin access from terminal
- you log in with the temporary password
- the UI shows:

    CHANGE ADMIN PASSWORD

- the admin cannot continue until a new password is saved

This is useful when recovering access without leaving the system permanently exposed.

---

## 🔁 Change or Reset Admin Password from Terminal

If you control the server, you do not need the old password.
You can replace or reset admin access from terminal.

### Docker: normal bootstrap

    docker rm -f saga_engine_app

    docker run -d \
      --name saga_engine_app \
      -p 8096:5000 \
      -e ADMIN_PASS='YOUR_PASSWORD' \
      -v ~/saga_engine:/app \
      --restart unless-stopped \
      saga_engine:latest

### Docker: force reset from terminal

    docker rm -f saga_engine_app

    docker run -d \
      --name saga_engine_app \
      -p 8096:5000 \
      -e ADMIN_PASS='TEMPORARY_PASSWORD' \
      -e ADMIN_RESET='1' \
      -v ~/saga_engine:/app \
      --restart unless-stopped \
      saga_engine:latest

This resets the stored admin auth and allows you to recover access.

### Local-development fallback only

Only for local development, you may explicitly allow the fallback password:

    ALLOW_DEFAULT_ADMIN=1

If enabled, the system may initialize a temporary default password flow.

This should never be used for real deployments.

---

## ⚙️ Environment

Create a local environment file:

    cp .env.example .env

Typical values:

    ADMIN_PASS=your_password_here
    ALLOW_DEFAULT_ADMIN=0
    ADMIN_RESET=0

### Notes

- `ADMIN_PASS` is required in normal use
- `ALLOW_DEFAULT_ADMIN=1` is for local development only
- `ADMIN_RESET=1` is for password reset / recovery workflows

Do **not** commit `.env`.

---

## 📁 Project Structure

    main.py                  FastAPI backend
    config.json              Global configuration
    .env.example             Example environment file
    Dockerfile               Container build

    data/
      stages.json            Node definitions
      gamestate.json         Player progress
      positions.json         Optional player positions storage
      admin_auth.json        Persistent admin authentication (local only)

    templates/
      login.html             Player selection
      game.html              Player UI
      admin.html             Admin panel

    static/
      minigames_final.js     Frontend mini-game logic

---

## ⚙️ Configuration

Main configuration lives in:

    config.json

You can define:

- Site title
- Admin texts
- Story texts
- Prologue texts
- Map center
- Map zoom
- Players list
- Data directory

Example fields:

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

---

## 🧱 Data Model (Current)

### Global config

Stored in:

    config.json

### Node list

Stored in:

    data/stages.json

Typical per-node fields include:

- `id`
- `title`
- `lat`
- `lon`
- `radius`
- `type`
- `content`
- `config`
- `answer`
- `rune`

### Player progression

Stored in:

    data/gamestate.json

Current format is simple and portable, for example:

    {
      "PLAYER 1": 1,
      "PLAYER 2": 0
    }

---

## 🧪 Local Run (Python)

    python3 -m venv .venv
    source .venv/bin/activate
    pip install fastapi uvicorn jinja2

    export $(grep -v '^#' .env | xargs)

    python -m uvicorn main:app --host 0.0.0.0 --port 8097

---

## 🐳 Docker Run

Example local bind-mount deployment:

    docker run -d \
      --name saga_engine_app \
      -p 8096:5000 \
      -e ADMIN_PASS='your_password_here' \
      -v ~/saga_engine:/app \
      --restart unless-stopped \
      saga_engine:latest

If you are building locally first:

    docker build -t saga_engine .

---

## 🌍 Remote Access

You can expose SAGA with:

- reverse proxy
- VPN
- HTTPS domain
- tunnel solutions

For real player testing on phones and browsers, HTTPS is strongly recommended.

Always protect `/admin`.

---

## 🔒 Security Notes

Before publishing or sharing a deployment:

- do not commit `.env`
- do not commit `data/admin_auth.json`
- do not include credentials
- do not expose `/admin` without protection
- do not rely on temporary or default credentials
- do not publish real player data
- use demo data in public repositories

For real deployments:

- always set `ADMIN_PASS`
- keep `ALLOW_DEFAULT_ADMIN=0`
- use `ADMIN_RESET=1` only when intentionally resetting access
- verify `/admin` is protected
- rotate temporary passwords immediately

---

## 🧰 Use Cases

- Outdoor games
- Treasure hunts
- Tourism routes
- ARG experiences
- Educational activities
- Interactive story routes
- Team challenges

---

## 🚧 Status

Project under active development.

The current public version is already usable as a self-hosted base for:

- geolocated routes
- organizer-controlled progression
- fallback code/rune recovery
- admin-managed custom game flows

Future improvements may include:

- richer node logic
- more admin tools
- more mini-game types
- cleaner data model
- more production-grade frontend packaging

---

## 📄 License

MIT recommended.
