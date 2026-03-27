# 🚀 SAGA Engine

SAGA is a self-hosted engine for building geolocated games, real-world routes, and interactive node-based experiences.

Design your own adventure, host it yourself, and control the full player flow.

---

## ✨ Features

- Interactive map-based gameplay
- Player selection system
- Node-based progression
- Mini-games per node
- Admin panel for editing game content
- JSON-based data storage
- Self-hosted deployment
- Docker-friendly setup
- Suitable for local testing and remote HTTPS deployments

---

## 🧠 Concept

SAGA works around **nodes**.

Each node is a real-world location that can include:

- Coordinates
- Activation radius
- A mini-game or interaction
- Custom text or instructions
- A rune or code
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

- Map
- Current objective
- Distance to active node
- Rune/code input
- Debug mode
- Mini-game modal

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

## 🔄 Game Flow

1. Player enters the game
2. Current progression is loaded
3. Active node is determined
4. Map and objective are rendered
5. Distance to node is evaluated
6. Player enters node area
7. Mini-game or interaction is completed
8. Progress is saved
9. Next node becomes active

---

## 🎮 Mini-games

Mini-game frontend logic lives in:

    static/minigames_final.js

The exact game opened depends on the current node `type`.

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

    templates/
      login.html             Player selection
      game.html              Player UI
      admin.html             Admin panel

    static/
      minigames_final.js     Frontend mini-game logic

---

## ⚙️ Configuration

Main configuration lives in `config.json`.

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

## 🔐 Environment

Create a local environment file:

    cp .env.example .env

Normal setup:

    ADMIN_PASS=your_password_here

Optional local-development fallback only:

    ALLOW_DEFAULT_ADMIN=1

### Important

Do **not** commit `.env`.

### Admin password management

The admin password is read from the `ADMIN_PASS` environment variable.

In the current hardened setup:

- `ADMIN_PASS` is required in normal use
- the app will not start without `ADMIN_PASS`
- the only exception is local development when you explicitly set:

    ALLOW_DEFAULT_ADMIN=1

If you enable that fallback, the admin password becomes:

    CHANGE_ME

That fallback is for local development only and should never be used in a real deployment.

### Change or reset the admin password from terminal

If you control the server, you do not need the old password.
Just set a new `ADMIN_PASS` value and restart the app.

Docker example:

    docker rm -f saga_engine_app

    docker run -d       --name saga_engine_app       -p 8096:5000       -e ADMIN_PASS='YOUR_NEW_PASSWORD'       -v ~/saga_engine:/app       --restart unless-stopped       saga-engine

Python example:

    export ADMIN_PASS='YOUR_NEW_PASSWORD'
    python -m uvicorn main:app --host 0.0.0.0 --port 8097

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
      saga-engine

If you are building locally first:

    docker build -t saga-engine .

---

## 📍 Geolocation / GPS

SAGA player geolocation depends on browser permissions and secure context rules.

### What works

- **HTTPS deployments**: recommended for real player testing
- **Secure public/reverse-proxied access**: recommended for live experiences
- **DEBUG mode**: recommended for local development when real GPS is not available

### What may not work

Opening the player through a local network IP over plain HTTP, for example:

    http://192.168.x.x:8096/player/PLAYER%201

may load the map and nodes correctly, but the browser can block geolocation entirely.

In that case:

- The player may not receive a GPS permission prompt
- Real distance updates may not work
- The game can remain locked until GPS is available
- DEBUG mode should be used for local testing

### Recommended testing modes

- **Real GPS test**: deploy behind HTTPS
- **Local UI / game flow test**: local HTTP + DEBUG
- **Same-machine test**: `localhost` may work depending on browser and OS, but HTTPS is still the reliable setup

---

## 🧪 Debug Mode

DEBUG mode is useful for:

- Testing local gameplay flow
- Testing node interaction without GPS
- Validating UI and mini-game opening
- Verifying progression logic during development

Use DEBUG when testing over local HTTP if browser geolocation is blocked.

---

## 🌍 Remote Access

You can expose SAGA with:

- Reverse proxy
- VPN
- HTTPS domain
- Tunnel solutions

For real player testing on phones and browsers, HTTPS is strongly recommended.

Always protect `/admin`.

---

## 🔒 Security Notes

Before publishing or sharing a deployment:

- Do not commit `.env`
- Do not include credentials
- Do not expose `/admin` without protection
- Do not rely on default credentials
- Do not publish real player data
- Use demo data in public repositories

### Admin password warning

The app now requires `ADMIN_PASS` unless you explicitly enable the local-development fallback with:

    ALLOW_DEFAULT_ADMIN=1

If you enable that fallback, the password becomes:

    CHANGE_ME

For real deployments:

- always set `ADMIN_PASS`
- keep `ALLOW_DEFAULT_ADMIN=0`
- verify `/admin` is protected
- never leave default credentials active

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

Current public version is intended as a clean, self-hosted base that can be adapted for custom experiences.

---

## 📄 License

MIT recommended.
