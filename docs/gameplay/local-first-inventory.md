# Local-first inventory foundation

SAGA Engine needs physical gameplay items: keys, runes, clues, NFC cards, QR objects, props and team resources.

Outdoor games can have weak coverage, so inventory state needs a local-first foundation.

## Current foundation

The frontend includes:

`frontend/src/player/offline/inventory.ts`

It provides:

- localStorage-backed inventory snapshots
- item collection
- item usage
- item lookup
- item counting
- text/metadata cleanup
- optional physical event queue integration

## Physical gameplay model

An inventory item can come from:

- QR scan
- NFC open
- manual entry
- system/gameplay action

When `queue_event=true`, collecting an item also queues a compatible physical gameplay event through the offline physical event queue.

## Limits

This PR does not add inventory UI yet.

It does not change backend behavior or stage content.

It provides the local-first frontend foundation so future PRs can add:

- inventory panel in player Tools
- item collection from QR/NFC/manual events
- item requirements for missions
- team/shared inventory patterns
- backend validation and sync rules

## Safety

Inventory payloads are gameplay state only.

Do not store:

- admin credentials
- secrets
- private tokens
- unnecessary personal data
- private operational details

Inventory metadata is text-limited and only keeps simple primitive values.
