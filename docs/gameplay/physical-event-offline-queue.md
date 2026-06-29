# Physical event offline queue

SAGA Engine uses physical interactions such as QR, NFC and manual codes.

Outdoor games can have weak or intermittent coverage, so physical interactions should be captured locally first and synced later.

## Current foundation

The frontend includes:

`frontend/src/player/offline/physicalEvents.ts`

It provides helpers for:

- `queueQrScan()`
- `queueNfcOpen()`
- `queueManualCode()`
- `queuePhysicalEvent()`

These helpers use the local-first queue from:

`frontend/src/player/offline/localFirst.ts`

## Backend compatibility

This PR does not add new backend event types.

It uses existing backend-compatible event types:

- `qr_scanned`
- `nfc_url_opened`

Manual code entry is queued as a physical/manual source using the compatible `qr_scanned` event type, with payload metadata indicating manual entry.

## Coverage behavior

When the player has weak or no network:

- QR/NFC/manual events can be queued locally
- each event gets a `client_event_id`
- duplicate IDs are ignored by the local queue
- attempts/errors are tracked by the offline sync layer

When connectivity returns:

- queued events can be sent to `/api/events/sync`
- accepted events are removed from the local queue

## Safety

Physical event payloads must be gameplay state only.

Do not store:

- secrets
- admin credentials
- private tokens
- raw personal data
- unnecessary precise private locations

Payload text is trimmed and length-limited before being queued.
