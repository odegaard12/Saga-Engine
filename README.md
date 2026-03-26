# 🚀 SAGA Engine

SAGA is a self-hosted engine for creating geolocated games, real-world routes, and interactive node-based experiences.

Design your own adventures. Control everything. Deploy anywhere.

---

## ✨ Features

- Interactive map-based gameplay
- Player selection system
- Node-based progression
- Mini-games per node
- Admin panel (full control)
- Fully configurable (titles, story, players)
- JSON-based storage (simple & portable)
- Ready for remote access (Cloudflare, VPN, etc.)

---

## 🧠 Concept

SAGA works around nodes.

Each node is a real-world location that can include:

- Coordinates
- Activation radius
- A mini-game or interaction
- Custom text or instructions

Players move through the route, unlock nodes, and progress through the experience.

---

## 🖥️ Interface Overview

### Player Selection
Route: /

Players choose a profile and start the experience.

---

### Game Interface
Route: /player/<name>

- Map
- Current objective
- Node interaction
- Progress tracking

---

### Admin Panel
Route: /admin

Control everything:

- Titles and subtitles
- Story and prologue
- Players
- Map settings
- Nodes (create / edit / delete)

Nodes can also be created directly by clicking on the map.

---

## 🔄 Game Flow

1. Player enters the game
2. System loads progression
3. Active node is determined
4. Player interacts with node
5. Completes challenge
6. Progress is saved

---

## 🎮 Mini-games

Handled in frontend:

static/minigames_final.js

Each node can trigger a different type of interaction.

---

## 📁 Project Structure

main.py                  → FastAPI backend  
config.json              → Global configuration  

data/  
  stages.json            → Nodes  
  gamestate.json         → Player progress  
  positions.json         → Player positions  

templates/  
  login.html             → Player selection  
  game.html              → Game UI  
  admin.html             → Admin panel  

static/  
  minigames_final.js     → Game logic  

---

## ⚙️ Configuration

Edit config.json:

- Titles
- Story
- Prologue
- Players
- Map center and zoom

---

## 🔐 Environment

Create .env:

cp .env.example .env

Set:

ADMIN_PASS=your_password

Never commit .env

---

## 🧪 Local Run

python3 -m venv .venv  
source .venv/bin/activate  
pip install fastapi uvicorn jinja2  

export $(grep -v '^#' .env | xargs)  

python -m uvicorn main:app --host 0.0.0.0 --port 8097  

---

## 🌍 Remote Access

You can expose SAGA using:

- Reverse proxy
- VPN
- Cloudflare Tunnel

Always protect /admin

---

## 🔒 Security

Before publishing:

- Do not commit .env
- Do not include credentials
- Do not include private URLs
- Do not include real user data

Use only generic demo data

---

## 🧰 Use Cases

- Outdoor games
- Treasure hunts
- Tourism routes
- ARG experiences
- Educational activities

---

## 📄 License

MIT recommended

---

## 🚧 Status

Project under active development

