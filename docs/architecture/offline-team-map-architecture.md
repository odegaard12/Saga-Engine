# Offline, Team and Map Architecture

SAGA Engine must support real outdoor games where mobile coverage can be weak or unavailable.

The main server can live behind a public HTTPS domain such as `sagagia.odegaard12.es`, but routes may happen far away from the server. If the player has no mobile data, the phone cannot reach the remote backend in real time.

Therefore SAGA must support downloadable missions, local progress, offline team proof patterns, QR/NFC physical checkpoints and offline map fallback.

## Product goal

Players should be able to:

1. Open the mission while they still have internet.
2. Download the mission to the phone.
3. Go to the route.
4. Continue playing if coverage disappears.
5. Store important actions locally.
6. Synchronize progress when internet returns.

The engine should not require carrying a Raspberry Pi or local server to every route.

## Connectivity modes

### Live mode

The player can reach the backend through the public HTTPS domain.

Live mode supports:

- fresh game payloads
- heartbeat
- team presence
- live player map
- real-time team validation
- admin Mission Control visibility
- immediate progress sync

### Offline solo mode

The player has a downloaded mission pack but cannot reach the backend.

Offline solo mode supports:

- opening the downloaded mission
- reading nodes and instructions
- local GPS checks
- QR/NFC checkpoint scans
- local progress
- pending sync events

### Offline team physical mode

Phones cannot reliably communicate with each other in real time from a web/PWA app if there is no internet, no local WiFi/server and no native app.

Offline team play should therefore use physical/local proof patterns:

- all players scan the same QR/NFC checkpoint
- each player sees a different clue
- each player generates a local proof code/QR
- a captain collects player proofs
- the team enters a shared rune/code
- progress is marked as pending sync

This keeps team play possible without pretending that browser Bluetooth is universal across Android and iPhone.

### Optional local server mode

A future optional mode can support a Raspberry Pi or mini-server carried to the route.

If used, all teams should connect to one shared local network/server, not one network per team.

This is useful but must not be required.

## Mission pack

A mission pack is the downloadable player-facing copy of a mission.

It can include:

- mission id
- mission version
- public config
- sanitized stages
- node titles and copy
- node coordinates and radius
- interaction family and player-safe config
- QR/NFC physical ids
- team rule metadata
- inventory metadata
- route geometry
- offline map package references
- downloaded_at timestamp

It must not include:

- admin password
- backend secrets
- admin auth files
- private logs
- backups
- unnecessary private paths
- hidden answers/runes unless intentionally needed for offline validation

## Local storage

The player app should store offline data locally.

Recommended stores:

### mission_pack

Downloaded mission snapshot.

### local_progress

Local progress:

- current level
- completed nodes
- seen hints
- collected items
- scanned physical checkpoints
- local GPS confirmations
- offline team proof status

### event_queue

Pending events for backend synchronization:

- gps_sample
- heartbeat
- node_opened
- node_completed
- qr_scanned
- nfc_url_opened
- team_ready
- team_proof_created
- team_proof_accepted
- inventory_item_collected
- sync_attempt

Events should have stable ids/idempotency keys so replay does not duplicate progress.

## Team model

Teams stay in SAGA.

There are two team modes:

### Live team mode

When the backend is reachable:

- server validates team presence
- server validates simultaneous actions
- server sees who completed each step
- admin sees team progress live

### Offline team physical mode

When the backend is not reachable:

- each phone can continue locally
- completion uses QR/NFC, codes, proofs or shared clues
- actions are queued locally
- backend reconciles later

This model fits routes where teams walk together.

## Cooperative mechanics

Good mechanics for teams that walk together:

1. Group Presence Gate  
   All players must be near the same node.

2. QR/NFC Physical Checkpoint  
   The team scans a hidden physical marker.

3. GPS + QR Lock  
   The node requires proximity plus a physical scan.

4. Team Ready Sync  
   Everyone confirms readiness within a time window.

5. Captain Proof  
   Each player completes a part and gives a proof to the captain.

6. Split Clue Puzzle  
   Each player sees a different clue; the team combines them.

7. Shared Inventory Lock  
   The team needs collected items to unlock the node.

8. Circuit Repair  
   Different players perform steps in a circuit/puzzle sequence.

9. Zone Capture  
   The team stays inside an area for a period of time.

10. Final Team Ritual  
   QR/NFC + code + team confirmation.

## Bluetooth and device proximity

Bluetooth must not be required for core gameplay.

Web Bluetooth can be an optional capability check or future enhancement, especially for Android or external BLE beacons, but it should not be the base for Android + iPhone team play.

Preferred cross-platform proof methods:

- GPS proximity
- same QR/NFC marker
- shared code/rune
- captain proof scan
- local event queue
- backend validation when online

## QR/NFC design

QR is the universal physical checkpoint.

NFC should normally be written as a URL tag that opens SAGA.

Example URL:

https://sagagia.odegaard12.es/scan/node-03-x7k9

A physical id is not an admin secret. It is a checkpoint identifier.

For stronger gameplay, combine scans with:

- GPS proximity
- time windows
- team confirmation
- inventory requirements
- hidden clues
- runes/codes
- captain proof

## Offline maps

SAGA should support good offline route guidance without bulk downloading public map tiles.

Recommended phases:

### Phase 1: Offline route fallback

- downloaded nodes
- route line
- distance to active node
- direction arrow to active node
- simple fallback background if map tiles are unavailable
- GPS marker
- next-node guidance

### Phase 2: Offline route geometry

- precomputed walking/driving route geometry
- downloadable route line
- show path/camino instead of only straight-line guidance

The route should be computed before the mission and downloaded with the mission pack.

### Phase 3: Offline map package

- downloadable mission-area map package
- route area plus configurable buffer
- possible PMTiles/MBTiles-style package
- mission-scoped map, not global map of everything

## Implementation roadmap

Recommended PR order:

1. Downloadable mission pack foundation.
2. PWA install/cache shell.
3. Offline event queue and sync status.
4. QR/NFC physical checkpoints.
5. Offline route fallback with line and direction arrow.
6. Team proof foundation.
7. Cooperative team rules foundation.
8. Inventory/object foundation.
9. Offline map package support.
10. Game template catalog v2 based on physical/team/offline mechanics.

## Safety and privacy

Offline and physical systems must not expose:

- admin credentials
- secrets
- backend tokens
- raw live data
- private logs
- backups
- admin auth files
- unnecessary private coordinates

Mission packs should be sanitized player-facing payloads.
