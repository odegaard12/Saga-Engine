# Demo gameplay v1: inventory, QR and NFC

This document defines the first complete playable SAGA demo flow.

## Current foundations

SAGA already has GPS gameplay, Signal Hunt, Bearing Hunt, Circuit Matrix, offline mission packs, offline event sync, inventory, QR/NFC/manual physical events and item requirements.

## Demo flow

### Node 1 — Signal Hunt

The player enters the node radius, opens interaction and moves around the real area until the signal locks.

Purpose: validate GPS, debug GPS, proximity gameplay and Signal Hunt.

### Node 2 — Bearing Hunt

The player follows a direction clue until reaching the target area.

Purpose: validate orientation/bearing gameplay.

### Node 3 — QR/NFC item pickup

The player scans a QR, opens NFC, or uses manual fallback to collect an item.

Example item:

- item_id: demo_key
- label: Demo Key
- quantity: 1

Purpose: validate physical interactions and inventory collection.

### Node 4 — Circuit Matrix with item requirement

The player must own demo_key before completing the puzzle.

Recommended requirement shape:

{
  "requirements": {
    "items": [
      {
        "item_id": "demo_key",
        "label": "Demo Key",
        "quantity": 1,
        "consume": true
      }
    ]
  }
}

Purpose: validate item-gated progression.

### Node 5 — Final validation

The player reaches the final node and completes the mission with QR, NFC or manual fallback.

Purpose: validate end-to-end mission completion.

## Debug rules

Normal play must use real GPS.

Debug play may simulate the player position, but only when debug is explicitly enabled.

Minigames must receive the same debug position as the main player map.

Debug mode must never become the default for normal users.

## Privacy rules

Do not commit runtime SQLite databases, runtime positions, private players, audit folders, .env files, tunnel tokens or private coordinates.

## Validation checklist

Run:

- python scripts/check_audit_guards.py --base origin/main
- cd frontend && npm run build

Manual smoke:

- public home loads
- /api/config returns JSON
- /api/game/<player> returns JSON
- Signal Hunt opens
- debug mode works without browser console
- Tools and inventory panels are readable
- QR/NFC/manual event flow is visible from Tools or interaction UI
