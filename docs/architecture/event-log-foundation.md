# Event Log Foundation

SAGA needs an event log for offline sync, QR/NFC physical checkpoints, cooperative team actions, inventory, admin actions and future SQLite-backed storage.

The event log is not a replacement for the current runtime yet. It is a foundation layer.

## Why events

Outdoor games can lose connectivity. When this happens, the player app must be able to queue actions locally and synchronize them later.

Examples:

- a player opens a node
- a node is completed
- a QR marker is scanned
- an NFC URL is opened
- a player confirms team readiness
- a captain collects a team proof
- an inventory item is collected
- an offline queue is synchronized later

All of these are events.

## Initial event types

The first backend event log supports:

- heartbeat_received
- node_opened
- node_completed
- qr_scanned
- nfc_url_opened
- team_ready
- team_proof_created
- team_proof_accepted
- inventory_item_collected
- offline_sync_received
- admin_action

## Event shape

Events use a small generic shape:

- id
- type
- status
- source
- created_at
- user
- team_id
- node_id
- payload

Example:

{
  "id": "evt_example",
  "type": "qr_scanned",
  "status": "pending",
  "source": "qr",
  "created_at": "2026-05-08T12:00:00+00:00",
  "user": "PLAYER 1",
  "team_id": "team-a",
  "node_id": "node-01",
  "payload": {
    "physical_id": "node-01-abcd"
  }
}

## Status values

- pending
- synced
- failed
- ignored

## Privacy boundary

Events must not contain:

- admin credentials
- backend secrets
- raw admin auth data
- private logs
- backups
- unnecessary private paths
- sensitive free-text dumps

Physical ids are checkpoint identifiers, not admin secrets.

## Storage direction

The current implementation stores events in JSON using locked read-modify-write helpers.

This is temporary but useful.

The future direction is:

1. JSON event log foundation.
2. Backend append/list/mark APIs.
3. Offline player queue sync endpoint.
4. SQLite event table.
5. Event-based reconciliation for progress, QR/NFC, team rules and inventory.
